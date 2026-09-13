"""FastAPI app: the seven §6.6 endpoints, /ws, /sites/{id}/status, the control loop, the fail-safe ladder, /demo/*.

All state is the module-level dict S. One asyncio loop, one process.
"""
import asyncio
import contextlib
import json
import os
import random
import statistics
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from pydantic import TypeAdapter

from . import db, scheduler, seed
from .models import (WS_FRAMES, ConnectorMeter, ConnectorPlan, DemoOut, DrEvent, EventMsg, FlexHour, ImpactOut,
                     LiveOut, MeterMsg, OutageIn, PlanMsg, PlanWindow, PricePreview, PriceTier, SessionIn, SessionOut,
                     SignalHour, StatusOut, UrgencyIn)
from .sim import SLOT, SPEED, Connector, Sim, load_sessions, safe_share_kw

S = {}  # site, signal, tariff, sim, plan, plan_at, baseline, impact, mode, ladder, live_lost_at, last_solve_at, dr, clients, next_id


# ---- helpers ----
def slot_of(t):
    return (t.hour * 60 + t.minute) // 5


def slot_start(t):
    return t.replace(minute=t.minute - t.minute % 5, second=0, microsecond=0)


def aligned(per_day, now):
    """Rotate a 288-slot day list so index 0 is the slot containing `now`."""
    i = slot_of(now)
    return [per_day[(i + k) % 288] for k in range(288)]


def pick_mode(now):
    """The fail-safe ladder. Each rung is a bool in S['ladder']; the first healthy one wins."""
    L = S["ladder"]
    if L["live"]:
        return "live"
    if L["cached"] and S["live_lost_at"] and now - S["live_lost_at"] <= timedelta(hours=6):
        return "cached"
    if L["tariff"]:
        return "tariff"
    if L["deadline"]:
        return "deadline"
    return "full"


URGENCY_MIN = timedelta(minutes=15)  # "soon" closer than this is "now": nothing can be scheduled in under 15 min
PRIORITY = {"floor_alpha": 0.9, "priority": 2.0}  # business.md §4b low band: floor 90 % pro-rata, gives way last


OBS_MIN = 5          # observation guard: minutes at a limit before the meter is believed over the form
OBS_FRAC = 0.8       # ... when the car draws less than this share of its limit
OBS_MARGIN = 1.05    # the new planning cap: metered kW plus a little, so a warming battery can still climb


def car_kw(c):
    """What the brain plans with for this car: the bay's limit, capped by the vehicle form or the observation guard."""
    return min(c.p_max_kw, c.session.get("max_kw") or c.p_max_kw)


def car(c):
    s = c.session
    return {"connector_id": c.id, "arrival": s["arrival"], "departure": s["user_stated_departure"],
            "kwh_needed": s["kwh_needed"], "kwh_delivered": s["kwh_delivered"], "p_max_kw": car_kw(c),
            "boost": s["boost"] or c.id in S["site"].get("connectors_asap", []),  # fleet bays are never deferred
            **(PRIORITY if s.get("urgency") == "priority" else {})}


def need_estimate(connector_id):
    """solutions.md §11: no form and no number from the driver -> this bay's history, else the site's median."""
    ss = S["sim"].sessions.values()
    here = [s["kwh_needed"] for s in ss if s["connector_id"] == connector_id and s["status"] == "ended"]
    if here:
        return round(statistics.median(here), 1), "history"
    return round(statistics.median(s["kwh_needed"] for s in ss), 1), "site"


def observe_caps():
    """The observation guard (solutions.md §10): a car that has drawn < OBS_FRAC of its limit for OBS_MIN minutes cannot
    take what we plan for it (PHEV, cold battery, wrong form). Believe the meter: cap it at metered * OBS_MARGIN for the
    rest of the session. Skipped once the car is tapering (> 80 % of its need), which is not a cap but physics."""
    out = []
    for c in S["sim"].active():
        s = c.session
        slow = s["status"] == "charging" and c.kw > 0 and c.kw < OBS_FRAC * c.limit_kw and s["kwh_delivered"] < 0.8 * s["kwh_needed"]
        c.slow_min = c.slow_min + 1 if slow and not s.get("cap_observed") else 0
        if c.slow_min >= OBS_MIN:
            s["max_kw"], s["cap_observed"], c.slow_min = round(c.kw * OBS_MARGIN, 2), True, 0
            out.append({"name": "cap_observed", "session_id": s["id"], "connector_id": c.id, "limit_kw": round(c.limit_kw, 2),
                        "metered_kw": round(c.kw, 2), "max_kw": s["max_kw"]})
    return out


