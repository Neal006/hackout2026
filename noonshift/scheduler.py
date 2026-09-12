"""Elastic LP scheduler. Drop-in for the stub: same three signatures, same dict contract, nothing else changes.

Conventions the caller (api.py) relies on:
- Every list "per slot" is aligned: index 0 is the 5-min slot containing `now`, HORIZON slots follow, wrapping the day.
- Fail-safe rungs shape the inputs, not the call: tariff-only => signal == {"moer": [], "kind": None};
  deadline-only => additionally tariff["price_per_kwh"] == []. Full-power rung never calls solve().
- The charge-immediately baseline is solve() with every departure = now (all cars ASAP, see below).

The LP (proposal 4.4). p[i,t] = kW for car i in slot t, s[i] = shortfall kWh, over = site kW above the tariff block.
  minimise   sum p * SLOT_H * (price[t] + W_CARBON * moer[t] / 1000)  +  M_SHORT * s[i]  +  overage_usd_per_kw * over
  1. energy    sum_{t < deadline} p * SLOT_H + s[i] >= e_rem[i]                (elastic: the LP is never infeasible)
  2. floor     energy by each hourly checkpoint >= ALPHA * frac * (e_rem[i] - s[i])   (fairness + early-unplug safety)
  3. sprint    the last 30 min before the deadline carry a BUFFER_COST surcharge, so a feasible car finishes early and
               the buffer is spent only by cars that would otherwise fall short (and by re-solves after a bad forecast)
  4. charger   0 <= p <= p_max_kw
  5. site      sum_i p[i,t] <= feed_kw - building_load_kw[t]
  block        sum_i p[i,t] - over <= block_kw
  cap          sum_{t < deadline} p * SLOT_H <= e_rem[i]                       (never plan more than the car can take)
  fairness     s[i] / e_rem[i] <= z, z priced at M_SHORT * mean(e_rem): a linear shortfall penalty alone starves
               whole cars when the lot is oversubscribed; minimising the worst fraction spreads the shortfall instead
ASAP cars (deadline already passed, or Boost): slot cost is only the earliest-first tie-break, so they charge now.
When every car is ASAP (the baseline call) the block-overage term is dropped: charge-immediately means exactly that.
"""
import logging
import math
import time

import numpy as np
from scipy.optimize import linprog
from scipy.sparse import coo_matrix

log = logging.getLogger(__name__)

HORIZON = 288
SLOT_H = 5 / 60
MIN_KW = 1.4        # 6 A x 240 V, the IEC 61851 floor: allocations in (0, MIN_KW) round up, never pause
W_CARBON = 0.05     # $/kg CO2 (= $50/t) trading carbon against tariff; prove.py sweeps this
ALPHA = 0.5         # progress floor: every car holds >= half its pro-rata energy at every checkpoint
FLOOR_EVERY = 12    # checkpoint hourly; 30-min checkpoints made the plan sip a slot every half hour, choppy on the Gantt
SPRINT_SLOTS = 6    # last 30 min before the deadline are a buffer: used only when the car would otherwise fall short
BUFFER_COST = 1.0   # $/kWh surcharge on buffer slots, >> any tariff spread and << M_SHORT
M_SHORT = 10.0      # $/kWh shortfall penalty, >> any per-kWh cost, so shortfall is the last resort
EPS = 1e-7          # earliest-first tie-break per slot, << any real cost difference
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


def _full_power(cars):
    return {c["connector_id"]: [float(c["p_max_kw"])] * HORIZON for c in cars}


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
    slot_cost = SLOT_H * (price + W_CARBON * moer / 1000) + EPS * np.arange(H)

    S = lambda i: n * H + i          # shortfall column of car i
    OVER = n * H + n
    Z = OVER + 1                     # worst shortfall fraction over all cars (min-max fairness)
    nv = Z + 1
    c, hi = np.zeros(nv), np.zeros(nv)
    e_rems = []
    rows, cols, vals, b = [], [], [], []
    k = 0

    def row(coeffs, rhs):
        nonlocal k
        for j, v in coeffs:
            rows.append(k); cols.append(j); vals.append(v)
        b.append(rhs); k += 1

    for i, car in enumerate(cars):
        cid, base = car["connector_id"], i * H
        e_rem = max(0.0, float(car["kwh_needed"]) - float(car.get("kwh_delivered", 0.0)))
        p_max = max(0.0, float(car["p_max_kw"]))
        d = _slots_until(car["departure"], now)
        asap = d == 0 or bool(car.get("boost"))
        if asap:
            info["asap"].append(cid)
            d = H if d == 0 else d
        if e_rem <= 0 or p_max <= 0:
            continue
        end = d if asap or d <= SPRINT_SLOTS else d - SPRINT_SLOTS     # rule 3: 30-min buffer
        for t in range(d):
            c[base + t] = EPS * t if asap else slot_cost[t] + (BUFFER_COST * SLOT_H if t >= end else 0.0)
            hi[base + t] = p_max
        c[S(i)], hi[S(i)] = M_SHORT, e_rem
        e_rems.append(e_rem)
        row([(base + t, -SLOT_H) for t in range(d)] + [(S(i), -1.0)], -e_rem)          # rule 1 (elastic)
        row([(base + t, SLOT_H) for t in range(d)], e_rem)                              # cap
        row([(S(i), 1.0), (Z, -e_rem)], 0.0)                                            # s[i] / e_rem[i] <= z
        if not asap:
            for t in range(FLOOR_EVERY - 1, end, FLOOR_EVERY):                         # rule 2 (elastic)
                frac = (t + 1) / end
                row([(base + tt, -SLOT_H) for tt in range(t + 1)] + [(S(i), -ALPHA * frac)], -ALPHA * frac * e_rem)
    pure_asap = len(info["asap"]) == n
    for t in range(H):
        row([(i * H + t, 1.0) for i in range(n)], avail[t])                            # rule 5
        if not pure_asap:
            row([(i * H + t, 1.0) for i in range(n)] + [(OVER, -1.0)], site.get("block_kw", math.inf))
    c[OVER], hi[OVER] = (0.0 if pure_asap else overage), math.inf
    c[Z], hi[Z] = M_SHORT * (sum(e_rems) / len(e_rems) if e_rems else 0.0), 1.0   # a mean car's worth of shortfall

    A = coo_matrix((vals, (rows, cols)), shape=(k, nv)).tocsr()
    t0 = time.perf_counter()
    res = linprog(c, A_ub=A, b_ub=np.array(b), bounds=np.c_[np.zeros(nv), hi], method="highs")
    info["solve_ms"] = round(1000 * (time.perf_counter() - t0), 1)
    if res.status != 0:  # elastic LP cannot be infeasible; if HiGHS still fails, fail open like the ladder does
        log.error("linprog status %s (%s); falling back to full power", res.status, res.message)
        info["status"] = f"fallback:{res.status}"
        return _full_power(cars), info
    info["status"] = "optimal"
    x = res.x
    plan = {car["connector_id"]: np.maximum(x[i * H:(i + 1) * H], 0.0) for i, car in enumerate(cars)}
    info["shortfall_kwh"] = {car["connector_id"]: round(float(x[S(i)]), 4) for i, car in enumerate(cars)}
    _enforce_min_kw(plan, cars, avail, now)
    return {cid: [round(float(v), 3) for v in p] for cid, p in plan.items()}, info


