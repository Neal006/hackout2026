"""The control loop re-solves every 5 sim-minutes and on every event; a solve must stay well under a second.

scipy 1.15.x's HiGHS bindings took 66 s for the 40-car LP on Windows (scipy 1.14.1: 38 ms), so requirements.txt
pins scipy==1.14.*. This test is the tripwire for that pin and for any formulation change that bloats the LP."""
from datetime import datetime, timedelta

from noonshift.scheduler import HORIZON, solve_lp

NOW = datetime(2026, 4, 14, 9, 0)


def lot(n, hours=8.0, kwh=20.0, offset=0):
    return [{"connector_id": f"c{offset + i:02d}", "arrival": NOW, "departure": NOW + timedelta(hours=hours - (i % 5) * 0.5),
             "kwh_needed": kwh + i % 7, "kwh_delivered": 0.0, "p_max_kw": 7.0, "boost": False} for i in range(n)]


def inputs():
    site = {"feed_kw": 150.0, "block_kw": 100.0, "building_load_kw": [20.0 + (t % 48) / 4 for t in range(HORIZON)]}
    signal = {"moer": [300.0 + 200 * ((t // 12) % 2) for t in range(HORIZON)], "kind": "marginal"}
    tariff = {"price_per_kwh": [0.16 if 108 <= t < 168 else 0.36 if 192 <= t < 252 else 0.20 for t in range(HORIZON)],
              "block_price": 12.41, "overage_multiplier": 2.0}
    return site, signal, tariff


def test_40_cars_full_horizon_under_one_second():
    _, info = solve_lp(lot(40), *inputs(), NOW)
    assert info["status"] == "optimal" and info["solve_ms"] < 1000, info


def test_60_car_oversubscribe_demo_under_one_second():
    _, info = solve_lp(lot(40) + lot(20, hours=2.0, kwh=9.0, offset=40), *inputs(), NOW)
    assert info["status"] == "optimal" and info["solve_ms"] < 1000, info