def move_by():
    """solutions.md §3: cars are waiting, so the plugged cars with the most slack get a move-by time: deadline = now +
    time to finish at full power. Never a car with < 1 h slack, never an urgent one, one tightened car per waiting car."""
    sim = S["sim"]
    now = sim.now
    need = len(sim.waiting) - sum(1 for c in sim.active() if c.session.get("move_by"))
    out = []
    if need <= 0:
        return out

    def slack(c):
        s = c.session
        return (s["user_stated_departure"] - now).total_seconds() / 3600 - max(0.0, s["kwh_needed"] - s["kwh_delivered"]) / car_kw(c)

    cands = sorted((c for c in sim.active() if c.status == "charging" and not c.session.get("urgent") and not c.session.get("move_by")
                    and slack(c) >= 1.0), key=slack, reverse=True)
    for c in cands[:need]:
        s = c.session
        was = s["user_stated_departure"]
        finish = now + timedelta(hours=max(0.0, s["kwh_needed"] - s["kwh_delivered"]) / car_kw(c)) + SLOT
        s["user_stated_departure"], s["move_by"] = finish.replace(second=0, microsecond=0), True
        out.append({"name": "move_by", "session_id": s["id"], "connector_id": c.id, "deadline_was": was.isoformat(),
                    "move_by": s["user_stated_departure"].isoformat(), "waiting": len(sim.waiting)})
    return out


def site_rate():
    """R: what the driver pays per kWh today. 0 = free workplace charging (business.md §0b)."""
    return float(S["site"].get("employee_rate_usd_per_kwh", 0.0))


def session_price(s, slack):
    """business.md §7b: R minus the driver's share of this session's measured saving. The receipt's saving covers the
    planned series (metered + plan ahead), so the matching energy is the need while charging and the delivered kWh
    once ended (an early leaver shifted less). Any urgency band pays exactly R."""
    imp = S["impact"].get(s["id"], {"saved_usd": 0.0})
    kwh = s["kwh_delivered"] if s["status"] == "ended" else s["kwh_needed"]
    return scheduler.price(slack, r=site_rate(), saving_usd=imp["saved_usd"], kwh=kwh,
                           alpha=S["site"].get("driver_share", 0.5), urgent=bool(s.get("urgent")))


def new_sim():
    return Sim(load_sessions(), S["site"], S.get("connector_cls", Connector))


async def broadcast(msg):
    dead = []
    for ws in S["clients"]:
        try:
            await ws.send_json(msg.model_dump(mode="json"))
        except Exception:
            dead.append(ws)
    S["clients"].difference_update(dead)


async def event(name, detail):
    await broadcast(EventMsg(sim_time=S["sim"].now, name=name, detail=detail))


def session_impact(h, remaining=()):
    """The receipt: metered kW since plug-in plus the plan still ahead, against the charge-now baseline frozen
    at plug-in, both priced with the day's signal and tariff aligned to plug-in time. Re-solving every 5 min
    re-derives the baseline from the current state, so comparing only the remaining plan would shrink the
    receipt to zero by the time the driver unplugs."""
    full = len(h["kw_min"]) // 5
    metered = [sum(h["kw_min"][5 * k:5 * k + 5]) / 5 for k in range(full)]
    series = metered + list(remaining)[:288 - full]
    signal = {"moer": aligned(S["signal"]["moer"], h["start"]), "kind": S["signal"]["kind"]}
    tariff = dict(S["tariff"], price_per_kwh=aligned(S["tariff"]["price_per_kwh"], h["start"]))
    signal["health_damage"] = aligned(S["signal"]["health_damage"], h["start"]) if S["signal"].get("health_damage") else None
    return scheduler.impact({"s": series}, {"s": h["baseline"]}, signal, tariff, health=bool(S["signal"].get("health_damage")))


def meter_history():
    """Once a sim-minute: record each charging car's draw; finalise the receipt when a car is done or gone."""
    sim = S["sim"]
    for sid, h in S.setdefault("hist", {}).items():
        s = sim.sessions[sid]
        if s["status"] == "charging":
            h["kw_min"].append(sim.connectors[s["connector_id"]].kw)
        elif not h.get("final"):
            S["impact"][sid], h["final"] = session_impact(h), True


def apply_limits():
    sim = S["sim"]
    k = slot_of(sim.now) - slot_of(S["plan_at"]) if S["plan_at"] else -1
    for c in sim.active():
        kw = S["plan"].get(c.id)
        c.set_limit(kw[k] if kw and 0 <= k < len(kw) else c.safe_kw)  # no plan for this car = the static share


