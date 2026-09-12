"""Slide 1. Replays the simulated day twice through the real control loop (api.step: solver, taper, feed limit),
once under a charge-immediately policy (every deadline = now, the same solve()) and once under Noonshift, and prints
kWh, $ bill, kg CO2 and peak kW for both, the cars that left short, and the h6 gate.

    python scripts/prove.py                 # data/*.json as committed
    python scripts/prove.py --w-carbon 0.2  # sweep the carbon weight ($/kg)
    python scripts/prove.py --gate 0.15     # gate on CO2 saving (default 15%)
"""
import argparse
import asyncio
import json
import logging
import os
import sys
import time
from datetime import timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from noonshift import scheduler  # noqa: E402
from noonshift.api import S, step  # noqa: E402
from noonshift.sim import Sim, load_sessions  # noqa: E402

H = scheduler.HORIZON


def absolute(kw_min, start):
    """Per-minute kW recorded from `start` -> per-slot average kW on the absolute day (index 0 = 00:00). Sessions
    start mid-slot, so snapping their 5-min chunks to slot boundaries would smear peaks; place minutes, then average."""
    minutes = [0.0] * (H * 5)
    m0 = start.hour * 60 + start.minute
    for k, v in enumerate(kw_min[:H * 5 - m0]):
        minutes[m0 + k] = v
    return [sum(minutes[5 * k:5 * k + 5]) / 5 for k in range(H)]


async def replay(stats, policy):
    """Play the day. policy "noonshift" is the real thing; "asap" forces every deadline to now (charge-immediately)."""
    sim = S["sim"]
    orig = scheduler.solve_lp

    def spy(cars, site, signal, tariff, now):
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
    """Returns (metered kW per session on the absolute day, sessions, solver stats)."""
    S.clear()
    S.update(site=site, signal=signal, tariff=tariff, plan={}, plan_at=None, baseline={}, impact={}, hist={}, mode="live",
             ladder={"live": True, "cached": True, "tariff": True, "deadline": True}, live_lost_at=None,
             last_solve_at=None, dr=[], clients=set(), next_id=1000)
    S["sim"] = Sim(load_sessions(), site)
    stats = {"solves": 0, "max_ms": 0.0, "fallbacks": 0}
    asyncio.run(replay(stats, policy))
    metered = {sid: absolute(h["kw_min"], h["start"]) for sid, h in S["hist"].items()}
    return metered, dict(S["sim"].sessions), stats


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--w-carbon", type=float, default=scheduler.W_CARBON, help="$/kg CO2 weight in the objective")
    ap.add_argument("--gate", type=float, default=0.15, help="minimum CO2 saving fraction to pass")
    args = ap.parse_args()
    scheduler.W_CARBON = args.w_carbon
    logging.basicConfig(level=logging.ERROR)
    site, signal, tariff = (json.load(open(f"data/{n}.json")) for n in ("site", "signal", "tariff"))

    t0 = time.perf_counter()
    base, base_sessions, base_stats = run_day("asap", site, signal, tariff)
    plan, sessions, stats = run_day("noonshift", site, signal, tariff)
    wall = time.perf_counter() - t0

    d = scheduler.impact_detail(plan, base, {"moer": signal["moer"], "kind": signal["kind"]}, tariff)
    p, b = d["plan"], d["baseline"]
    short = lambda ss: [s for s in ss.values() if s["kwh_delivered"] < s["kwh_needed"] - 1e-3]
    early, base_early = short(sessions), short(base_sessions)
    pct = lambda a, c: f"{100 * (1 - a / c):5.1f}%" if c else "   n/a"
    co2_saving = d["saved_kgco2"] / (p["kgco2"] + d["saved_kgco2"]) if p["kgco2"] + d["saved_kgco2"] > 0 else 0.0
    fallbacks = stats["fallbacks"] + base_stats["fallbacks"]

    print(f"Noonshift prove.py  |  {signal.get('date', '?')}  site {site['id']}  {len(sessions)} sessions  {site['feed_kw']:.0f} kW feed  "
          f"block {tariff.get('block_kw', site['block_kw'])} kW  |  {tariff.get('name', 'tariff')}")
    print(f"signal: {signal.get('kind')} {signal.get('region', '')}  W_CARBON={scheduler.W_CARBON} $/kg  "
          f"({'AVERAGE intensity, not marginal: label the CO2 number accordingly' if signal.get('kind') == 'average' else 'marginal'})")
    print(f"{'':20s}{'kWh':>9s}{'$ bill':>10s}{'kg CO2':>10s}{'peak kW':>10s}")
    print(f"{'charge-immediately':20s}{b['kwh']:9.1f}{b['usd']:10.2f}{b['kgco2']:10.1f}{b['peak_kw']:10.1f}")
    print(f"{'noonshift':20s}{p['kwh']:9.1f}{p['usd']:10.2f}{p['kgco2']:10.1f}{p['peak_kw']:10.1f}")
    print(f"{'saving':20s}{'':9s}{pct(p['usd'], b['usd']):>10s}{pct(p['kgco2'], b['kgco2']):>10s}{pct(p['peak_kw'], b['peak_kw']):>10s}"
          f"   (energy-matched: {d['energy_matched']}; ${d['saved_usd']:.2f}, {d['saved_kgco2']:.1f} kg)")
    print(f"short of full, noonshift: {len(early)}: " + ", ".join(f"#{s['id']} {s['kwh_delivered']:.1f}/{s['kwh_needed']} kWh" for s in early)
          + f"  |  charge-immediately: {len(base_early)}: " + ", ".join(f"#{s['id']} {s['kwh_delivered']:.1f}/{s['kwh_needed']}" for s in base_early))
    print(f"solver: {stats['solves']} solves, max {stats['max_ms']:.0f} ms, fallbacks {fallbacks}; both replays {wall:.0f} s")
    verdict = "PASS" if co2_saving >= args.gate and fallbacks == 0 else "FAIL"
    print(f"GATE (CO2 saving >= {100 * args.gate:.0f}%, no fallbacks): {verdict}  ({100 * co2_saving:.1f}%)")
    return 0 if verdict == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
