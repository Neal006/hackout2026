"""Slide 1. Replays the simulated day through the real control loop (api.step: solver, taper, feed limit) under two or
three policies and prints kWh, $ bill, kg CO2 and peak kW for each, the cars that left short, and the h6 gate.

    python scripts/prove.py                                   # charge-immediately vs Noonshift, data/*.json as committed
    python scripts/prove.py --policy timer                    # + a dumb timer (full power 09-14, else 6 A): the LP's delta over it
    python scripts/prove.py --block 50 --feed 80              # a constrained site: block overage $, kWh short, what the full rung does
    python scripts/prove.py --forecast data/signal_forecast.json   # plan on the forecast, score on data/signal.json (solutions.md §6)
    python scripts/prove.py --w-carbon 0.2 --gate 0.15        # sweep the carbon weight; gate on CO2 saving (default 15 %)

Also printed every run: renewable-hour share (metrics.md §3), block overage and shortfall per policy, and how the
drivers' stated departures compared with when they actually left (solutions.md Fact 1).
"""
import argparse
import asyncio
import json
import logging
import os
import statistics
import sys
import time
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from noonshift import scheduler  # noqa: E402
from noonshift.api import S, step  # noqa: E402
from noonshift.sim import SLOT, Sim, load_sessions, safe_share_kw  # noqa: E402

H = scheduler.HORIZON
TIMER_ON = (9, 14)  # the dumb timer: full power in these hours, MIN_KW (never pause) outside


def absolute(kw_min, start):
    """Per-minute kW recorded from `start` -> per-slot average kW on the absolute day (index 0 = 00:00). Sessions
    start mid-slot, so snapping their 5-min chunks to slot boundaries would smear peaks; place minutes, then average."""
    minutes = [0.0] * (H * 5)
    m0 = start.hour * 60 + start.minute
    for k, v in enumerate(kw_min[:H * 5 - m0]):
        minutes[m0 + k] = v
    return [sum(minutes[5 * k:5 * k + 5]) / 5 for k in range(H)]


async def replay(stats, policy):
    """Play the day. "noonshift" is the real thing; "asap" forces every deadline to now (charge-immediately);
    "timer" bypasses the LP with a wall-clock schedule (what a site without a controller typically installs)."""
    sim = S["sim"]
    orig = scheduler.solve_lp

    def spy(cars, site, signal, tariff, now):
        if policy == "timer":
            t0 = now.replace(minute=now.minute - now.minute % 5, second=0, microsecond=0)
            on = [TIMER_ON[0] <= (t0 + k * SLOT).hour < TIMER_ON[1] for k in range(H)]
            plan = {c["connector_id"]: [c["p_max_kw"] if o else min(scheduler.MIN_KW, c["p_max_kw"]) for o in on] for c in cars}
            stats["solves"] += 1
            return plan, {"shortfall_kwh": {}, "asap": [], "status": "timer", "solve_ms": 0.0}
        if policy == "asap":
            cars = [dict(c, departure=now) for c in cars]
        plan, info = orig(cars, site, signal, tariff, now)
        stats["solves"] += 1
        stats["max_ms"] = max(stats["max_ms"], info["solve_ms"])
        stats["fallbacks"] += info["status"].startswith("fallback")
        return plan, info

    scheduler.solve_lp = spy
    try:
        while sim.now < sim.day_end - timedelta(minutes=1):
            await step()
    finally:
        scheduler.solve_lp = orig


def run_day(policy, site, signal, tariff):
    """Returns (metered kW per session on the absolute day, sessions, solver stats). `signal` is what the planner sees."""
    S.clear()
    S.update(site=site, signal=signal, tariff=tariff, plan={}, plan_at=None, baseline={}, impact={}, hist={}, mode="live",
             ladder={"live": True, "cached": True, "tariff": True, "deadline": True}, live_lost_at=None,
             last_solve_at=None, dr=[], clients=set(), next_id=1000)
    S["sim"] = Sim(load_sessions(), site)
    stats = {"solves": 0, "max_ms": 0.0, "fallbacks": 0}
    asyncio.run(replay(stats, policy))
    metered = {sid: absolute(h["kw_min"], h["start"]) for sid, h in S["hist"].items()}
    return metered, dict(S["sim"].sessions), stats


