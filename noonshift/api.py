"""FastAPI app: the seven §6.6 endpoints, /ws, /sites/{id}/status, the control loop, the fail-safe ladder, /demo/*.

All state is the module-level dict S. One asyncio loop, one process.
"""
import asyncio
import contextlib
import json
import os
import random
from datetime import datetime, timedelta

from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import TypeAdapter

from . import db, scheduler, seed
from .models import (WS_FRAMES, ConnectorMeter, ConnectorPlan, DemoOut, DrEvent, EventMsg, FlexHour, ImpactOut,
                     LiveOut, MeterMsg, OutageIn, PlanMsg, PlanWindow, SessionIn, SessionOut, StatusOut)
from .sim import SLOT, SPEED, Connector, Sim, load_sessions

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


def car(c):
    s = c.session
    return {"connector_id": c.id, "arrival": s["arrival"], "departure": s["user_stated_departure"],
            "kwh_needed": s["kwh_needed"], "kwh_delivered": s["kwh_delivered"], "p_max_kw": c.p_max_kw, "boost": s["boost"]}


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


def apply_limits():
    sim = S["sim"]
    k = slot_of(sim.now) - slot_of(S["plan_at"]) if S["plan_at"] else -1
    for c in sim.active():
        kw = S["plan"].get(c.id)
        c.set_limit(kw[k] if kw and 0 <= k < len(kw) else c.p_max_kw)


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
    cars = [car(c) for c in sim.active() if c.session["status"] == "charging"]
    site = {"feed_kw": S["site"]["feed_kw"], "block_kw": S["site"]["block_kw"],
            "building_load_kw": aligned(S["site"]["building_load_kw"], now)}
    t0 = slot_start(now)
    for dr in S["dr"]:  # a DR event is just less headroom in those slots
        for k in range(288):
            if dr.start <= t0 + k * SLOT < dr.end:
                site["building_load_kw"][k] += dr.reduce_kw
    sig = S["signal"]
    signal = {"moer": aligned(sig["moer"], now), "kind": sig["kind"]} if mode in ("live", "cached") else {"moer": [], "kind": None}
    tariff = dict(S["tariff"], price_per_kwh=aligned(S["tariff"]["price_per_kwh"], now) if mode != "deadline" else [])
    if mode == "full":
        plan = baseline = {c["connector_id"]: [c["p_max_kw"]] * 288 for c in cars}
    else:
        plan = await asyncio.to_thread(scheduler.solve, cars, site, signal, tariff, now)
        baseline = await asyncio.to_thread(scheduler.solve, [dict(c, departure=now) for c in cars], site, signal, tariff, now)
    S.update(plan=plan, plan_at=now, baseline=baseline, last_solve_at=now)
    for c in cars:
        cid = c["connector_id"]
        S["impact"][sim.connectors[cid].session["id"]] = scheduler.impact({cid: plan[cid]}, {cid: baseline[cid]}, signal, tariff)
    apply_limits()
    msg = plan_msg(reason)
    await broadcast(msg)
    await db.save_plan(now, mode, plan)
    return msg


def meter_msg():
    sim = S["sim"]
    conns = []
    for c in sim.connectors.values():
        s = c.session
        conns.append(ConnectorMeter(
            connector_id=c.id, session_id=s["id"] if s else None,
            status=c.status if s else "idle", kw=round(c.kw, 2),
            kwh_delivered=round(s["kwh_delivered"], 3) if s else 0, kwh_needed=s["kwh_needed"] if s else 0,
            departure_at=s["user_stated_departure"] if s else None, boost=s["boost"] if s else False))
    return MeterMsg(sim_time=sim.now, mode=S["mode"], site_kw=round(sum(c.kw for c in sim.connectors.values()), 2),
                    building_load_kw=S["site"]["building_load_kw"][slot_of(sim.now)], feed_kw=S["site"]["feed_kw"],
                    connectors=conns)


async def step():
    """One sim-minute: draw power, handle plug-ins/unplugs, re-solve on event or 5-min boundary, publish meters."""
    sim = S["sim"]
    events = sim.tick(1)
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
        S.update(sim=new_sim(), plan={}, plan_at=None, baseline={}, impact={}, dr=[])
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
    p_max = sim.connectors[s["connector_id"]].p_max_kw
    slack = 0 if s["boost"] else (s["user_stated_departure"] - now).total_seconds() / 3600 - max(0, s["kwh_needed"] - s["kwh_delivered"]) / p_max
    return SessionOut(session_id=s["id"], connector_id=s["connector_id"], status=s["status"],
                      plan=PlanWindow(start=h0 + on[0] * SLOT if on else None, end=h0 + (on[-1] + 1) * SLOT if on else None,
                                      ready_by=s["user_stated_departure"]),
                      eta=eta, price=scheduler.price(slack), boost=s["boost"])


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
             tariff=json.load(open("data/tariff.json")), plan={}, plan_at=None, baseline={}, impact={}, mode="live",
             ladder={"live": True, "cached": True, "tariff": True, "deadline": True}, live_lost_at=None,
             last_solve_at=None, dr=[], clients=set(), next_id=1000)
    if os.environ.get("OCPP") == "1":
        from . import ocpp_gateway
        S["connector_cls"] = ocpp_gateway.OcppConnector
        await ocpp_gateway.start(S["site"]["connectors"])
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
    if c.session:
        s = c.session
        s["user_stated_departure"] = body.departure_at
        if body.kwh_needed:
            s["kwh_needed"] = max(body.kwh_needed, s["kwh_delivered"])
        name = "deadline"
    else:
        S["next_id"] += 1
        s = {"id": S["next_id"], "connector_id": c.id, "arrival": sim.now, "departure": body.departure_at,
             "user_stated_departure": body.departure_at, "kwh_needed": body.kwh_needed or 8.0,
             "kwh_delivered": 0.0, "boost": False, "status": "pending", "ended_at": None}
        sim.arrive(s)
        name = "plug_in"
    await event(name, {"session_id": s["id"], "connector_id": c.id, "departure_at": body.departure_at.isoformat()})
    await db.save_session(s)
    await resolve(name)
    return session_out(s)


@app.post("/sessions/{sid}/boost", response_model=SessionOut)
async def boost(sid: int):
    s = get_session(sid)
    if s["status"] not in ("charging", "done"):
        raise HTTPException(409, f"session is {s['status']}")
    s["boost"] = True
    await event("boost", {"session_id": sid, "connector_id": s["connector_id"]})
    await db.save_session(s)
    await resolve("boost")
    return session_out(s)


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
    return ImpactOut(from_=lo, to=hi, sessions=len(ss), kwh=round(sum(s["kwh_delivered"] for s in ss), 2),
                     saved_usd=round(sum(i["saved_usd"] for i in imps), 2),
                     saved_kgco2=round(sum(i["saved_kgco2"] for i in imps), 2))


@app.get("/sites/{site_id}/status", response_model=StatusOut)
def site_status(site_id: str):
    check_site(site_id)
    return StatusOut(mode=S["mode"], last_solve_at=S["last_solve_at"],
                     connectors_active=sum(c.status == "charging" for c in S["sim"].active()))


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
    s["boost"] = True
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
        if sim.arrive(s):
            added.append(s["id"])
            await db.save_session(s)
    active = charging_sessions()
    detail = {"added": len(added), "session_ids": added, "connectors_active": len(active),
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
