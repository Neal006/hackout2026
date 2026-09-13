"""Elastic LP scheduler. Drop-in for the stub: same three signatures, same dict contract, nothing else changes.

Conventions the caller (api.py) relies on:
- Every list "per slot" is aligned: index 0 is the 5-min slot containing `now`, HORIZON slots follow, wrapping the day.
  Only the remainder of slot 0 is ahead of `now`; the LP counts it that way (`dur[0]`), or a mid-slot re-solve after
  every plug-in event books energy that can no longer be delivered.
- Fail-safe rungs shape the inputs, not the call: tariff-only => signal == {"moer": [], "kind": None};
  deadline-only => additionally tariff["price_per_kwh"] == []. Full-power rung never calls solve().
- The charge-immediately baseline is solve() with every departure = now (all cars ASAP, see below).

The LP (proposal 4.4). p[i,t] = kW for car i in slot t, s[i] = shortfall kWh, over = site kW above the tariff block.
  minimise   sum p * SLOT_H * (price[t] + W_CARBON * moer[t] / 1000)  +  M_SHORT * s[i]  +  overage_usd_per_kw * over
  1. energy    sum_{t < deadline} p * SLOT_H + s[i] >= e_rem[i]                (elastic: the LP is never infeasible)
  2. floor     delivered + planned energy by each 30-min checkpoint since arrival >= ALPHA * pro-rata * (need - s[i])
               (fairness + early-unplug safety; anchored to arrival so a rolling re-solve cannot defer it);
               per-car floor_alpha (urgency "priority") replaces ALPHA
  2b. first hour  energy 60 min after plug-in >= min(need, FIRST_HOUR_KWH): never worse than a dumb charger in the
               hour an emergency is most likely (business.md §4); elastic through the same floor slack, so it beats
               the signal and the tariff block but never the feed (rule 5 is hard: the building peak is the customer's)
  3. sprint    the last 30 min before the deadline carry a BUFFER_COST surcharge, so a feasible car finishes early and
               the buffer is spent only by cars that would otherwise fall short (and by re-solves after a bad forecast)
  4. charger   0 <= p <= p_max_kw
  5. site      sum_i p[i,t] <= feed_kw - building_load_kw[t]
  block        sum_i p[i,t] - over <= block_kw
  cap          sum_{t < deadline} p * SLOT_H <= e_rem[i]                       (never plan more than the car can take)
  fairness     priority[i] * s[i] / e_rem[i] <= z, z priced at M_SHORT * mean(e_rem): a linear shortfall penalty alone
               starves whole cars when the lot is oversubscribed; minimising the worst fraction spreads the shortfall
               instead. A priority car (urgency) also pays priority * M_SHORT per kWh short, so it gives way last.
ASAP cars (deadline already passed, or Boost): slot cost is only the earliest-first tie-break, so they charge now.
When every car is ASAP (the baseline call) the block-overage term is dropped: charge-immediately means exactly that.
"""
import logging
import math
import time
from datetime import timedelta

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

log = logging.getLogger(__name__)

HORIZON = 288
SLOT_H = 5 / 60
MIN_KW = 1.4        # 6 A x 240 V, the IEC 61851 floor: allocations in (0, MIN_KW) round up, never pause
W_CARBON = 0.05     # $/kg CO2 (= $50/t) trading carbon against tariff; prove.py sweeps this
ALPHA = 0.5         # progress floor: every car holds >= half its pro-rata energy at every checkpoint
FLOOR_EVERY = 6     # checkpoint every 30 min. Hourly looked smoother on the Gantt but let a car sit at 0 kWh for 59 min
FIRST_HOUR_KWH = 3.5  # business.md §4: what a dumb 7 kW charger gives in 30 min; every car has it 60 min after plug-in
FIRST_HOUR = timedelta(hours=1)
FIRST_HOUR_SLOTS = 12
FLOOR_STEP = timedelta(minutes=5 * FLOOR_EVERY)
SLOT = timedelta(minutes=5)
SPRINT_SLOTS = 6    # last 30 min before the deadline are a buffer: used only when the car would otherwise fall short
BUFFER_COST = 1.0   # $/kWh surcharge on buffer slots, >> any tariff spread and << M_SHORT
M_SHORT = 10.0      # $/kWh shortfall penalty, >> any per-kWh cost, so shortfall is the last resort
M_FLOOR = 1.0       # $/kWh for missing a progress-floor checkpoint: > any slot cost, << M_SHORT
EPS = 1e-7          # earliest-first tie-break per slot, << any real cost difference
ASAP_EPS = 1e-3     # earliest-first cost for ASAP cars, which have no other cost: 1e-7 alone left HiGHS "Unknown"
E_MIN = 0.05        # kWh; a car this close to full just finishes at MIN_KW in the first slot, no LP juggling
TAPER_SOC = 0.8     # batteries taper above this state of charge; the sim goes linearly to TAPER_MIN at full
TAPER_MIN = 0.1     # fraction of p_max at 100%
TAPER_AVG = 0.3     # mean power fraction over the last 20%: integrating the linear taper gives ~0.66*need/p_max hours
DAYS_PER_MONTH = 30 # tariff block overage is billed monthly; one day carries 1/30 of it


