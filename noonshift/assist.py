"""Operator assistant (prompt.md WP6): a snapshot of the live site, one model call over a cached system prefix, and a
deterministic fallback so the demo never depends on a key or the internet. It explains and suggests; it never acts."""
import json
import logging
import os
import re
import time
from collections import defaultdict, deque
from pathlib import Path

log = logging.getLogger("noonshift.assist")

MODEL = "claude-opus-5"
MAX_ROWS = 15            # connector rows in the snapshot: the most relevant ones, plus counts for the rest
SNAPSHOT_CHARS = 24_000  # ~6 k tokens
KNOWLEDGE = (Path(__file__).with_name("assist_knowledge.md")).read_text(encoding="utf-8")
RULES = """You are the Noonshift operator assistant, talking to the facilities manager of one corporate charging site.

Answer only from the <site_state> JSON in the user turn and the knowledge text below. site_state is today's live
state: simulated time, the fail-safe mode and ladder, site limits, impact so far, connector rows (the most relevant
15 plus counts), the waiting queue, the last events, and today's signal and tariff summaries. If the state does not
contain the answer, say which dashboard page or API endpoint would show it instead of guessing.

Rules:
- Every number that is an estimate is called an estimate (saved $, saved kg, discounts, km equivalents). Metered kWh
  and kW are measured.
- Never claim a certificate, renewable electrons, or physical attribution; the signal is marginal and temporal.
- Never say an action was taken. You cannot press anything. The operator clicks. End with at most two suggested
  actions, each on its own line, exactly in the form: label -> /ops/<page>. Pages: /ops/overview, /ops/sites (live
  charging), /ops/sessions, /ops/chargers, /ops/schedules (plan), /ops/impact, /ops/alerts, /ops/tariffs.
- Keep answers under 120 words unless the operator asks for detail. Plain words, no headings.
- "What if X fails" -> walk the ladder from the current rung: live -> cached -> tariff -> deadline -> full (static
  safe share on the charger). Say what each rung still guarantees.
- Money questions use the shared-savings formula (business 7b) with this site's R, alpha, beta and package from
  site_state. When R is 0, charging is free and the driver-side incentive is non-monetary.
- Do not speculate about other sites, other days, or the grid beyond today's signal summary.
- After the suggested actions, end with one line: [sources: <comma-separated knowledge section names you used>].
If no tool or state can answer what was asked, say so instead of guessing. Do not include internal XML tags in your response."""

SYSTEM = [
    {"type": "text", "text": RULES, "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": KNOWLEDGE, "cache_control": {"type": "ephemeral"}},
]

ACTION_RE = re.compile(r"^[ \t]*(?:[-*•]\s*)?\**(.+?)\**\s*(?:→|->)\s*`?(/ops/[\w/-]*)`?\**\s*$", re.M)
SOURCES_RE = re.compile(r"\[sources?:\s*([^\]]*)\]\s*", re.I)
BAY_RE = re.compile(r"\bc\d{2}\b", re.I)