def plan_msg(reason):
    sim, plan = S["sim"], S["plan"]
    conns = [ConnectorPlan(connector_id=cid, session_id=sim.connectors[cid].session["id"], kw=kw)
             for cid, kw in plan.items() if sim.connectors[cid].session]
    n = max((len(kw) for kw in plan.values()), default=0)
    site_kw = [round(sum(kw[k] for kw in plan.values() if k < len(kw)), 2) for k in range(n)]
    return PlanMsg(site_id=S["site"]["id"], solved_at=S["last_solve_at"], mode=S["mode"], reason=reason,
                   horizon_start=slot_start(S["plan_at"]), connectors=conns, site_kw=site_kw)


async def resolve(reason):
    """Build solver inputs for the current rung, solve plan + charge-now baseline, push limits, broadcast."""
    sim = S["sim"]
    now = sim.now
    mode = S["mode"] = pick_mode(now)
    for e in move_by():
        await event("move_by", e)
    cars = [car(c) for c in sim.active() if c.session["status"] == "charging"]
    site = {"feed_kw": S["site"]["feed_kw"], "block_kw": S["site"]["block_kw"], "safe_share_kw": safe_share_kw(S["site"]),
            "building_load_kw": aligned(S["site"]["building_load_kw"], now)}
    t0 = slot_start(now)
    for dr in S["dr"]:  # a DR event is just less headroom in those slots
        for k in range(288):
            if dr.start <= t0 + k * SLOT < dr.end:
                site["building_load_kw"][k] += dr.reduce_kw
    sig = S["signal"]
    signal = {"moer": aligned(sig["moer"], now), "kind": sig["kind"]} if mode in ("live", "cached") else {"moer": [], "kind": None}
    tariff = dict(S["tariff"], price_per_kwh=aligned(S["tariff"]["price_per_kwh"], now) if mode != "deadline" else [])
    if mode == "full":  # nothing to plan with: every charger on its static share, which is what it would do without us
        plan = baseline = {c["connector_id"]: [min(site["safe_share_kw"], c["p_max_kw"])] * 288 for c in cars}
    else:
        plan = await asyncio.to_thread(scheduler.solve, cars, site, signal, tariff, now)
        baseline = await asyncio.to_thread(scheduler.solve, [dict(c, departure=now) for c in cars], site, signal, tariff, now)
    S.update(plan=plan, plan_at=now, baseline=baseline, last_solve_at=now)
    for c in cars:
        cid = c["connector_id"]
        sid = sim.connectors[cid].session["id"]
        h = S.setdefault("hist", {}).setdefault(sid, {"start": now, "baseline": baseline[cid], "kw_min": []})
        S["impact"][sid] = session_impact(h, plan[cid])
    apply_limits()
    msg = plan_msg(reason)
    await broadcast(msg)
    await db.save_plan(now, mode, plan)
    return msg