def _per_slot(xs, default=0.0):
    """Length-HORIZON float array. [] -> default everywhere; NaN/inf -> mean of the rest; short -> pad with last."""
    a = np.asarray(list(xs or [])[:HORIZON], dtype=float)
    if a.size == 0:
        return np.full(HORIZON, float(default))
    ok = np.isfinite(a)
    a = np.where(ok, a, a[ok].mean() if ok.any() else default)
    if a.size < HORIZON:
        a = np.concatenate([a, np.full(HORIZON - a.size, a[-1])])
    return a


def _slots_until(t, now):
    """Whole-or-partial 5-min slots from now until t, clamped to [0, HORIZON]."""
    return max(0, min(HORIZON, math.ceil((t - now).total_seconds() / 300)))


def _full_power(cars, site=None):
    """No plan: each charger on the site's static share (solutions.md §5), or its own max when no share is configured."""
    share = (site or {}).get("safe_share_kw") or math.inf
    return {c["connector_id"]: [float(min(share, c["p_max_kw"]))] * HORIZON for c in cars}


def solve_lp(cars, site, signal, tariff, now):
    """solve() plus an info dict: {shortfall_kwh: {cid: kWh}, asap: [cid], status, solve_ms}."""
    info = {"shortfall_kwh": {}, "asap": [], "status": "empty", "solve_ms": 0.0}
    if not cars:
        return {}, info
    n, H = len(cars), HORIZON
    moer = _per_slot(signal.get("moer"))
    price = _per_slot(tariff.get("price_per_kwh"))
    avail = np.maximum(site["feed_kw"] - _per_slot(site.get("building_load_kw")), 0.0)
    overage = tariff.get("block_price", 0.0) * tariff.get("overage_multiplier", 2.0) / DAYS_PER_MONTH
    t0 = now.replace(minute=now.minute - now.minute % 5, second=0, microsecond=0)  # start of slot 0
    dur = np.full(H, SLOT_H)                                              # hours per slot; slot 0 = what is left of it
    dur[0] = max(1 / 3600, (t0 + SLOT - now).total_seconds() / 3600)
    slot_cost = dur * (price + W_CARBON * moer / 1000) + EPS * np.arange(H)

    S = lambda i: n * H + i          # shortfall column of car i
    OVER = n * H + n
    Z = OVER + 1                     # worst shortfall fraction over all cars (min-max fairness)
    F = lambda i: Z + 1 + i          # progress-floor slack of car i
    nv = Z + 1 + n
    c, hi = np.zeros(nv), np.zeros(nv)
    e_rems, finish = [], []
    rows, cols, vals, b = [], [], [], []
    k = 0

    def row(coeffs, rhs):
        nonlocal k
        for j, v in coeffs:
            rows.append(k); cols.append(j); vals.append(v)
        b.append(rhs); k += 1

    for i, car in enumerate(cars):
        cid, base = car["connector_id"], i * H
        need, done = float(car["kwh_needed"]), float(car.get("kwh_delivered", 0.0))
        e_rem = max(0.0, need - done)
        p_max = max(0.0, float(car["p_max_kw"]))
        soc = done / need if need > 0 else 1.0
        if soc >= TAPER_SOC:  # already tapering: the car cannot draw p_max any more, and it only gets slower
            p_max *= max(TAPER_MIN, (1 - soc) / (1 - TAPER_SOC))
        fa = float(car.get("floor_alpha", ALPHA))        # urgency "priority": 0.9
        prio = max(1.0, float(car.get("priority", 1.0)))  # urgency "priority": 2.0
        d = _slots_until(car["departure"], now)
        asap = d == 0 or bool(car.get("boost"))
        if asap:
            info["asap"].append(cid)
            d = H if d == 0 else d
        if e_rem <= 0 or p_max <= 0:
            continue
        if e_rem < E_MIN:
            finish.append(i)
            continue
        end = d if asap or d <= SPRINT_SLOTS else d - SPRINT_SLOTS     # rule 3: 30-min buffer
        for t in range(d):
            c[base + t] = ASAP_EPS * t if asap else slot_cost[t] + (BUFFER_COST * dur[t] if t >= end else 0.0)
            hi[base + t] = p_max
        c[S(i)], hi[S(i)] = M_SHORT * prio, e_rem
        e_rems.append(e_rem)
        row([(base + t, -dur[t]) for t in range(d)] + [(S(i), -1.0)], -e_rem)          # rule 1 (elastic)
        row([(base + t, dur[t]) for t in range(d)], e_rem)                              # cap
        e_fast = max(0.0, TAPER_SOC * need - done)                                      # energy below the taper knee
        if not asap and e_rem > e_fast > 0:
            # the slow tail (above the knee) draws ~TAPER_AVG * p_max: the fast part must be done early enough to
            # leave it time, or the tail spills past the deadline (winter replay: 22 cars 0.2 kWh short)
            tail = math.ceil((e_rem - e_fast) / (TAPER_AVG * p_max) / SLOT_H)
            if 0 < tail < end:  # elastic through the floor slack, never through the total shortfall
                row([(base + t, -dur[t]) for t in range(end - tail)] + [(F(i), -1.0)], -e_fast)
        row([(S(i), prio), (Z, -e_rem)], 0.0)                                           # prio * s[i] / e_rem[i] <= z
        if not asap:
            # rule 2 (elastic), anchored to arrival: a checkpoint every FLOOR_EVERY slots since plug-in, target
            # fa * pro-rata of the whole need, counting energy already delivered. Anchoring to `now` instead
            # lets a 5-min rolling re-solve defer the floor forever (the first checkpoint is always 30 min away).
            # Checkpoints are times, not slot counts: the slot containing a mark counts pro rata, so "60 min after
            # plug-in" means 60 min whichever minute of a slot the re-solve fires in.
            arrival = car.get("arrival", now)
            horizon_end = t0 + end * SLOT                                                   # deadline minus buffer
            span = (horizon_end - arrival).total_seconds()

            def before(mark):
                """Energy delivered by `mark`: -hours of each slot that lie in [now, mark), as LP coefficients."""
                out = []
                for t in range(min(end, math.ceil((mark - t0).total_seconds() / 300))):
                    h = (min(mark, t0 + (t + 1) * SLOT) - max(now, t0 + t * SLOT)).total_seconds() / 3600
                    if h > 0:
                        out.append((base + t, -h))
                return out

            m = 1
            while span > 0 and arrival + m * FLOOR_STEP <= horizon_end:
                mark = arrival + m * FLOOR_STEP
                m += 1
                if mark <= now:
                    continue
                frac = (mark - arrival).total_seconds() / span
                row(before(mark) + [(S(i), -fa * frac), (F(i), -1.0)], done - fa * frac * need)
            mark = arrival + FIRST_HOUR                                                      # rule 2b
            if now < mark <= horizon_end:
                row(before(mark) + [(F(i), -1.0)], done - min(need, FIRST_HOUR_KWH))
            c[F(i)], hi[F(i)] = M_FLOOR, need
    pure_asap = len(info["asap"]) == n
    reserved = sum(min(MIN_KW, float(cars[i]["p_max_kw"])) for i in finish)  # finishing cars draw MIN_KW in slot 0
    for t in range(H):
        held = reserved if t == 0 else 0.0
        row([(i * H + t, 1.0) for i in range(n)], max(0.0, avail[t] - held))           # rule 5
        if not pure_asap:
            row([(i * H + t, 1.0) for i in range(n)] + [(OVER, -1.0)], site.get("block_kw", math.inf) - held)
    c[OVER], hi[OVER] = (0.0 if pure_asap else overage), math.inf
    c[Z], hi[Z] = M_SHORT * (sum(e_rems) / len(e_rems) if e_rems else 0.0), 1.0   # a mean car's worth of shortfall

    A = coo_matrix((vals, (rows, cols)), shape=(k, nv)).tocsr()
    t0 = time.perf_counter()
    res = linprog(c, A_ub=A, b_ub=np.array(b), bounds=np.c_[np.zeros(nv), hi], method="highs")
    info["solve_ms"] = round(1000 * (time.perf_counter() - t0), 1)
    if res.status != 0:  # elastic LP cannot be infeasible; if HiGHS still fails, fail open like the ladder does
        log.error("linprog status %s (%s); falling back to full power", res.status, res.message)
        info["status"] = f"fallback:{res.status}"
        return _full_power(cars, site), info
    info["status"] = "optimal"
    x = res.x
    plan = {car["connector_id"]: np.maximum(x[i * H:(i + 1) * H], 0.0) for i, car in enumerate(cars)}
    for i in finish:
        plan[cars[i]["connector_id"]][0] = min(MIN_KW, float(cars[i]["p_max_kw"]))
    info["shortfall_kwh"] = {car["connector_id"]: round(float(x[S(i)]), 4) for i, car in enumerate(cars)}
    # rounding up to 6 A may not create block overage the LP did not choose; a chosen overage (over > 0) stands
    lp_site = sum(plan.values())
    cap = avail if pure_asap else np.minimum(avail, np.maximum(site.get("block_kw", math.inf), lp_site + 1e-9))
    _enforce_min_kw(plan, cars, cap, now)
    return {cid: [math.floor(float(v) * 1000 + 1e-6) / 1000 for v in p] for cid, p in plan.items()}, info  # round down: never over the limit