def _enforce_min_kw(plan, cars, avail, now):
    """Post-step, in place. EVs cannot charge below 6 A, so any allocation in (0, MIN_KW) rounds up to MIN_KW
    (some EVs never resume after a pause). Rounding can push a slot over the site limit; trim the cars with the
    most slack first, and a trimmed car drops to 0, never to a value below MIN_KW."""
    floor = {c["connector_id"]: min(MIN_KW, float(c["p_max_kw"])) for c in cars}
    for cid, p in plan.items():
        p[(p > 1e-9) & (p < floor[cid])] = floor[cid]
    slack_order = sorted(cars, key=lambda c: -_slots_until(c["departure"], now))
    for t in range(HORIZON):
        excess = sum(p[t] for p in plan.values()) - avail[t]
        for c in slack_order:
            if excess <= 1e-9:
                break
            p, cid = plan[c["connector_id"]], c["connector_id"]
            if p[t] <= 0:
                continue
            cut = min(p[t], excess)
            keep = p[t] - cut
            if 0 < keep < floor[cid]:
                cut, keep = p[t], 0.0
            p[t], excess = keep, excess - cut


def solve(cars, site, signal, tariff, now) -> dict[str, list[float]]:
    """cars: [{connector_id, arrival, departure, kwh_needed, kwh_delivered, p_max_kw, boost}]
    site: {feed_kw, building_load_kw: [per slot], block_kw}
    signal: {moer: [gCO2/kWh per slot], kind: "marginal"|"average"|None}
    tariff: {price_per_kwh: [per slot], block_price, overage_multiplier}
    returns {connector_id: [kW per slot from now to horizon]}"""
    return solve_lp(cars, site, signal, tariff, now)[0]


def _totals(plan, moer, price, tariff):
    """kWh, $ (energy + this day's share of block overage), kg CO2 and peak kW of one {cid: [kW per slot]} dict."""
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
    return {"kwh": kwh, "usd": usd, "kgco2": kg, "peak_kw": peak}


def impact_detail(plan, baseline, signal, tariff) -> dict:
    """Both totals plus the savings. Energy-matched: the baseline is scaled to the plan's kWh, so a plan that
    delivered less (shortfall) cannot book the undelivered energy as a saving. No signal => kg CO2 is 0, not guessed."""
    moer, price = _per_slot(signal.get("moer")), _per_slot(tariff.get("price_per_kwh"))
    p, b = _totals(plan, moer, price, tariff), _totals(baseline, moer, price, tariff)
    ratio = p["kwh"] / b["kwh"] if b["kwh"] > 0 else 0.0
    return {"plan": p, "baseline": b, "energy_matched": abs(p["kwh"] - b["kwh"]) < 1e-6,
            "saved_usd": round(b["usd"] * ratio - p["usd"], 4),
            "saved_kgco2": round(b["kgco2"] * ratio - p["kgco2"], 4) if signal.get("moer") else 0.0,
            "signal_kind": signal.get("kind")}


def impact(plan, baseline, signal, tariff) -> dict[str, float]:
    """Savings of `plan` vs `baseline` (both {connector_id: [kW per slot]}), keys exactly as LiveOut expects."""
    d = impact_detail(plan, baseline, signal, tariff)
    return {"saved_usd": d["saved_usd"], "saved_kgco2": d["saved_kgco2"]}


def price(slack_hours: float) -> dict:
    """Deadline sets the price. Three tiers by slack (dwell minus charge time). Unknown slack => standard."""
    if slack_hours is None or slack_hours != slack_hours:
        return {"tier": "standard", "usd_per_kwh": 0.25}
    if slack_hours >= 4:
        return {"tier": "green", "usd_per_kwh": 0.18}
    if slack_hours >= 1:
        return {"tier": "standard", "usd_per_kwh": 0.25}
    return {"tier": "boost", "usd_per_kwh": 0.40}
