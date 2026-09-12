"""Unit tests for scheduler.solve(): the three asserts from team-plan.md plus the edges that bit during the spike."""
from datetime import datetime, timedelta

import pytest

from noonshift import scheduler as S
from noonshift.scheduler import HORIZON, SLOT_H, solve, solve_lp

NOW = datetime(2026, 4, 14, 9, 0)
H = HORIZON


def car(cid, hours=8.0, kwh=20.0, p_max=7.0, delivered=0.0, boost=False, arrived_hours_ago=0.0):
    return {"connector_id": cid, "arrival": NOW - timedelta(hours=arrived_hours_ago), "departure": NOW + timedelta(hours=hours),
            "kwh_needed": kwh, "kwh_delivered": delivered, "p_max_kw": p_max, "boost": boost}


def site(feed=150.0, block=100.0, building=20.0):
    return {"feed_kw": feed, "block_kw": block, "building_load_kw": [building] * H}


def signal(moer=None):
    return {"moer": moer if moer is not None else [400.0] * H, "kind": "marginal"}


def tariff(price=None):
    return {"price_per_kwh": price if price is not None else [0.20] * H, "block_price": 12.41, "overage_multiplier": 2.0}


def kwh(plan, cid, upto=H):
    return sum(plan[cid][:upto]) * SLOT_H


def site_kw(plan, t):
    return sum(p[t] for p in plan.values())


# ---- the three asserts from team-plan.md ----
def test_feasible_deadlines_are_met_before_the_30_min_buffer():
    cars = [car("a", 6, 20), car("b", 4, 15), car("c", 8, 30)]
    plan = solve(cars, site(), signal(), tariff(), NOW)
    for c in cars:
        d = int(c["departure"].timestamp() - NOW.timestamp()) // 300
        assert kwh(plan, c["connector_id"]) == pytest.approx(c["kwh_needed"], abs=1e-6)
        assert kwh(plan, c["connector_id"], d - S.SPRINT_SLOTS) == pytest.approx(c["kwh_needed"], abs=1e-6), "done before buffer"
        assert all(v == 0 for v in plan[c["connector_id"]][d:]), "nothing after the deadline"


def test_site_limit_never_exceeded():
    st = site(feed=150, building=40)
    st["building_load_kw"][100:120] = [130.0] * 20  # a building-load spike leaves 20 kW for cars
    cars = [car(f"c{i}", 8, 25) for i in range(40)]  # 280 kW of demand
    plan = solve(cars, st, signal(), tariff(), NOW)
    for t in range(H):
        assert site_kw(plan, t) <= st["feed_kw"] - st["building_load_kw"][t] + 1e-6


def test_oversubscribed_lot_returns_proportional_shortfall_without_raising():
    cars = [car(f"c{i}", 2, 20) for i in range(40)]  # 800 kWh wanted, 2 h x 130 kW = 260 kWh possible
    plan, info = solve_lp(cars, site(), signal(), tariff(), NOW)
    assert info["status"] == "optimal"
    got = [kwh(plan, c["connector_id"]) for c in cars]
    assert sum(info["shortfall_kwh"].values()) > 0
    assert sum(got) == pytest.approx(130 * 2, abs=2.0), "the whole feed is used"
    assert min(got) > 0, "no car is starved"
    assert max(got) - min(got) <= 0.1 * max(got), "identical cars get near-identical energy"


# ---- degenerate and edge inputs ----
def test_empty_lot():
    assert solve([], site(), signal(), tariff(), NOW) == {}


def test_car_that_needs_nothing_gets_zero_plan():
    plan = solve([car("a", 6, 10, delivered=10)], site(), signal(), tariff(), NOW)
    assert plan["a"] == [0.0] * H


def test_zero_p_max_gets_zero_plan_and_full_shortfall():
    plan, info = solve_lp([car("a", 6, 10, p_max=0)], site(), signal(), tariff(), NOW)
    assert plan["a"] == [0.0] * H and info["shortfall_kwh"] == {"a": 0.0}


def test_passed_deadline_charges_now():
    plan = solve([car("a", -1, 10)], site(), signal(), tariff(), NOW)
    assert plan["a"][0] == 7.0 and kwh(plan, "a") == pytest.approx(10.0, abs=1e-6)


def test_boost_charges_now_even_when_later_is_cheaper():
    price = [0.50] * 24 + [0.05] * (H - 24)
    plan = solve([car("a", 6, 7, boost=True)], site(), signal(), tariff(price), NOW)
    assert plan["a"][:12] == [7.0] * 12


def test_baseline_call_is_charge_immediately():
    cars = [car(f"c{i}", 8, 14) for i in range(10)]
    plan = solve([dict(c, departure=NOW) for c in cars], site(), signal(), tariff(), NOW)
    for c in cars:
        assert plan[c["connector_id"]][:24] == [7.0] * 24  # 14 kWh at 7 kW = 2 h, from slot 0


def test_plan_moves_energy_into_cheap_clean_slots():
    price = [0.40] * 48 + [0.10] * (H - 48)
    moer = [600.0] * 48 + [100.0] * (H - 48)
    plan = solve([car("a", 8, 14)], site(), signal(moer), tariff(price), NOW)
    assert kwh(plan, "a", 48) <= S.ALPHA * 14 * 48 / (96 - S.SPRINT_SLOTS) + 1e-6, "only the progress floor lands in the dear window"
    assert kwh(plan, "a") == pytest.approx(14.0, abs=1e-6)


def test_progress_floor_protects_an_early_leaver():
    price = [0.40] * 84 + [0.10] * (H - 84)
    plan = solve([car("a", 8, 14)], site(), signal(), tariff(price), NOW)
    for hours in (1, 2, 4):
        frac = hours * 12 / (96 - S.SPRINT_SLOTS)
        assert kwh(plan, "a", hours * 12) >= S.ALPHA * frac * 14 - 1e-6


def test_tariff_only_and_deadline_only_rungs_still_meet_deadlines():
    cars = [car("a", 6, 20), car("b", 3, 12)]
    for sig, tar in ((signal(), tariff()), ({"moer": [], "kind": None}, tariff()), ({"moer": [], "kind": None}, tariff([]))):
        plan = solve(cars, site(), sig, tar, NOW)
        for c in cars:
            assert kwh(plan, c["connector_id"]) == pytest.approx(c["kwh_needed"], abs=1e-6)


def test_never_over_delivers():
    plan = solve([car("a", 8, 3.3)], site(), signal(), tariff(), NOW)
    assert kwh(plan, "a") == pytest.approx(3.3, abs=1e-6)


def test_deterministic():
    cars = [car(f"c{i}", 6 + i % 3, 10 + i) for i in range(12)]
    assert solve(cars, site(), signal(), tariff(), NOW) == solve(cars, site(), signal(), tariff(), NOW)


def test_building_load_above_feed_leaves_zero_headroom_not_negative():
    st = site(feed=100, building=120)
    plan, info = solve_lp([car("a", 4, 10)], st, signal(), tariff(), NOW)
    assert plan["a"] == [0.0] * H and info["shortfall_kwh"]["a"] == pytest.approx(10.0)


def test_short_and_nan_signal_arrays_are_tolerated():
    sig = {"moer": [float("nan"), 400.0, 100.0], "kind": "marginal"}
    tar = tariff([0.2] * 10)
    st = site()
    st["building_load_kw"] = [20.0] * 5
    plan = solve([car("a", 6, 20)], st, sig, tar, NOW)
    assert kwh(plan, "a") == pytest.approx(20.0, abs=1e-6)