def _enforce_min_kw(plan, cars, cap, now):
    """Post-step, in place. EVs cannot charge below 6 A, so any allocation in (0, MIN_KW) rounds up to MIN_KW
    (some EVs never resume after a pause). Rounding can push a slot over `cap` (site headroom, and the tariff
    block unless the LP itself exceeded it); trim the cars with the most slack first, and a trimmed car drops
    to 0, never to a value below MIN_KW. The energy lost to a trim is picked up by the next re-solve."""
    floor = {c["connector_id"]: min(MIN_KW, float(c["p_max_kw"])) for c in cars}
    rounded = {}
    for cid, p in plan.items():
        up = (p > 1e-9) & (p < floor[cid])
        p[up] = floor[cid]
        for t in np.flatnonzero(up):
            rounded.setdefault(int(t), []).append(cid)
    slack_order = [c["connector_id"] for c in sorted(cars, key=lambda c: -_slots_until(c["departure"], now))]
    for t in range(HORIZON):
        excess = sum(p[t] for p in plan.values()) - cap[t]
        for cid in rounded.get(t, []) + slack_order:  # the cars whose round-up caused the excess give way first
            if excess <= 1e-9:
                break
            p = plan[cid]
            if p[t] <= 0:
                continue
            cut = min(p[t], excess)
            keep = p[t] - cut
            if 0 < keep < floor[cid]:
                cut, keep = p[t], 0.0
            p[t], excess = keep, excess - cut