# ---- snapshot ----
def snapshot(pin=()):
    """A plain dict from api.S, no I/O. Reuses the REST builders so every number matches the dashboard.
    `pin`: connector ids the question names; they always make the row cut."""
    from . import api  # lazy: api imports this module
    S, sim = api.S, api.S["sim"]
    now = sim.now
    status = api.site_status(S["site"]["id"]).model_dump(mode="json")
    impact = api.site_impact(S["site"]["id"], None, None).model_dump(mode="json")
    k0 = int((api.slot_start(now) - api.slot_start(S["plan_at"])).total_seconds() // 300) if S["plan_at"] else 0
    rows = []
    for c in api.meter_msg().connectors:
        if c.session_id is None:
            continue
        rem = max(0.0, c.kwh_needed - c.kwh_delivered)
        mins = (c.departure_at - now).total_seconds() / 60
        rows.append({
            "connector": c.connector_id, "session": c.session_id, "status": c.status, "kw": c.kw,
            "plan_kw_next_6": [round(x, 2) for x in S["plan"].get(c.connector_id, [])[k0:k0 + 6]],
            "kwh_delivered": round(c.kwh_delivered, 2), "kwh_needed": c.kwh_needed, "cap_kw": c.p_max_kw,
            "departure": c.departure_at.strftime("%H:%M"), "slack_h": round(mins / 60 - rem / c.p_max_kw, 2),
            "urgency": c.urgency, "boost": c.boost, "asap_bay": c.asap, "move_by": c.move_by,
            "risk": "high" if mins < 30 and c.kwh_delivered < 0.9 * c.kwh_needed and c.status != "done" else "low",
            "idle_min": c.idle_min, "cap_observed": c.cap_observed, "need_confidence": c.need_confidence})
    counts = {"plugged": len(rows), "charging": sum(r["status"] == "charging" for r in rows),
              "done": sum(r["status"] == "done" for r in rows), "at_risk": sum(r["risk"] == "high" for r in rows),
              "urgent": sum(bool(r["urgency"] or r["boost"]) for r in rows),
              "free_bays": status["n_connectors"] - len(rows), "waiting": status["waiting"]}
    rows.sort(key=lambda r: (r["connector"] not in pin, r["risk"] != "high", not (r["urgency"] or r["boost"]),
                             r["status"] != "charging", r["status"] != "done", r["slack_h"]))
    moer, price = S["signal"]["moer"], S["tariff"]["price_per_kwh"]
    per = len(moer) // 24
    hourly = [sum(moer[h * per:(h + 1) * per]) / per for h in range(24)]
    hp = [round(sum(price[h * 12:(h + 1) * 12]) / 12, 4) for h in range(24)]
    bands, start = [], 0
    for h in range(1, 25):
        if h == 24 or hp[h] != hp[start]:
            bands.append({"from_hour": start, "to_hour": h, "usd_per_kwh": hp[start]})
            start = h
    site_keys = ("feed_kw", "block_kw", "contracted_peak_kw", "safe_share_kw", "n_connectors", "p_max_kw", "package",
                 "employee_rate_usd_per_kwh", "driver_share", "noonshift_share", "connectors_asap")
    snap = {
        "sim_time": now.isoformat(timespec="minutes"), "mode": status["mode"], "ladder": status["ladder"],
        "site": {k: status[k] for k in site_keys}, "impact": impact, "status": status,
        "site_kw_now": round(sum(c.kw for c in sim.connectors.values()), 2),
        "building_kw_now": S["site"]["building_load_kw"][api.slot_of(now)],
        "connectors": rows[:MAX_ROWS], "counts": counts, "waiting": status["waiting"],
        "events": list(S.get("events", [])),
        "signal": {"kind": S["signal"].get("kind"), "source": S["signal"].get("source"), "date": S["signal"].get("date"),
                   "moer_min": round(min(moer), 1), "moer_max": round(max(moer), 1), "moer_mean": round(sum(moer) / len(moer), 1),
                   "zero_hours": [h for h in range(24) if hourly[h] == 0], "hourly_gco2_per_kwh": [round(x) for x in hourly]},
        "tariff": {"name": S["tariff"].get("name"), "bands": bands, "block_kw": S["tariff"].get("block_kw"),
                   "block_price_usd_per_kw": S["tariff"].get("block_price"), "overage_multiplier": S["tariff"].get("overage_multiplier")},
    }
    while len(json.dumps(snap)) > SNAPSHOT_CHARS and snap["events"]:  # ponytail: events are the only elastic part
        snap["events"] = snap["events"][1:]
    return snap


# ---- model ----
def parse(text):
    """Split the model's answer into (answer, sources, suggested_actions) per the RULES format."""
    sources = []
    m = SOURCES_RE.search(text)
    if m:
        sources = [s.strip() for s in m.group(1).split(",") if s.strip()]
        text = text[:m.start()] + text[m.end():]
    actions = [{"label": lbl.strip(" *`"), "path": path} for lbl, path in ACTION_RE.findall(text)][:2]
    text = ACTION_RE.sub("", text)
    text = re.sub(r"(?im)^\s*\**suggested actions?:?\**\s*$\n?", "", text)
    text = re.sub(r"</?(site_state|page)>", "", text)
    return text.strip(), sources, actions


def ask(question, history=(), page="", snap=None):
    """Returns (payload, http_status). The model when a key works; the deterministic fallback otherwise."""
    snap = snap or snapshot(pin={b.lower() for b in BAY_RE.findall(question)})
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return fallback(question, snap), 200
    import anthropic
    messages = [{"role": t["role"], "content": t["content"]} for t in list(history)[-6:]]
    messages.append({"role": "user", "content": f"<site_state>{json.dumps(snap, sort_keys=True)}</site_state>\n<page>{page}</page>\n{question}"})
    try:
        resp = anthropic.Anthropic().messages.create(
            model=MODEL, max_tokens=1024, thinking={"type": "adaptive"}, output_config={"effort": "low"},
            system=SYSTEM, messages=messages)
    except anthropic.AuthenticationError as e:
        log.warning("assist: bad key, falling back (request_id=%s)", getattr(e, "request_id", None))
        return fallback(question, snap), 200
    except anthropic.RateLimitError as e:
        log.warning("assist: model rate limit (request_id=%s)", getattr(e, "request_id", None))
        return {"detail": "The assistant is rate-limited by the model API; try again shortly.", "retry_after": 20}, 429
    except (anthropic.APIConnectionError, anthropic.APIStatusError) as e:
        log.warning("assist: %s, degraded fallback (request_id=%s)", type(e).__name__, getattr(e, "request_id", None))
        return {**fallback(question, snap), "degraded": True}, 200
    answer, sources, actions = parse("".join(b.text for b in resp.content if b.type == "text"))
    return {"answer": answer, "sources": sources, "suggested_actions": actions, "usage": resp.usage.model_dump()}, 200


# ---- rate limit ----
_hits = defaultdict(deque)


def allow(ip, limit=10, window=60.0, now=None):
    """10 requests per minute per client IP. ponytail: in-process; a shared store when there is more than one worker."""
    q, now = _hits[ip], time.monotonic() if now is None else now
    while q and q[0] <= now - window:
        q.popleft()
    if len(q) >= limit:
        return False
    q.append(now)
    return True


# ---- deterministic fallback ----
def _out(answer, sources, actions):
    return {"answer": answer, "sources": sources, "suggested_actions": [{"label": l, "path": p} for l, p in actions], "fallback": True}


def _hhmm(iso):
    return iso[11:16] if iso and len(iso) >= 16 else str(iso)


def _bay(q, snap):
    bay = BAY_RE.search(q).group(0).lower()
    row = next((r for r in snap["connectors"] if r["connector"] == bay), None)
    if row is None:
        n = snap["counts"]["plugged"]
        return _out(f"Bay {bay} is not among the {min(n, MAX_ROWS)} most relevant plugged bays in my snapshot ({n} plugged, "
                    f"{snap['counts']['free_bays']} free). The Chargers page lists every bay with its live kW and plan cap.",
                    ["The scheduler"], [("Open Chargers", "/ops/chargers")])
    if row["status"] == "done":
        why = f"finished ({row['kwh_delivered']} of {row['kwh_needed']} kWh) and has been idle {row['idle_min']} min"
    elif row["cap_observed"]:
        why = (f"capped by the observation guard: the car drew well under its limit for 5 minutes, so the planner now believes the "
               f"meter ({row['cap_kw']} kW). That is the car, not the charger")
    elif row["kw"] <= 1.5 and row["slack_h"] > 0.5:
        clean = snap["signal"]["zero_hours"]
        when = f" (today's zero-carbon hours are {clean[0]:02d}:00–{clean[-1] + 1:02d}:00)" if clean else ""
        hold = "the 1.4 kW (6 A) floor" if row["kw"] > 0 else "an empty slot in its plan"
        why = (f"deferred: {hold}. It has {row['slack_h']} h of slack before {row['departure']}, so the plan moves the bulk of its "
               f"{row['kwh_needed']} kWh to cleaner or cheaper slots inside that deadline{when}; next slots {row['plan_kw_next_6']} kW. Not a fault")
    elif row["urgency"] or row["boost"]:
        why = f"urgent ({row['urgency'] or 'asap bay'}): first claim on site headroom at up to {row['cap_kw']} kW"
    else:
        why = f"in its planned window: next slots {row['plan_kw_next_6']} kW, deadline {row['departure']}, slack {row['slack_h']} h"
    return _out(f"Bay {bay} is at {row['kw']} kW, {row['kwh_delivered']} of {row['kwh_needed']} kWh delivered — {why}.",
                ["The scheduler"], [("Open the bay", "/ops/chargers"), ("See the plan", "/ops/schedules")])


def _risk(q, snap):
    hi = [r for r in snap["connectors"] if r["risk"] == "high"]
    n = snap["counts"]["at_risk"]
    if n == 0:
        return _out("No session is at risk right now: every plugged car is on track for its stated departure (the LP treats each deadline "
                    "as a hard constraint with an explicit, priced shortfall, and the first-hour and progress floors keep early leavers "
                    "covered). If cars arrive faster than the feed allows, the shortfall is shared fairly and the Sessions page flags it.",
                    ["The scheduler", "Driver-side guarantees"], [("Open Sessions", "/ops/sessions")])
    lines = "; ".join(f"{r['connector']} leaves {r['departure']} with {r['kwh_delivered']}/{r['kwh_needed']} kWh" for r in hi[:5])
    return _out(f"{n} session{'s' if n > 1 else ''} at risk — departure inside 30 minutes with under 90 % of the stated need: {lines}. "
                "Usual causes: a late plug-in with a short deadline, the site oversubscribed (shortfall shared by the fairness term), or an "
                "observed cap on the car. A driver can press 'Leaving now' for full power at rate R; the operator cannot exceed the feed.",
                ["The scheduler", "Urgency — three bands, one price"], [("Open Sessions", "/ops/sessions"), ("Live charging", "/ops/sites")])


LADDER = [("live", "marginal CO₂ + tariff + deadlines"), ("cached", "the last forecast, good for 6 h"),
          ("tariff", "tariff + deadlines, no carbon"), ("deadline", "earliest-deadline-first only"),
          ("full", "no solve: every bay holds its static safe share")]


def _outage(q, snap):
    mode = snap["mode"]
    i = next(k for k, (m, _) in enumerate(LADDER) if m == mode)
    walk = " → ".join(f"{m} ({d})" for m, d in LADDER[i:])
    share = snap["site"]["safe_share_kw"]
    return _out(f"We are on the '{mode}' rung. If the grid API dies the ladder steps down: {walk}. Every rung that solves still honours "
                f"deadlines and the feed; the last rung is the {share} kW static share that lives on each charger itself, so even with the "
                f"backend gone the sum over {snap['site']['n_connectors']} bays stays under the {snap['site']['feed_kw']} kW feed. Nobody is stranded; "
                "the plan gets less clean, not less safe.",
                ["The fail-safe ladder", "OCPP"], [("Watch the mode", "/ops/overview"), ("Alerts", "/ops/alerts")])


def _co2(q, snap):
    im = snap["impact"]
    kg = im["saved_kgco2"]
    return _out(f"Today so far (estimate, vs charging at plug-in): {kg} kg CO₂ and ${im['saved_usd']} saved across {im['sessions']} sessions "
                f"and {im['kwh']} kWh metered — about {kg / 0.25:.0f} km not driven or {kg / 2.31:.1f} L of petrol (EPA factors). "
                f"{100 * im['renewable_share']:.0f} % of the kWh went in at zero marginal carbon (renewable-hour share). Site peak {im['peak_kw']} kW "
                f"vs {im['baseline_peak_kw']} kW charge-now.",
                ["Carbon into things people picture", "Renewable share"], [("Energy & Impact", "/ops/impact"), ("Download the ledger", "/ops/impact")])


def _urgency(q, snap):
    r = snap["site"]["employee_rate_usd_per_kwh"]
    return _out(f"Three driver buttons, one price. 'Leaving now' sets the deadline to now: full power immediately, first claim on headroom. "
                f"'Leaving soon' takes a time (15 min or later) and the plan fills the cleanest slots inside it. 'Prioritise' keeps the deadline "
                f"but raises the car's floor to 90 % of pro-rata and doubles its weight, so it wins ties. Every urgent session pays the "
                f"traditional rate R = ${r}/kWh and forfeits the shared-savings discount — that is why nobody presses it to jump the queue. "
                f"{snap['counts']['urgent']} urgent right now.",
                ["Urgency — three bands, one price"], [("Sessions", "/ops/sessions")])


def _safe_share(q, snap):
    s = snap["site"]
    return _out(f"The safe share is {s['safe_share_kw']} kW per bay: min(bay max {s['p_max_kw']} kW, (feed {s['feed_kw']} kW − peak building load) / "
                f"{s['n_connectors']} bays). It is the static OCPP profile (stack 0, no expiry) under the dynamic plan (stack 1, 15-min validity), "
                "so a charger that stops hearing from us reverts to it by itself. An inspector accepts it because the sum over every bay never "
                "exceeds the feed with no software running.",
                ["The fail-safe ladder", "OCPP"], [("Chargers", "/ops/chargers")])


def _load(q, snap):
    s, im = snap["site"], snap["impact"]
    total = snap["site_kw_now"] + snap["building_kw_now"]
    return _out(f"Right now the chargers draw {snap['site_kw_now']} kW on top of {snap['building_kw_now']} kW building load = {total:.1f} kW, "
                f"against a {s['block_kw']} kW tariff block, {s['contracted_peak_kw']} kW contracted peak and {s['feed_kw']} kW feed. The feed is a "
                f"hard constraint; the block is priced (overage from the demand charge) and is crossed only when deadlines or floors need it. "
                f"Today's managed peak {im['peak_kw']} kW vs {im['baseline_peak_kw']} kW if everyone charged at plug-in.",
                ["The scheduler", "The customer"], [("Overview", "/ops/overview"), ("Plan", "/ops/schedules")])


def _queue(q, snap):
    w, mv = snap["waiting"], [r for r in snap["connectors"] if r["move_by"]]
    done = [r for r in snap["connectors"] if r["status"] == "done"]
    mvs = ", ".join(f"{r['connector']} by {r['departure']}" for r in mv[:5]) or "none yet"
    return _out(f"{w} car{'s' if w != 1 else ''} waiting for a bay. Done cars idle 10 min or more are asked to move first "
                f"({len(done)} done now); then, one per waiting car, the plugged car with the most slack gets a move-by time = now + time to "
                f"finish at full power (move-by set: {mvs}). Never a car under 1 h of slack, never an urgent one.",
                ["The scheduler"], [("Live charging", "/ops/sites")])


def _money(q, snap):
    s, im = snap["site"], snap["impact"]
    r, a, b = s["employee_rate_usd_per_kwh"], s["driver_share"], s["noonshift_share"]
    disc = a * im["saved_usd"] / im["kwh"] if im["kwh"] else 0.0
    free = " Charging is free here (R = 0), so the driver-side incentive is non-monetary: a guaranteed charge by leave time and a fair rotation." if r == 0 else ""
    return _out(f"Package: {s['package']}. Drivers pay R = ${r}/kWh minus a shared-savings discount: price = R − α·S/E with α = {a}, where S is that "
                f"session's measured saving vs charge-now and E its kWh; urgent sessions pay R. Today's site saving rate is about "
                f"${disc:.4f}/kWh to the driver (estimate). Split: driver α = {a}, Noonshift β = {b}, the site keeps the rest — the site never "
                f"earns less than today.{free}",
                ["The shared-savings price", "The customer"], [("Tariffs & Package", "/ops/tariffs")])


def _signal(q, snap):
    sg = snap["signal"]
    z = sg["zero_hours"]
    win = f"{z[0]:02d}:00–{z[-1] + 1:02d}:00" if z else "none today"
    return _out(f"Today's signal is {sg['kind']} carbon from {sg['source']}: {sg['moer_min']}–{sg['moer_max']} g/kWh, mean {sg['moer_mean']}. "
                f"Zero-carbon hours (the marginal plant is renewable): {win}. The plan moves flexible energy into that window and charges the "
                f"rest where the tariff is lowest, within every deadline. When the kind is 'average' we say 'cleaner than average', not 'renewable'.",
                ["Renewable share", "The scheduler"], [("Plan", "/ops/schedules"), ("Energy & Impact", "/ops/impact")])


def _trickle(q, snap):
    z = snap["signal"]["zero_hours"]
    when = f" Today that window is {z[0]:02d}:00–{z[-1] + 1:02d}:00." if z else ""
    return _out("1.4 kW is the 6 A floor (IEC 61851): a car is never asked for a smaller trickle, so any allocation between 0 and 1.4 kW "
                "rounds up to it. A deferred car draws 0 kW in the slots its plan leaves empty and resumes in its window; the bulk of its "
                "energy is planned into cleaner or cheaper slots inside its deadline, and the first-hour floor (min(need, 3.5 kWh) in 60 min) "
                f"and the 30-min progress floor still apply.{when} Ask about a specific bay (e.g. c07) for its numbers.",
                ["The scheduler"], [("Chargers", "/ops/chargers")])


def _early(q, snap):
    return _out("A driver who leaves before the time they gave still leaves with a usable charge: the first-hour floor puts min(need, 3.5 kWh) "
                "in the car within 60 minutes of plugging in, and the progress floor keeps every car at or above 50 % of pro-rata at every 30-minute "
                "checkpoint since arrival (90 % for a prioritised car). The receipt states plainly how many kWh short of the stated need the car left, "
                "the plan re-solves without it at once, and the ops feed logs an 'unplug' event with the stated and actual times.",
                ["The scheduler", "Driver-side guarantees", "Hard questions"], [("Sessions", "/ops/sessions"), ("Alerts", "/ops/alerts")])


def _done(q, snap):
    done = [r for r in snap["connectors"] if r["status"] == "done"]
    lst = ", ".join(f"{r['connector']} ({r['idle_min']} min idle)" for r in done[:8]) or "none"
    return _out(f"{snap['counts']['done']} car{'s' if snap['counts']['done'] != 1 else ''} finished and still plugged: {lst}. A done car is "
                f"notified; when someone is waiting it is asked to move after 10 idle minutes. Bays: {snap['counts']['free_bays']} free, "
                f"{snap['waiting']} waiting.",
                ["The scheduler"], [("Live charging", "/ops/sites")])


ROUTES = [
    (("at risk", "risk", "miss", "short", "late", "deadline"), _risk),
    (("dies", "outage", "fail", "down", "offline", "ladder", "mode", "backend", "rung"), _outage),
    (("safe share", "static", "inspector", "1.83"), _safe_share),
    (("co2", "co₂", "carbon", "kg", "km", "saved", "save", "impact", "renewable"), _co2),
    (("boost", "urgen", "leaving", "priorit", "emergency", "sooner"), _urgency),
    (("1.4", "trickle", "minimum", "paused", "pause"), _trickle),
    (("early", "before the time", "before they said", "leaves before", "left before", "pulls the plug"), _early),
    (("done", "idle", "finished", "unplug"), _done),
    (("waiting", "queue", "move", "rotate", "more cars", "than bays", "than plugs"), _queue),
    (("price", "pay", "cost", "discount", "rate", "$", "money", "package", "alpha", "beta", "profit", "bill"), _money),
    (("load", "block", "feed", "peak", "limit", "contracted", "overage", "kw", "overcharge", "circuit", "bug", "exceed"), _load),
    (("signal", "moer", "solar", "clean", "cleanest", "grid", "window"), _signal),
]


def fallback(question, snap):
    """No network: keyword-route to a template filled from the snapshot. Unknown -> the starter questions."""
    q = question.lower()
    if BAY_RE.search(q):
        return _bay(q, snap)
    for keys, fn in ROUTES:
        if any(k in q for k in keys):
            return fn(q, snap)
    return _out("I can answer about today's site state and how Noonshift works; try one of: " + " · ".join(suggestions(snap)),
                [], [("Overview", "/ops/overview")])


def suggestions(snap):
    """Six starter questions built from the current state."""
    c, m = snap["counts"], snap["mode"]
    charging = [r for r in snap["connectors"] if r["status"] == "charging"]
    low = min((r for r in charging if 0 < r["kw"] <= 1.5), key=lambda r: r["kw"], default=None) or min(charging, key=lambda r: r["kw"], default=None)
    return [
        f"{c['at_risk']} sessions are at risk — why?" if c["at_risk"] else "Is any car going to miss its deadline?",
        f"{snap['waiting']} cars are waiting — who moves first?" if snap["waiting"] else "What happens when more cars arrive than bays?",
        f"We are in {m} mode — what does that mean?" if m != "live" else "What happens if the grid API dies?",
        f"Why is bay {low['connector']} only getting {low['kw']} kW?" if low else "Why would a bay sit at 0 or 1.4 kW?",
        "How much CO₂ did we save today, in km?",
        f"{c['done']} cars are done — should they move?" if c["done"] else "What does a driver pay today?",
    ]