def renewable_share(metered, moer):
    """metrics.md §3: energy delivered in slots where the marginal source is renewable (MOER = 0) over all energy."""
    clean = total = 0.0
    for series in metered.values():
        for k, kw in enumerate(series):
            total += kw
            clean += kw if moer[k] == 0 else 0.0
    return clean / total if total else 0.0


def overage_usd(peak, tariff, block):
    return max(0.0, peak - block) * tariff.get("block_price", 0.0) * tariff.get("overage_multiplier", 2.0) / scheduler.DAYS_PER_MONTH


def shortfall(sessions):
    return sum(max(0.0, s["kwh_needed"] - s["kwh_delivered"]) for s in sessions.values())


def stated_vs_actual(sessions):
    """solutions.md Fact 1: real drivers under-state their stay. Minutes = actual departure - stated departure."""
    d = [(s["departure"] - s["user_stated_departure"]).total_seconds() / 60 for s in sessions.values()]
    later, earlier = [x for x in d if x > 0.5], [x for x in d if x < -0.5]
    return {"n": len(d), "later": len(later), "earlier": len(earlier), "exact": len(d) - len(later) - len(earlier),
            "mean_later_min": statistics.mean(later) if later else 0.0, "worst_early_min": min(earlier) if earlier else 0.0}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--w-carbon", type=float, default=scheduler.W_CARBON, help="$/kg CO2 weight in the objective")
    ap.add_argument("--gate", type=float, default=0.15, help="minimum CO2 saving fraction to pass")
    ap.add_argument("--policy", choices=["timer"], help="also replay a dumb timer (full power %d-%d) and report the LP's delta over it" % TIMER_ON)
    ap.add_argument("--block", type=float, help="override the tariff block kW (site.json + tariff.json)")
    ap.add_argument("--feed", type=float, help="override the site feed kW")
    ap.add_argument("--forecast", help="signal file the planner sees; data/signal.json still scores the result")
    args = ap.parse_args(argv)
    scheduler.W_CARBON = args.w_carbon
    logging.basicConfig(level=logging.ERROR)
    site, signal, tariff = (json.load(open(f"data/{n}.json")) for n in ("site", "signal", "tariff"))
    if args.block is not None:
        site["block_kw"] = tariff["block_kw"] = args.block
    if args.feed is not None:
        site["feed_kw"] = args.feed
        site.pop("safe_share_kw", None)  # recompute for the new feed
    plan_signal = json.load(open(args.forecast)) if args.forecast else signal
    block = tariff.get("block_kw", site["block_kw"])

    t0 = time.perf_counter()
    runs = {"charge-immediately": run_day("asap", site, plan_signal, tariff)}
    if args.policy == "timer":
        runs["dumb timer %02d-%02d" % TIMER_ON] = run_day("timer", site, plan_signal, tariff)
    runs["noonshift"] = run_day("noonshift", site, plan_signal, tariff)
    wall = time.perf_counter() - t0

    actual = {"moer": signal["moer"], "kind": signal["kind"], "health_damage": signal.get("health_damage")}
    base, base_sessions, base_stats = runs["charge-immediately"]
    plan, sessions, stats = runs["noonshift"]
    d = scheduler.impact_detail(plan, base, actual, tariff)
    p, b = d["plan"], d["baseline"]
    short = lambda ss: [s for s in ss.values() if s["kwh_delivered"] < s["kwh_needed"] - 1e-3]
    early, base_early = short(sessions), short(base_sessions)
    pct = lambda a, c: f"{100 * (1 - a / c):5.1f}%" if c else "   n/a"
    co2_saving = d["saved_kgco2"] / (p["kgco2"] + d["saved_kgco2"]) if p["kgco2"] + d["saved_kgco2"] > 0 else 0.0
    fallbacks = sum(r[2]["fallbacks"] for r in runs.values())

    print(f"Noonshift prove.py  |  {signal.get('date', '?')}  site {site['id']}  {len(sessions)} sessions  {site['feed_kw']:.0f} kW feed  "
          f"block {block} kW  |  {tariff.get('name', 'tariff')}")
    print(f"signal: {signal.get('kind')} {signal.get('region', '')}  W_CARBON={scheduler.W_CARBON} $/kg  "
          f"({'AVERAGE intensity, not marginal: label the CO2 number accordingly' if signal.get('kind') == 'average' else 'marginal'})"
          + (f"  |  planned on {args.forecast} ({plan_signal.get('generated_at', 'forecast')}), scored on data/signal.json: "
             f"mean |forecast - actual| {statistics.mean(abs(f - a) for f, a in zip(plan_signal['moer'], signal['moer'])):.0f} g/kWh"
             if args.forecast else "  |  planned and scored on the same realised signal (perfect foresight)"))
    print(f"{'':20s}{'kWh':>9s}{'$ bill':>10s}{'kg CO2':>10s}{'peak kW':>10s}{'clean-h %':>11s}{'overage $':>11s}{'short kWh':>11s}")
    totals = {}
    for name, (metered, ss, _) in runs.items():
        t = scheduler.impact_detail(metered, base, actual, tariff)["plan"]
        totals[name] = t
        print(f"{name:20s}{t['kwh']:9.1f}{t['usd']:10.2f}{t['kgco2']:10.1f}{t['peak_kw']:10.1f}"
              f"{100 * renewable_share(metered, signal['moer']):11.1f}{overage_usd(t['peak_kw'], tariff, block):11.2f}{shortfall(ss):11.1f}")
    print(f"{'saving vs charge-now':20s}{'':9s}{pct(p['usd'], b['usd']):>10s}{pct(p['kgco2'], b['kgco2']):>10s}{pct(p['peak_kw'], b['peak_kw']):>10s}"
          f"   (energy-matched: {d['energy_matched']}; ${d['saved_usd']:.2f}, {d['saved_kgco2']:.1f} kg"
          + (f", health ${d['health_usd']:.2f}" if d.get("health_usd") is not None else "") + ")")
    if args.policy == "timer":
        t = totals["dumb timer %02d-%02d" % TIMER_ON]
        print(f"{'saving vs timer':20s}{'':9s}{pct(p['usd'], t['usd']):>10s}{pct(p['kgco2'], t['kgco2']):>10s}{pct(p['peak_kw'], t['peak_kw']):>10s}"
              f"   (the judge's question: what the LP adds over a wall-clock timer)")
    if args.block is not None or args.feed is not None:
        share = safe_share_kw(site)
        print(f"full rung (static share): {len(site['connectors'])} x {share} kW = {len(site['connectors']) * share:.0f} kW "
              f"<= feed - worst building load {site['feed_kw'] - max(site['building_load_kw']):.0f} kW; block overage at that draw "
              f"${overage_usd(len(site['connectors']) * share + max(site['building_load_kw']), tariff, block):.2f}/day")
    print(f"short of full, noonshift: {len(early)}: " + ", ".join(f"#{s['id']} {s['kwh_delivered']:.1f}/{s['kwh_needed']} kWh" for s in early)
          + f"  |  charge-immediately: {len(base_early)}: " + ", ".join(f"#{s['id']} {s['kwh_delivered']:.1f}/{s['kwh_needed']}" for s in base_early))
    sv = stated_vs_actual(sessions)
    print(f"stated vs actual departure: {sv['later']}/{sv['n']} left later than they said (mean +{sv['mean_later_min']:.0f} min), "
          f"{sv['earlier']} earlier (worst {sv['worst_early_min']:.0f} min), {sv['exact']} exact")
    print(f"solver: {stats['solves']} solves, max {stats['max_ms']:.0f} ms, fallbacks {fallbacks}; {len(runs)} replays {wall:.0f} s")
    verdict = "PASS" if co2_saving >= args.gate and fallbacks == 0 else "FAIL"
    print(f"GATE (CO2 saving >= {100 * args.gate:.0f}%, no fallbacks): {verdict}  ({100 * co2_saving:.1f}%)")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