def solve(cars, site, signal, tariff, now) -> dict[str, list[float]]:
    """cars: [{connector_id, arrival, departure, kwh_needed, kwh_delivered, p_max_kw, boost, floor_alpha?, priority?}]
    site: {feed_kw, building_load_kw: [per slot], block_kw}
    signal: {moer: [gCO2/kWh per slot], kind: "marginal"|"average"|None}
    tariff: {price_per_kwh: [per slot], block_price, overage_multiplier}
    returns {connector_id: [kW per slot from now to horizon]}"""
    return solve_lp(cars, site, signal, tariff, now)[0]


def _totals(plan, moer, price, tariff, health=None):
    """kWh, $ (energy + this day's share of block overage), kg CO2, peak kW and (with a health-damage index, $/MWh)
    health $ of one {cid: [kW per slot]} dict."""
    site_kw = np.zeros(HORIZON)
    for p in plan.values():
        a = np.asarray(list(p)[:HORIZON], dtype=float)
        a = np.where(np.isfinite(a), a, 0.0)
        site_kw[:a.size] += np.maximum(a, 0.0)
    kwh = float(site_kw.sum() * SLOT_H)
    usd = float((site_kw * SLOT_H * price).sum())
    kg = float((site_kw * SLOT_H * moer / 1000).sum())
    peak = float(site_kw.max()) if site_kw.size else 0.0
    block = tariff.get("block_kw")
    if block is not None:
        usd += max(0.0, peak - block) * tariff.get("block_price", 0.0) * tariff.get("overage_multiplier", 2.0) / DAYS_PER_MONTH
    out = {"kwh": kwh, "usd": usd, "kgco2": kg, "peak_kw": peak}
    if health is not None:
        out["health_usd"] = float((site_kw * SLOT_H * health / 1000).sum())  # $/MWh -> $ per kWh-slot
    return out