def meter_msg():
    sim = S["sim"]
    conns = []
    asap = S["site"].get("connectors_asap", [])
    for c in sim.connectors.values():
        s = c.session
        conns.append(ConnectorMeter(
            connector_id=c.id, session_id=s["id"] if s else None,
            status=c.status if s else "idle", kw=round(c.kw, 2),
            kwh_delivered=round(s["kwh_delivered"], 3) if s else 0, kwh_needed=s["kwh_needed"] if s else 0,
            departure_at=s["user_stated_departure"] if s else None, boost=s["boost"] if s else False,
            urgency=s.get("urgency") if s else None,
            idle_min=int((sim.now - s["idle_since"]).total_seconds() // 60) if s and s.get("idle_since") else 0,
            need_confidence=s.get("need_confidence") if s else None, p_max_kw=car_kw(c) if s else c.p_max_kw,
            cap_observed=bool(s.get("cap_observed")) if s else False, asap=c.id in asap,
            move_by=bool(s.get("move_by")) if s else False))
    return MeterMsg(sim_time=sim.now, mode=S["mode"], site_kw=round(sum(c.kw for c in sim.connectors.values()), 2),
                    building_load_kw=S["site"]["building_load_kw"][slot_of(sim.now)], feed_kw=S["site"]["feed_kw"],
                    connectors=conns, waiting=len(sim.waiting))


async def step():
    """One sim-minute: draw power, handle plug-ins/unplugs, re-solve on event or 5-min boundary, publish meters."""
    sim = S["sim"]
    events = sim.tick(1) + observe_caps()
    meter_history()
    for e in events:
        await event(e["name"], e)
        await db.save_session(sim.sessions[e["session_id"]])
    if events or sim.now.minute % 5 == 0:
        await resolve(f"event:{events[0]['name']}" if events else "tick")
    else:
        apply_limits()
    await broadcast(meter_msg())
    await db.save_meters(sim.now, [(c.id, c.session["id"], c.kw, c.session["kwh_delivered"]) for c in sim.active()])
    if sim.now >= sim.day_end:  # play the day again
        S.update(sim=new_sim(), plan={}, plan_at=None, baseline={}, impact={}, hist={}, dr=[])
        await event("day_reset", {"day_start": S["sim"].now})


async def control_loop():
    while True:
        await asyncio.sleep(60 / SPEED)
        try:
            await step()
        except Exception as e:  # ponytail: never let one bad tick kill the day
            print("step failed:", repr(e))


def session_out(s):
    sim = S["sim"]
    now = sim.now
    kw = S["plan"].get(s["connector_id"], []) if s["status"] in ("charging", "done") else []
    on = [k for k, v in enumerate(kw) if v > 0]
    h0 = slot_start(S["plan_at"]) if S["plan_at"] else now
    eta, acc = None, s["kwh_delivered"]
    for k, v in enumerate(kw):
        if acc >= s["kwh_needed"]:
            eta = h0 + k * SLOT
            break
        acc += v * 5 / 60
    c = sim.connectors.get(s["connector_id"])
    p_max = car_kw(c) if c and c.session is s else min(sim.connectors[s["connector_id"]].p_max_kw, s.get("max_kw") or 99)
    slack = 0 if s["boost"] else (s["user_stated_departure"] - now).total_seconds() / 3600 - max(0, s["kwh_needed"] - s["kwh_delivered"]) / p_max
    return SessionOut(session_id=s["id"], connector_id=s["connector_id"], status=s["status"],
                      plan=PlanWindow(start=h0 + on[0] * SLOT if on else None, end=h0 + (on[-1] + 1) * SLOT if on else None,
                                      ready_by=s["user_stated_departure"]),
                      eta=eta, price=session_price(s, slack), boost=s["boost"], urgency=s.get("urgency"),
                      kwh_needed=s["kwh_needed"], need_confidence=s.get("need_confidence"), max_kw=s.get("max_kw"))


def get_session(sid):
    s = S["sim"].sessions.get(sid)
    if not s:
        raise HTTPException(404, "no such session")
    return s


def check_site(site_id):
    if site_id != S["site"]["id"]:
        raise HTTPException(404, "no such site")


# ---- app ----
@contextlib.asynccontextmanager
async def lifespan(app):
    S.update(site=json.load(open("data/site.json")), signal=json.load(open("data/signal.json")),
             tariff=json.load(open("data/tariff.json")), plan={}, plan_at=None, baseline={}, impact={}, hist={}, mode="live",
             ladder={"live": True, "cached": True, "tariff": True, "deadline": True}, live_lost_at=None,
             last_solve_at=None, dr=[], clients=set(), next_id=1000)
    if os.environ.get("OCPP") == "1":
        from . import ocpp_gateway
        S["connector_cls"] = ocpp_gateway.OcppConnector
        await ocpp_gateway.start(S["site"]["connectors"], safe_share_kw(S["site"]))
    S["sim"] = new_sim()
    await db.connect()
    await seed.load()
    os.makedirs("docs", exist_ok=True)
    json.dump(app.openapi(), open("docs/openapi.json", "w"), indent=1)
    json.dump(TypeAdapter(WS_FRAMES).json_schema(), open("docs/ws-frames.json", "w"), indent=1)
    task = asyncio.create_task(control_loop())
    yield
    task.cancel()


app = FastAPI(title="Noonshift", version="0.1.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])  # front-end lives on another host


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/sessions", response_model=SessionOut)
async def create_session(body: SessionIn):
    """Driver answers "When do you leave?". Updates the session on that connector, or plugs a new one in."""
    sim = S["sim"]
    c = sim.connectors.get(body.connector_id)
    if not c:
        raise HTTPException(404, "no such connector")
    if body.departure_at <= sim.now:
        raise HTTPException(400, f"departure_at must be after sim time {sim.now.isoformat()}")
    v = body.vehicle
    if v and v.battery_kwh and body.soc_now is not None:  # solutions.md §11: the form beats a typed number
        kwh, conf = round(max(0.0, body.target_soc - body.soc_now) * v.battery_kwh, 2), "declared"
    elif body.kwh_needed:
        kwh, conf = body.kwh_needed, "declared"
    else:
        kwh, conf = need_estimate(c.id)
    if c.session:
        s = c.session
        s["user_stated_departure"] = body.departure_at
        if body.kwh_needed or (v and v.battery_kwh and body.soc_now is not None):
            s["kwh_needed"], s["need_confidence"] = max(kwh, s["kwh_delivered"]), conf
        name = "deadline"
    else:
        S["next_id"] += 1
        s = {"id": S["next_id"], "connector_id": c.id, "arrival": sim.now, "departure": body.departure_at,
             "user_stated_departure": body.departure_at, "kwh_needed": kwh, "need_confidence": conf,
             "kwh_delivered": 0.0, "boost": False, "status": "pending", "ended_at": None}
        sim.arrive(s)
        name = "plug_in"
    if v:
        s["vehicle"] = v.model_dump(exclude_none=True)
        if v.max_kw:
            s["max_kw"] = s["car_kw"] = v.max_kw  # the planner's belief and, in the sim, the physical truth
    await event(name, {"session_id": s["id"], "connector_id": c.id, "departure_at": body.departure_at.isoformat()})
    await db.save_session(s)
    await resolve(name)
    return session_out(s)


@app.post("/sessions/{sid}/urgency", response_model=SessionOut)
async def urgency(sid: int, body: UrgencyIn):
    """business.md §4b. now: deadline = now, full power (the ASAP path). soon: deadline = leave_at, the LP picks the
    cleanest slots inside the window (< 15 min away = now). priority: deadline unchanged, floor 90 % pro-rata and the
    shortfall weight doubled. Every band marks the session urgent, so price() returns exactly R."""
    s = get_session(sid)
    if s["status"] not in ("charging", "done"):
        raise HTTPException(409, f"session is {s['status']}")
    sim = S["sim"]
    level, leave_at = body.level, body.leave_at
    if level == "soon" and (leave_at is None or leave_at < sim.now + URGENCY_MIN):
        level = "now"
    if level == "now":
        s["boost"], s["user_stated_departure"] = True, sim.now  # the car leaves when it leaves; charge flat out until then
    elif level == "soon":
        s["user_stated_departure"] = s["departure"] = leave_at  # the driver said when they leave: the sim believes them
    s["urgent"], s["urgency"] = True, level
    await event("boost" if level == "now" else "urgency",  # "now" keeps the event name both front-ends already handle
                {"session_id": sid, "connector_id": s["connector_id"], "level": level, "requested": body.level,
                 "leave_at": s["user_stated_departure"].isoformat()})
    await db.save_session(s)
    await resolve(f"urgency:{level}")
    return session_out(s)


@app.post("/sessions/{sid}/boost", response_model=SessionOut)
async def boost(sid: int):
    """Alias for urgency "now" (WattWise's "Charge now" button)."""
    return await urgency(sid, UrgencyIn(level="now"))


@app.get("/sessions/{sid}/live", response_model=LiveOut)
def live(sid: int):
    s = get_session(sid)
    sim = S["sim"]
    moer = S["signal"]["moer"]
    now_moer = moer[slot_of(sim.now)]
    imp = S["impact"].get(sid, {"saved_usd": 0.0, "saved_kgco2": 0.0})
    c = sim.connectors[s["connector_id"]]
    return LiveOut(session_id=sid, status=s["status"], kw_now=round(c.kw, 2) if c.session is s else 0.0,
                   grid_percentile=round(100 * sum(m > now_moer for m in moer) / len(moer), 1),
                   kwh_delivered=round(s["kwh_delivered"], 3), kwh_needed=s["kwh_needed"], **imp)


@app.get("/sites/{site_id}/plan", response_model=PlanMsg)
async def site_plan(site_id: str):
    check_site(site_id)
    return plan_msg("request") if S["plan_at"] else await resolve("request")


@app.get("/sites/{site_id}/impact", response_model=ImpactOut)
def site_impact(site_id: str, from_: datetime | None = Query(None, alias="from"), to: datetime | None = None):
    check_site(site_id)
    sim = S["sim"]
    lo = from_ or sim.day_end - timedelta(days=1)
    hi = to or sim.day_end
    ss = [s for s in sim.sessions.values() if lo <= s["arrival"] < hi and s["status"] != "pending"]
    imps = [S["impact"].get(s["id"], {"saved_usd": 0.0, "saved_kgco2": 0.0}) for s in ss]
    actual, base = site_peaks()
    ledger = hourly_ledger(lo, hi)
    kwh = sum(r["kwh"] for r in ledger)
    return ImpactOut(from_=lo, to=hi, sessions=len(ss), kwh=round(sum(s["kwh_delivered"] for s in ss), 2),
                     saved_usd=round(sum(i["saved_usd"] for i in imps), 2),
                     saved_kgco2=round(sum(i["saved_kgco2"] for i in imps), 2),
                     peak_kw=actual, baseline_peak_kw=base,
                     renewable_share=round(sum(r["kwh"] for r in ledger if r["gco2_per_kwh"] == 0) / kwh, 4) if kwh else 0.0,
                     health_usd=None if S["signal"].get("health_damage") is None else round(sum(
                         S["impact"].get(s["id"], {}).get("health_usd") or 0.0 for s in ss), 2))


def hourly_ledger(lo, hi):
    """solutions.md §12: the hourly record behind every carbon claim, from metered per-minute kW and the day's signal.
    Columns: hour, kWh, gCO2/kWh (hourly mean of the signal), kgCO2 (per-slot, exact), signal kind and source."""
    moer, kind, src = S["signal"]["moer"], S["signal"]["kind"], S["signal"].get("source", "")
    kwh = [0.0] * 288
    for h in S.get("hist", {}).values():
        if not (lo <= h["start"] < hi):
            continue
        k0 = slot_of(h["start"])
        for i, kw in enumerate(h["kw_min"]):
            k = k0 + i // 5
            if k < 288:
                kwh[k] += kw / 60
    out = []
    for hour in range(24):
        e = sum(kwh[hour * 12:(hour + 1) * 12])
        kg = sum(kwh[k] * moer[k] / 1000 for k in range(hour * 12, (hour + 1) * 12))
        out.append({"hour": hour, "kwh": round(e, 3), "gco2_per_kwh": round(sum(moer[hour * 12:(hour + 1) * 12]) / 12, 1),
                    "kgco2": round(kg, 4), "signal_kind": kind, "signal_source": src})
    return out


@app.get("/sites/{site_id}/impact.csv", response_class=PlainTextResponse)
def site_impact_csv(site_id: str, from_: datetime | None = Query(None, alias="from"), to: datetime | None = None):
    """The audit-ready ledger (solutions.md §12): LCFS takes the kWh column today; an hourly-EAC registry takes the rest."""
    check_site(site_id)
    sim = S["sim"]
    lo, hi = from_ or sim.day_end - timedelta(days=1), to or sim.day_end
    rows = ["day,hour,kwh,gco2_per_kwh,kgco2,signal_kind,signal_source"]
    day = lo.date().isoformat()
    for r in hourly_ledger(lo, hi):
        rows.append(f"{day},{r['hour']:02d},{r['kwh']:.3f},{r['gco2_per_kwh']},{r['kgco2']:.4f},{r['signal_kind']},{r['signal_source']}")
    return PlainTextResponse("\n".join(rows) + "\n", media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="noonshift-{site_id}-{day}.csv"'})


def site_peaks():
    """Today's metered site peak vs the peak had every car charged at full power from plug-in (the frozen
    per-session baselines, laid onto absolute slots and summed). Both include building load."""
    building = S["site"]["building_load_kw"]
    metered, base = [0.0] * 288, [0.0] * 288
    for h in S.get("hist", {}).values():
        k0 = slot_of(h["start"])
        for i, kw in enumerate(h["kw_min"]):  # per sim-minute since plug-in
            k = k0 + i // 5
            if k < 288:
                metered[k] += kw / 5
        for i, kw in enumerate(h["baseline"]):
            if k0 + i < 288:
                base[k0 + i] += kw
    feed = S["site"]["feed_kw"]  # baselines were frozen at different times, so their sum can exceed what the feed allows
    return (round(max(m + b for m, b in zip(metered, building)), 1),
            round(min(feed, max(m + b for m, b in zip(base, building))), 1))


@app.get("/sites/{site_id}/status", response_model=StatusOut)
def site_status(site_id: str):
    check_site(site_id)
    site = S["site"]
    return StatusOut(mode=S["mode"], last_solve_at=S["last_solve_at"],
                     connectors_active=sum(c.status == "charging" for c in S["sim"].active()),
                     feed_kw=site["feed_kw"], block_kw=site["block_kw"], sim_time=S["sim"].now,
                     safe_share_kw=safe_share_kw(site), waiting=len(S["sim"].waiting),
                     connectors_asap=site.get("connectors_asap", []), n_connectors=len(site["connectors"]), p_max_kw=site["p_max_kw"],
                     contracted_peak_kw=site.get("contracted_peak_kw") or site["feed_kw"], package=site.get("package", "pilot"),
                     employee_rate_usd_per_kwh=site_rate(), driver_share=site.get("driver_share", 0.5),
                     noonshift_share=site.get("noonshift_share", 0.2), signal_kind=S["signal"].get("kind"),
                     signal_source=S["signal"].get("source"), tariff_name=S["tariff"].get("name"), ladder=S["ladder"])


@app.get("/price", response_model=PricePreview)
def price_preview(departure_at: datetime, kwh_needed: float = 8.0):
    """What a ready-by would cost before plugging in. No session yet, so the discount is today's site saving rate so far
    (sum of measured session savings over delivered kWh) applied to this need: an estimate, settled on the receipt."""
    sim = S["sim"]
    slack = (departure_at - sim.now).total_seconds() / 3600 - kwh_needed / S["site"]["p_max_kw"]
    ended = [s for s in sim.sessions.values() if s["status"] != "pending" and s["kwh_delivered"] > 0]
    rate = sum(S["impact"].get(s["id"], {"saved_usd": 0.0})["saved_usd"] for s in ended) / sum(s["kwh_delivered"] for s in ended) if ended else 0.0
    quote = lambda h: scheduler.price(h, r=site_rate(), saving_usd=rate * kwh_needed, kwh=kwh_needed, alpha=S["site"].get("driver_share", 0.5))
    tiers = [PriceTier(tier=t, min_slack_hours=m, usd_per_kwh=quote(m)["usd_per_kwh"]) for t, m in (("green", 4.0), ("standard", 1.0), ("boost", 0.0))]
    return PricePreview(slack_hours=round(slack, 2), price=quote(slack), tiers=tiers)


@app.get("/grid/signal", response_model=list[SignalHour])
def grid_signal():
    """Today's grid signal and tariff by hour, for the driver app's 'why this hour' graph."""
    moer, price = S["signal"]["moer"], S["tariff"]["price_per_kwh"]  # both g/kWh and $/kWh per 5-min slot
    per_hour = len(moer) // 24
    return [SignalHour(hour=h, kind=S["signal"]["kind"],
                       gco2_per_kwh=round(sum(moer[h * per_hour:(h + 1) * per_hour]) / per_hour, 1),
                       usd_per_kwh=round(sum(price[h * 12:(h + 1) * 12]) / 12, 4))
            for h in range(24)]


@app.get("/grid/flex-forecast", response_model=list[FlexHour])
def flex_forecast():
    """Stub: headroom under the feed not claimed by the current plan, per hour of the rest of today."""
    sim = S["sim"]
    site_kw = plan_msg("").site_kw if S["plan_at"] else []
    out = []
    for h in range(sim.now.hour, 24):
        cap = S["site"]["feed_kw"] - S["site"]["building_load_kw"][h * 12]
        k0 = h * 12 - slot_of(S["plan_at"]) if S["plan_at"] else -1
        planned = sum(site_kw[k0:k0 + 12]) / 12 if 0 <= k0 < len(site_kw) else 0
        active = sum(c.status == "charging" for c in sim.active())
        out.append(FlexHour(hour=h, shiftable_kw=round(max(0.0, min(cap - planned, active * 7.0)), 1)))
    return out


@app.post("/openadr/events")
async def openadr_event(ev: DrEvent):
    """Stub: accept a DR event as a feed reduction over [start, end) and re-solve."""
    S["dr"].append(ev)
    await event("dr", ev.model_dump(mode="json"))
    await resolve("dr")
    return {"accepted": True, "events": len(S["dr"]), "mode": S["mode"]}


@app.websocket("/ws")
async def ws(sock: WebSocket):
    await sock.accept()
    S["clients"].add(sock)
    try:
        if S["plan_at"]:
            await sock.send_json(plan_msg("snapshot").model_dump(mode="json"))
        while True:
            await sock.receive_text()  # we never read; this just detects disconnect
    except WebSocketDisconnect:
        pass
    finally:
        S["clients"].discard(sock)


# ---- demo ----
def charging_sessions():
    return [c.session for c in S["sim"].active() if c.session["status"] == "charging"]


@app.post("/demo/early_unplug", response_model=DemoOut)
async def demo_early_unplug():
    """Tom: told us 17:00, leaves now. Picks the charging car with the latest deadline and least energy."""
    sim = S["sim"]
    cands = sorted(charging_sessions(), key=lambda s: (s["kwh_delivered"] / s["kwh_needed"], -s["user_stated_departure"].timestamp()))
    if not cands:
        raise HTTPException(409, "nobody is charging")
    s = cands[0]
    c = sim.connectors[s["connector_id"]]
    s["departure"] = sim.now
    c.unplug(sim.now)
    detail = {"session_id": s["id"], "connector_id": c.id, "stated_departure": s["user_stated_departure"].isoformat(),
              "left_at": sim.now.isoformat(), "kwh_needed": s["kwh_needed"], "kwh_delivered": round(s["kwh_delivered"], 2),
              "shortfall_kwh": round(s["kwh_needed"] - s["kwh_delivered"], 2)}
    await event("unplug", detail)
    await db.save_session(s)
    await resolve("demo:early_unplug")
    return DemoOut(changed="session unplugged early; plan re-solved without it", detail=detail)


@app.post("/demo/boost", response_model=DemoOut)
async def demo_boost():
    """Sofia: 10:30 site visit. Picks the least-charged car, moves its deadline to now+1h with Boost."""
    sim = S["sim"]
    cands = sorted((s for s in charging_sessions() if not s["boost"]), key=lambda s: s["kwh_delivered"] / s["kwh_needed"])
    if not cands:
        raise HTTPException(409, "nobody to boost")
    s = cands[0]
    was = s["user_stated_departure"]
    s["boost"] = s["urgent"] = True
    s["urgency"] = "now"
    s["user_stated_departure"] = s["departure"] = sim.now + timedelta(hours=1)
    await event("boost", {"session_id": s["id"], "connector_id": s["connector_id"]})
    await db.save_session(s)
    await resolve("demo:boost")
    out = session_out(s)
    return DemoOut(changed="deadline pulled to now+1h with Boost; plan re-solved",
                   detail={"session_id": s["id"], "connector_id": s["connector_id"], "deadline_was": was.isoformat(),
                           "deadline_now": s["user_stated_departure"].isoformat(), "price": out.price.model_dump(),
                           "plan": out.plan.model_dump(mode="json")})


@app.post("/demo/oversubscribe", response_model=DemoOut)
async def demo_oversubscribe():
    """+20 late arrivals, 2 h deadlines, on the spare connectors. More demand than the feed can serve."""
    sim = S["sim"]
    rnd = random.Random(sim.now.minute)
    added = []
    for _ in range(20):
        S["next_id"] += 1
        s = {"id": S["next_id"], "connector_id": None, "arrival": sim.now, "departure": sim.now + timedelta(hours=2),
             "user_stated_departure": sim.now + timedelta(hours=2), "kwh_needed": round(rnd.uniform(8, 10), 1),
             "kwh_delivered": 0.0, "boost": False, "status": "pending", "ended_at": None}
        sim.arrive(s)
        added.append(s["id"])
        await db.save_session(s)
    active = charging_sessions()
    detail = {"added": len(added), "session_ids": added, "connectors_active": len(active), "waiting": len(sim.waiting),
              "demand_kw_if_all_full_power": len(active) * S["site"]["p_max_kw"], "feed_kw": S["site"]["feed_kw"],
              "kwh_due_in_2h": round(sum(s["kwh_needed"] - s["kwh_delivered"] for s in active if s["user_stated_departure"] <= sim.now + timedelta(hours=2)), 1)}
    await event("demo", {"what": "oversubscribe", **detail})
    await resolve("demo:oversubscribe")
    return DemoOut(changed=f"{len(added)} cars plugged in with 2 h deadlines; plan re-solved (elastic shortfall)", detail=detail)


@app.post("/demo/signal_outage", response_model=DemoOut)
async def demo_signal_outage(body: OutageIn = OutageIn()):
    """Knock rungs out of the fail-safe ladder (default: the live signal) or restore all."""
    sim = S["sim"]
    before = S["mode"]
    if body.restore:
        S["ladder"] = {"live": True, "cached": True, "tariff": True, "deadline": True}
        S["live_lost_at"] = None
    else:
        for r in body.rungs:
            S["ladder"][r] = False
        if not S["ladder"]["live"] and not S["live_lost_at"]:
            S["live_lost_at"] = sim.now
    await resolve("mode")
    detail = {"mode_before": before, "mode_after": S["mode"], "ladder": S["ladder"],
              "cache_expires_at": (S["live_lost_at"] + timedelta(hours=6)).isoformat() if S["live_lost_at"] else None}
    await event("mode", detail)
    return DemoOut(changed=f"fail-safe mode {before} -> {S['mode']}", detail=detail)
