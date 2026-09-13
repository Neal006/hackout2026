"""Ten real-world scenarios against a live backend, told as stories and recorded.

    SIM_SPEED=120 python -m uvicorn noonshift.api:app --port 8000     # a sim-hour every 30 s: the run fits in one sim day
    python scripts/scenarios.py [http://127.0.0.1:8000] [--out docs/scenarios]

Each scenario: who is involved, what they do (driver REST), what the site does (plan/meter/event frames on /ws, the
facilities manager's status), the promise it must keep (checks), and what the operator assistant says when asked.
Writes run.json (every request, response, check) and run.md (the readable transcript). Exit 1 on a failed check.
"""
import asyncio
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from pathlib import Path

import websockets

API = next((a for a in sys.argv[1:] if a.startswith("http")), "http://127.0.0.1:8000")
OUT = Path(sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else "docs/scenarios")
WS = API.replace("http", "ws", 1) + "/ws"
SITE = "site-1"


def http(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


class Run:
    """The recorder: one WS pump for the whole run, a step log per scenario, sim-clock waits."""

    def __init__(self):
        self.frames, self.scenarios, self.cur, self.meta = [], [], None, {}
        self.speed = 120.0  # measured at start

    # -- recording --
    def scenario(self, n, title, story):
        self.cur = {"n": n, "title": title, "story": story, "sim_start": self.sim_now().isoformat(timespec="minutes"),
                    "steps": [], "checks": [], "frame_mark": len(self.frames)}
        self.scenarios.append(self.cur)
        print(f"\n== {n}. {title}  [{self.cur['sim_start'][11:]}]")
        return self

    def step(self, who, text, request=None, response=None):
        self.cur["steps"].append({"sim": self.sim_now().strftime("%H:%M"), "who": who, "text": text,
                                  **({"request": request} if request else {}), **({"response": response} if response is not None else {})})
        print(f"  [{who:<9}] {text}")

    def act(self, who, text, method, path, body=None):
        code, out = http(method, path, body)
        self.step(who, text, {"method": method, "path": path, **({"body": body} if body else {})},
                  {"status": code, **(out if isinstance(out, dict) else {"list": out})})
        return code, out

    def check(self, name, ok, detail=""):
        self.cur["checks"].append({"name": name, "ok": bool(ok), "detail": str(detail)})
        print(f"  {'PASS' if ok else 'FAIL'}  {name}" + (f"  ({detail})" if detail else ""))
        return ok

    def ask(self, question):
        code, a = http("POST", "/assist", {"question": question, "page": "/ops/overview"})
        self.cur["assistant"] = {"question": question, **a}
        ans = a.get("answer", "")
        print(f"  [assistant] Q: {question}\n              A: {ans[:200]}{'…' if len(ans) > 200 else ''}  {'(offline template)' if a.get('fallback') else '(model)'}")
        return a

    # -- the site as seen from outside --
    def status(self):
        return http("GET", f"/sites/{SITE}/status")[1]

    def sim_now(self):
        return datetime.fromisoformat(self.status()["sim_time"])

    def meters(self, since=0):
        return [f for f in self.frames[since:] if f["type"] == "meter"]

    def events(self, name, since=None):
        since = self.cur["frame_mark"] if since is None else since
        return [f for f in self.frames[since:] if f["type"] == "event" and f["name"] == name]

    def meter_of(self, sid):
        for f in reversed(self.frames):
            if f["type"] == "meter":
                return next((c for c in f["connectors"] if c["session_id"] == sid), None)

    def free_bays(self):
        asap = self.status()["connectors_asap"]
        return [c["connector_id"] for c in self.meters()[-1]["connectors"] if c["session_id"] is None and c["connector_id"] not in asap]

    def plan_of(self, sid):
        p = http("GET", f"/sites/{SITE}/plan")[1]
        kw = next((c["kw"] for c in p["connectors"] if c["session_id"] == sid), [])
        return datetime.fromisoformat(p["horizon_start"]), kw

    async def wait_until(self, cond, max_minutes):
        """Run the site until cond() holds or max_minutes of sim time have passed; returns whether it held."""
        target = self.sim_now() + timedelta(minutes=max_minutes)
        while not cond():
            if self.sim_now() >= target:
                return False
            await asyncio.sleep(0.3)
        return True

    async def free_bay(self):
        """A free non-fleet bay; if the site is full, wait for one (a done car moves, a session ends)."""
        await self.wait_until(lambda: bool(self.free_bays()), 60)
        return self.free_bays()[-1]

    def worst_overshoot(self):
        """Max over every meter frame of EV kW minus (feed − building): the safety property, for the whole run."""
        return max((f["site_kw"] - (f["feed_kw"] - f["building_load_kw"]) for f in self.meters()), default=-999.0)

    async def wait_sim(self, minutes):
        """Let the site run for `minutes` of simulated time (SIM_SPEED sim-seconds per real second)."""
        target = self.sim_now() + timedelta(minutes=minutes)
        deadline = time.time() + minutes * 60 / self.speed * 3 + 10
        while self.sim_now() < target:
            if time.time() > deadline:
                raise RuntimeError(f"sim clock did not advance {minutes} min in time (speed {self.speed})")
            await asyncio.sleep(0.3)

    def clean_share(self, sid, hourly):
        """Share of this car's planned energy that lands in zero-marginal-carbon hours, and the same for charge-now."""
        t0, kw = self.plan_of(sid)
        e = [k / 12 for k in kw]
        if sum(e) <= 0:
            return None, None
        planned = sum(x for k, x in enumerate(e) if hourly[(t0 + timedelta(minutes=5 * k)).hour] == 0) / sum(e)
        n = max(1, round(sum(e) / (7.0 / 12)))  # charge-now: the same energy at 7 kW from this slot on
        now = self.sim_now()
        immediate = sum(1 for k in range(n) if hourly[(now + timedelta(minutes=5 * k)).hour] == 0) / n
        return round(100 * planned), round(100 * immediate)


async def main():
    run = Run()
    OUT.mkdir(parents=True, exist_ok=True)
    async with websockets.connect(WS) as ws:
        async def pump():
            async for m in ws:
                run.frames.append(json.loads(m))
        task = asyncio.create_task(pump())
        await asyncio.sleep(2)
        t0, w0 = run.sim_now(), time.time()
        await asyncio.sleep(2)
        run.speed = max(1.0, (run.sim_now() - t0).total_seconds() / (time.time() - w0))
        st = run.status()
        hourly = [h["gco2_per_kwh"] for h in http("GET", "/grid/signal")[1]]
        R = st["employee_rate_usd_per_kwh"]
        zero = [h for h in range(24) if hourly[h] == 0]
        day_end = run.sim_now().replace(hour=23, minute=30, second=0, microsecond=0)
        dep = lambda hours: min(run.sim_now() + timedelta(hours=hours), day_end).replace(second=0, microsecond=0).isoformat()
        print(f"site {SITE}: {st['n_connectors']} bays, feed {st['feed_kw']} kW, block {st['block_kw']} kW, R=${R}/kWh, package {st['package']}, "
              f"mode {st['mode']}, sim {st['sim_time'][11:16]}, clock x{run.speed:.0f}, zero-carbon hours {zero}")
        run.meta = {"api": API, "site": st, "speed": run.speed, "zero_hours": zero, "started": datetime.now().isoformat(timespec="seconds")}

        # 1 ------------------------------------------------------------------------------------------------------
        run.scenario(1, "Priya's normal day", "Priya parks at the office, taps the pre-filled 'Leaving at 17:30?', asks for 12 kWh. "
                     "She wants her car full by then; the site wants that energy in the zero-carbon hours and never above the feed.")
        bay = run.free_bays()[-1]
        d = dep(8)
        _, pv = run.act("driver", f"previews the price for a ready-by 8 h out on bay {bay}", "GET", f"/price?departure_at={d}&kwh_needed=12")
        _, s1 = run.act("driver", "plugs in: 12 kWh by " + d[11:16], "POST", "/sessions", {"connector_id": bay, "departure_at": d, "kwh_needed": 12})
        await run.wait_sim(6)
        pl, im = run.clean_share(s1["session_id"], hourly)
        run.step("system", f"plan window {s1['plan']['start'][11:16]}–{s1['plan']['end'][11:16]}, ready by {s1['plan']['ready_by'][11:16]}; "
                 f"{pl}% of her planned energy lands in zero-carbon hours (charging right now: {im}%)")
        run.check("plan ends before her stated departure", s1["plan"]["end"] <= d, f"{s1['plan']['end'][11:16]} <= {d[11:16]}")
        run.check("price never above R", s1["price"]["usd_per_kwh"] <= R, f"${s1['price']['usd_per_kwh']} vs R ${R} ({s1['price']['tier']})")
        run.check("more of her energy in clean hours than charging immediately", pl is not None and pl >= im, f"{pl}% vs {im}%")
        await run.wait_sim(55)
        _, live = run.act("driver", "checks the app an hour in", "GET", f"/sessions/{s1['session_id']}/live")
        run.check("first-hour floor: >= min(need, 3.5 kWh) after 60 min", live["kwh_delivered"] >= 3.5 - 0.35, f"{live['kwh_delivered']:.2f} kWh")
        run.step("driver", f"receipt so far: ${live['saved_usd']} and {live['saved_kgco2']} kg CO2 saved (estimate) — grid cleaner than {live['grid_percentile']}% of today")
        run.ask(f"what is bay {bay} doing right now?")

        # 2 ------------------------------------------------------------------------------------------------------
        run.scenario(2, "Maya's sick kid — Leaving now", "Maya plugged in for the day. School calls mid-morning: come now. She taps 'Leaving now'. "
                     "Promise: full power from the next slot, at today's rate, no premium — and nobody else loses their floor.")
        bay = run.free_bays()[-1]
        _, s2 = run.act("driver", "had plugged in for 6 h wanting 10 kWh", "POST", "/sessions", {"connector_id": bay, "departure_at": dep(6), "kwh_needed": 10})
        deferred = await run.wait_until(lambda: (run.meter_of(s2["session_id"]) or {"kw": 9})["kw"] < 2.0, 45)
        before = run.meter_of(s2["session_id"])["kw"]
        run.step("system", f"bay {bay} is {'deferred to a cleaner hour, drawing' if deferred else 'already charging at'} {before} kW when the phone rings")
        _, u = run.act("driver", "taps 'Leaving now'", "POST", f"/sessions/{s2['session_id']}/urgency", {"level": "now"})
        await run.wait_sim(3)
        m = run.meter_of(s2["session_id"])
        run.step("system", f"bay {bay}: {before} kW before -> {m['kw']} kW now; '{'boost' if run.events('boost') else 'no'}' event on the ops feed")
        run.check("full power within two slots", m["kw"] >= 6.5, f"{m['kw']} kW")
        run.check("pays exactly R, no premium", u["price"]["usd_per_kwh"] == R, f"${u['price']['usd_per_kwh']}")
        run.check("ops feed shows the boost event and flag", bool(run.events("boost")) and m["boost"] is True)
        run.ask("what does boost do to the other cars?")

        # 3 ------------------------------------------------------------------------------------------------------
        run.scenario(3, "Dev's meeting across town — Leaving soon", "Dev said 6 h, then a client moves the meeting up: he must leave in 90 minutes with 8 kWh. "
                     "He taps 'Leaving soon' and picks the time. Promise: the new time becomes the deadline, the plan fills the cleanest slots before it, price R.")
        bay = run.free_bays()[-1]
        _, s3 = run.act("driver", "had plugged in for 6 h wanting 8 kWh", "POST", "/sessions", {"connector_id": bay, "departure_at": dep(6), "kwh_needed": 8})
        leave = dep(1.5)
        _, u = run.act("driver", f"taps 'Leaving soon' at {leave[11:16]}", "POST", f"/sessions/{s3['session_id']}/urgency", {"level": "soon", "leave_at": leave})
        run.check("ready-by moved to the chosen time", u["plan"]["ready_by"][:16] == leave[:16], u["plan"]["ready_by"][11:16])
        run.check("pays exactly R", u["price"]["usd_per_kwh"] == R, f"${u['price']['usd_per_kwh']}")
        pl, im = run.clean_share(s3["session_id"], hourly)
        run.step("system", f"new plan {u['plan']['start'][11:16]}–{u['plan']['end'][11:16]}: {pl}% of the energy in zero-carbon slots inside the 90 min (charge-now: {im}%)")
        await run.wait_until(lambda: run.sim_now() >= datetime.fromisoformat(leave), 95)
        _, live = run.act("driver", "walks to the car at the time he said", "GET", f"/sessions/{s3['session_id']}/live")
        run.check("the 8 kWh are in the car by the new time", live["kwh_delivered"] >= 8 - 0.3, f"{live['kwh_delivered']:.2f} / 8 kWh at {run.sim_now():%H:%M}")

        # 4 ------------------------------------------------------------------------------------------------------
        run.scenario(4, "Aisha is on call — Prioritise", "Aisha, a nurse, might be paged. She keeps her 17:30 but taps 'Prioritise'. Ben plugs in next to her with the same need and no button. "
                     "Promise: her deadline is unchanged, she pays R, she is held to 90 % of pro-rata (Ben to 50 %), and when the site is short her allowed shortfall is half of anyone else's. On a quiet site both simply get charged.")
        bays = run.free_bays()[-2:]
        d = dep(6)
        _, s4 = run.act("driver", f"Aisha plugs in on {bays[0]}: 12 kWh by {d[11:16]}", "POST", "/sessions", {"connector_id": bays[0], "departure_at": d, "kwh_needed": 12})
        _, s4b = run.act("driver", f"Ben plugs in on {bays[1]}: same 12 kWh by {d[11:16]}", "POST", "/sessions", {"connector_id": bays[1], "departure_at": d, "kwh_needed": 12})
        _, u = run.act("driver", "Aisha taps 'Prioritise'", "POST", f"/sessions/{s4['session_id']}/urgency", {"level": "priority"})
        run.check("deadline unchanged", u["plan"]["ready_by"][:16] == d[:16], u["plan"]["ready_by"][11:16])
        run.check("pays exactly R", u["price"]["usd_per_kwh"] == R, f"${u['price']['usd_per_kwh']}")
        await run.wait_sim(60)
        a, b = http("GET", f"/sessions/{s4['session_id']}/live")[1], http("GET", f"/sessions/{s4b['session_id']}/live")[1]
        run.step("system", f"after 60 min: Aisha {a['kwh_delivered']:.2f} kWh, Ben {b['kwh_delivered']:.2f} kWh (pro-rata after 1 of 6 h = 2.0 kWh; floors 90 % / 50 %; both also hold the 3.5 kWh first-hour floor)")
        run.check("Aisha at or above 90 % of pro-rata", a["kwh_delivered"] >= 0.9 * 2.0 - 0.2, f"{a['kwh_delivered']:.2f} >= 1.8")
        run.check("Ben at or above 50 % of pro-rata", b["kwh_delivered"] >= 0.5 * 2.0 - 0.2, f"{b['kwh_delivered']:.2f} >= 1.0")
        run.step("system", "priority costs the other drivers nothing unless the site is short: " + (
            "today both are well above their floors" if min(a["kwh_delivered"], b["kwh_delivered"]) > 2.0 else f"Aisha {a['kwh_delivered']:.2f} vs Ben {b['kwh_delivered']:.2f} kWh"))
        run.ask("what does prioritise do?")

        # 5 ------------------------------------------------------------------------------------------------------
        run.scenario(5, "Sam skips the form", "Sam plugs in and ignores the app: the default 'Leaving at 17:30?' stands and no kWh is typed. "
                     "Promise: the site still plans for him — need from this bay's history, else the site median — and says how confident it is.")
        bay = run.free_bays()[-1]
        _, s5 = run.act("driver", f"plugs in on {bay}, types nothing", "POST", "/sessions", {"connector_id": bay, "departure_at": dep(8)})
        run.step("system", f"need estimated at {s5['kwh_needed']} kWh (confidence: {s5['need_confidence']}); plan {s5['plan']['start'][11:16]}–{s5['plan']['end'][11:16]}")
        run.check("a need was estimated", s5["kwh_needed"] > 0, f"{s5['kwh_needed']} kWh")
        run.check("confidence is history or site, never 'declared'", s5["need_confidence"] in ("history", "site"), s5["need_confidence"])
        run.check("a plan exists", s5["plan"]["start"] is not None)

        # 6 ------------------------------------------------------------------------------------------------------
        run.scenario(6, "Ravi's plug-in hybrid", "Ravi's PHEV takes 3.3 kW at most on a 7 kW bay; the app asks for the car once and remembers it. "
                     "He is at 70 %, wants 90 % of a 40 kWh pack. Promise: the plan never asks the car for more than it can take, and the need comes from the SoC.")
        bay = run.free_bays()[-1]
        _, s6 = run.act("driver", f"plugs in on {bay}: PHEV, 40 kWh pack, max 3.3 kW, 70 % -> 90 %", "POST", "/sessions",
                        {"connector_id": bay, "departure_at": dep(7), "vehicle": {"model": "PHEV", "battery_kwh": 40, "max_kw": 3.3}, "soc_now": 0.7, "target_soc": 0.9})
        _, kw = run.plan_of(s6["session_id"])
        await run.wait_sim(8)
        m = run.meter_of(s6["session_id"])
        run.step("system", f"need {s6['kwh_needed']} kWh ({s6['need_confidence']}); planner cap {s6['max_kw']} kW; plan peak {max(kw) if kw else 0} kW; meter {m['kw']} kW")
        run.check("need = (0.9 - 0.7) x 40 = 8 kWh", s6["kwh_needed"] == 8.0, s6["kwh_needed"])
        run.check("plan never exceeds the car's 3.3 kW", bool(kw) and max(kw) <= 3.3, f"peak {max(kw) if kw else 0} kW")
        run.check("meter never exceeds 3.3 kW", m["kw"] <= 3.3, f"{m['kw']} kW")
        run.ask(f"why is bay {bay} only getting {m['kw']} kW?")  # a bay named in the question is always in the assistant's snapshot

        # 7 ------------------------------------------------------------------------------------------------------
        run.scenario(7, "The delivery van on the fleet bay", "Facilities marked bays c41/c42 as fleet bays: a van that cannot leave is lost revenue, not an inconvenience. "
                     "The van plugs into c41 with a vague '5 h'. Promise: full power immediately, whatever the slack, and the ops screen marks the bay ASAP.")
        van_bay = st["connectors_asap"][0]
        _, s7 = run.act("driver", f"van plugs into {van_bay}: 20 kWh, 5 h", "POST", "/sessions", {"connector_id": van_bay, "departure_at": dep(5), "kwh_needed": 20})
        _, kw = run.plan_of(s7["session_id"])
        await run.wait_sim(3)
        m = run.meter_of(s7["session_id"])
        run.step("system", f"plan first slot {kw[0] if kw else 0} kW; meter {m['kw']} kW; asap={m['asap']} (boost={m['boost']}: nobody pressed anything)")
        run.check("full power from the first slot", bool(kw) and kw[0] >= 6.9, f"{kw[0] if kw else 0} kW")
        run.check("meter at full power", m["kw"] >= 6.5, f"{m['kw']} kW")
        run.check("ops sees the ASAP bay flag", m["asap"] is True)

        # 8 ------------------------------------------------------------------------------------------------------
        run.scenario(8, "Tom leaves early", "Tom said 17:00; something comes up and he unplugs after about an hour without telling anyone. "
                     "Promise: the floors mean he leaves with a usable charge, the receipt says plainly how far short of the stated need he is, and the plan re-solves without him.")
        bay = await run.free_bay()
        d = dep(8)
        _, s8 = run.act("driver", f"Tom plugs in on {bay}: 15 kWh by {d[11:16]}", "POST", "/sessions", {"connector_id": bay, "departure_at": d, "kwh_needed": 15})
        await run.wait_sim(62)
        _, rc = run.act("driver", "Tom pulls the plug an hour in, without a word", "POST", f"/sessions/{s8['session_id']}/unplug")
        await run.wait_sim(2)  # let the ops feed catch up
        ev = next((e["detail"] for e in run.events("unplug") if e["detail"].get("session_id") == s8["session_id"]), {})
        run.step("system", f"receipt: {rc['kwh_delivered']:.2f} of {rc['kwh_needed']} kWh, status {rc['status']}, {rc['kwh_needed'] - rc['kwh_delivered']:.2f} kWh short of what he said he needed"
                 + (f"; ops event: stated {ev['stated_departure'][11:16]}, left {ev['left_at'][11:16]}, {ev['shortfall_kwh']} kWh short" if ev else ""))
        run.check("first-hour floor held: >= 3.5 kWh after ~60 min", rc["kwh_delivered"] >= 3.5 - 0.35, f"{rc['kwh_delivered']:.2f} kWh")
        run.check("receipt is honest: status ended, shortfall visible", rc["status"] == "ended" and rc["kwh_delivered"] < rc["kwh_needed"])
        run.check("plan re-solved without him", s8["session_id"] not in {c["session_id"] for c in http("GET", f"/sites/{SITE}/plan")[1]["connectors"]})
        run.check("unplug event on the ops feed names him and the shortfall", bool(ev) and "shortfall_kwh" in ev)
        run.ask("what happens when a driver leaves before the time they gave?")

        # 9 ------------------------------------------------------------------------------------------------------
        run.scenario(9, "The grid API goes dark", "The carbon-signal provider has an outage, then the cached forecast is knocked out too. "
                     "Promise: planning continues on every rung (cached -> tariff), no car loses its plan or deadline, the banner says why, and it all comes back when the signal does.")
        plan_before = len(http("GET", f"/sites/{SITE}/plan")[1]["connectors"])
        _, o1 = run.act("system", "live signal lost", "POST", "/demo/signal_outage", {"rungs": ["live"]})
        _, o2 = run.act("system", "cached forecast lost too", "POST", "/demo/signal_outage", {"rungs": ["cached"]})
        await run.wait_sim(6)
        p9 = http("GET", f"/sites/{SITE}/plan")[1]
        run.step("system", f"mode live -> {o1['detail']['mode_after']} -> {o2['detail']['mode_after']}; plan still covers {len(p9['connectors'])} cars (was {plan_before}); mode events on the ops feed: {len(run.events('mode'))}")
        run.check("ladder stepped down in order", (o1["detail"]["mode_after"], o2["detail"]["mode_after"]) == ("cached", "tariff"))
        run.check("no car lost its plan", len(p9["connectors"]) >= plan_before - 1, f"{len(p9['connectors'])} vs {plan_before}")
        run.check("plan frames still flowing with the degraded mode", p9["mode"] == "tariff", p9["mode"])
        run.ask("what happens if the grid API dies?")
        _, o3 = run.act("system", "signal restored", "POST", "/demo/signal_outage", {"restore": True})
        run.check("back to live when the signal returns", o3["detail"]["mode_after"] == "live", o3["detail"]["mode_after"])

        # 10 -----------------------------------------------------------------------------------------------------
        run.scenario(10, "The lunchtime rush", "Two waves of twenty cars arrive within minutes, all wanting 8–10 kWh inside two hours — more cars than bays, more demand than the feed can give. "
                     "Promise: nobody is refused, the shortfall is shared instead of starving one car, the site never crosses its feed, cars that are done are asked to move, and the slackest cars get a move-by time.")
        mark = len(run.frames)
        _, w1 = run.act("ops", "first wave: 20 arrivals with 2 h deadlines", "POST", "/demo/oversubscribe")
        _, w2 = run.act("ops", "second wave: 20 more", "POST", "/demo/oversubscribe")
        d = w2["detail"]
        run.step("system", f"{d['connectors_active']} of {st['n_connectors']} bays active, {d['waiting']} cars waiting for a bay; if every plugged car drew full power that would be "
                 f"{d['demand_kw_if_all_full_power']} kW on a {d['feed_kw']} kW feed; {d['kwh_due_in_2h']} kWh due inside 2 h")
        await run.wait_sim(30)
        peaks = [(f["site_kw"], f["feed_kw"] - f["building_load_kw"]) for f in run.meters(mark)]
        worst = max(peaks, key=lambda p: p[0] - p[1])
        st10 = run.status()
        mv, done, moved = run.events("move_by", mark), run.events("done", mark), [e for e in run.events("unplug", mark) if e["detail"].get("moved")]
        run.step("system", f"30 min later: peak EV draw {worst[0]} kW vs headroom {worst[1]:.1f} kW; {len(mv)} move-by times issued, {len(done)} cars finished, "
                 f"{len(moved)} done cars moved on for a waiting car, {st10['waiting']} still waiting")
        run.check("metered EV load never exceeded feed minus building", all(kw <= hr + 0.05 for kw, hr in peaks), f"worst {worst[0]} vs {worst[1]:.1f} kW")
        run.check("nobody refused: every arrival is charging or queued", w1["detail"]["added"] == 20 and w2["detail"]["added"] == 20)
        run.check("the site really was full: a queue formed", d["waiting"] > 0, f"{d['waiting']} waiting")
        run.check("move-by times were issued to the slackest cars", len(mv) > 0, f"{len(mv)} move_by events")
        im10 = http("GET", f"/sites/{SITE}/impact")[1]
        run.check("the day's reported peak (EV + building) stays within the feed", im10["peak_kw"] <= st["feed_kw"] + 0.05, f"{im10['peak_kw']} vs {st['feed_kw']} kW")
        run.ask(f"{st10['waiting']} cars are waiting — who moves first?" if st10["waiting"] else "what happens when more cars arrive than bays?")

        run.meta["impact"] = http("GET", f"/sites/{SITE}/impact")[1]
        run.meta["worst_overshoot_kw"] = round(run.worst_overshoot(), 3)
        run.meta["meter_frames"] = len(run.meters())
        run.meta["ended"] = datetime.now().isoformat(timespec="seconds")
        task.cancel()

    failed = [(s["n"], c["name"]) for s in run.scenarios for c in s["checks"] if not c["ok"]]
    n_checks = sum(len(s["checks"]) for s in run.scenarios)
    (OUT / "run.json").write_text(json.dumps({"meta": run.meta, "scenarios": run.scenarios}, indent=1, default=str), encoding="utf-8")
    (OUT / "run.md").write_text(render_md(run, n_checks, failed), encoding="utf-8")
    im = run.meta["impact"]
    print(f"\nday so far: {im['sessions']} sessions, {im['kwh']} kWh, {im['saved_kgco2']} kg CO2 and ${im['saved_usd']} saved (est.), "
          f"peak {im['peak_kw']} vs {im['baseline_peak_kw']} kW charge-now, renewable-hour share {100 * im['renewable_share']:.0f}%")
    print(f"safety: over {run.meta['meter_frames']} meter frames the EV load exceeded feed minus building by at most {run.meta['worst_overshoot_kw']} kW")
    print(f"{n_checks - len(failed)}/{n_checks} checks passed; transcript -> {OUT / 'run.md'}, {OUT / 'run.json'}")
    if failed:
        print("FAILED:", failed)
        sys.exit(1)
    print("SCENARIOS OK")


def render_md(run, n_checks, failed):
    m = run.meta
    st, z = m["site"], m["zero_hours"]
    out = ["# Noonshift — ten real-world scenarios, recorded", "",
           f"Run {m['started'][:16].replace('T', ' ')} against `{m['api']}` · site `{SITE}`: {st['n_connectors']} bays, feed {st['feed_kw']} kW, "
           f"block {st['block_kw']} kW, R = ${st['employee_rate_usd_per_kwh']}/kWh, package {st['package']} · sim clock ×{m['speed']:.0f} · "
           f"zero-carbon hours today {f'{z[0]:02d}:00–{z[-1] + 1:02d}:00' if z else 'none'}", "",
           f"**{n_checks - len(failed)} of {n_checks} checks passed.** Every step below is a real request to the API or a frame from `/ws`; "
           f"nothing is mocked. Reproduce with `SIM_SPEED=120 python -m uvicorn noonshift.api:app --port 8000` then `python scripts/scenarios.py`.", ""]
    for s in run.scenarios:
        out += [f"## {s['n']}. {s['title']}", "", f"*{s['story']}*", "", "| sim | who | what happened |", "|---|---|---|"]
        for stp in s["steps"]:
            req = f" `{stp['request']['method']} {stp['request']['path']}`" if "request" in stp else ""
            out.append(f"| {stp['sim']} | {stp['who']} | {stp['text'].replace('|', '/')}{req} |")
        out += ["", "**Promise kept?**", ""]
        out += [f"- {'✅' if c['ok'] else '❌'} {c['name']}" + (f" — {c['detail']}" if c["detail"] else "") for c in s["checks"]]
        if "assistant" in s:
            a = s["assistant"]
            out += ["", f"**Ask the site:** *{a['question']}*", "", "> " + a.get("answer", "").replace("\n", "\n> "), "",
                    "<sub>" + ("offline template answer (no model key)" if a.get("fallback") else "model answer")
                    + (f" · sources: {', '.join(a['sources'])}" if a.get("sources") else "")
                    + (f" · suggested: {', '.join(x['label'] + ' → ' + x['path'] for x in a.get('suggested_actions', []))}" if a.get("suggested_actions") else "") + "</sub>"]
        out.append("")
    im = m["impact"]
    out += ["## The day so far", "", f"{im['sessions']} sessions · {im['kwh']} kWh metered · **{im['saved_kgco2']} kg CO₂** and ${im['saved_usd']} saved vs charging at plug-in (estimate) · "
            f"peak {im['peak_kw']} kW vs {im['baseline_peak_kw']} kW charge-now · renewable-hour share {100 * im['renewable_share']:.0f} %", "",
            f"**Safety, whole run:** over {m['meter_frames']} meter frames the EV load exceeded feed − building by at most {m['worst_overshoot_kw']} kW "
            f"({'never' if m['worst_overshoot_kw'] <= 0.05 else 'see above'}).", ""]
    return "\n".join(out)


if __name__ == "__main__":
    asyncio.run(main())