def impact_detail(plan, baseline, signal, tariff) -> dict:
    """Both totals plus the savings. Energy-matched: the baseline is scaled to the plan's kWh, so a plan that
    delivered less (shortfall) cannot book the undelivered energy as a saving. No signal => kg CO2 is 0, not guessed."""
    moer, price = _per_slot(signal.get("moer")), _per_slot(tariff.get("price_per_kwh"))
    health = _per_slot(signal["health_damage"]) if signal.get("health_damage") else None
    p, b = _totals(plan, moer, price, tariff, health), _totals(baseline, moer, price, tariff, health)
    ratio = p["kwh"] / b["kwh"] if b["kwh"] > 0 else 0.0
    return {"plan": p, "baseline": b, "energy_matched": abs(p["kwh"] - b["kwh"]) < 1e-6,
            "saved_usd": round(b["usd"] * ratio - p["usd"], 4),
            "saved_kgco2": round(b["kgco2"] * ratio - p["kgco2"], 4) if signal.get("moer") else 0.0,
            "health_usd": round(b["health_usd"] * ratio - p["health_usd"], 4) if health is not None else None,
            "signal_kind": signal.get("kind")}


def impact(plan, baseline, signal, tariff, *, health=False) -> dict[str, float]:
    """Savings of `plan` vs `baseline` (both {connector_id: [kW per slot]}), keys exactly as LiveOut expects.
    health=True adds health_usd (metrics.md §4; None when the signal carries no health_damage index)."""
    d = impact_detail(plan, baseline, signal, tariff)
    out = {"saved_usd": d["saved_usd"], "saved_kgco2": d["saved_kgco2"]}
    if health:
        out["health_usd"] = d["health_usd"]
    return out


def tier_of(slack_hours) -> str:
    """Three labels by slack (dwell minus charge time), for the UI. Unknown slack => standard."""
    if slack_hours is None or slack_hours != slack_hours:
        return "standard"
    return "green" if slack_hours >= 4 else "standard" if slack_hours >= 1 else "boost"


def price(slack_hours, *, r=None, saving_usd=0.0, kwh=0.0, alpha=0.5, urgent=False) -> dict:
    """business.md §7b: the driver pays R minus a share of what the schedule measurably saved, never more than R.
    usd_per_kwh = R - alpha * max(S, 0) / E, clamped to [0, R]. Urgent (any emergency band) or < 1 h slack => exactly R.
    R = None means free workplace charging (business.md §0b). Old callers `price(slack)` keep working."""
    r = max(0.0, float(r or 0.0))
    tier = tier_of(slack_hours)
    discount = alpha * max(saving_usd, 0.0) / kwh if kwh > 0 and not urgent and tier != "boost" else 0.0
    return {"tier": tier, "usd_per_kwh": round(min(r, max(0.0, r - discount)), 4)}
