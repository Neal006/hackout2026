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


def met(plan, cid, needed, upto=H):
    """Planned energy covers the need; the 6 A floor may add at most one MIN_KW slot on top."""
    got = kwh(plan, cid, upto)
    return needed - 1e-6 <= got <= needed + S.MIN_KW * SLOT_H + 1e-6


# ---- the three asserts from team-plan.md ----
def test_feasible_deadlines_are_met_before_the_30_min_buffer():
    cars = [car("a", 6, 20), car("b", 4, 15), car("c", 8, 30)]
    plan = solve(cars, site(), signal(), tariff(), NOW)
    for c in cars:
        d = int(c["departure"].timestamp() - NOW.timestamp()) // 300
        assert met(plan, c["connector_id"], c["kwh_needed"])
        assert met(plan, c["connector_id"], c["kwh_needed"], d - S.SPRINT_SLOTS), "done before buffer"
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
    assert plan["a"][0] == 7.0 and met(plan, "a", 10.0)


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
    assert met(plan, "a", 14.0)


def test_progress_floor_protects_an_early_leaver():
    price = [0.40] * 84 + [0.10] * (H - 84)
    plan = solve([car("a", 8, 14)], site(), signal(), tariff(price), NOW)
    for hours in (1, 2, 4):
        frac = hours * 12 / (96 - S.SPRINT_SLOTS)
        assert kwh(plan, "a", hours * 12) >= S.ALPHA * frac * 14 - 1e-6


def test_progress_floor_is_anchored_to_arrival_not_to_now():
    """Rolling re-solve every 5 min: a floor anchored to `now` is always 30 min away and never binds (the day replay
    found a car at 0 kWh an hour after plug-in). Anchored to arrival, a car 55 min in must get energy in the next slot."""
    price = [0.40] * 48 + [0.10] * (H - 48)  # the cheap window holds everything, so only the floor lands early
    late = car("a", 8, 14, arrived_hours_ago=55 / 60)
    plan = solve([late], site(), signal(), tariff(price), NOW)
    L = 11 + 96 - S.SPRINT_SLOTS  # slots from arrival to deadline minus buffer
    assert kwh(plan, "a", 1) >= min(S.ALPHA * (12 / L) * 14, 7.0 * SLOT_H) - 1e-6, "the 60-min checkpoint is one slot away"
    assert met(plan, "a", 14.0), "an unreachable checkpoint bends the floor, not the total"
    half_done = car("a", 8, 14, delivered=7.0, arrived_hours_ago=1.0)
    assert kwh(solve([half_done], site(), signal(), tariff(price), NOW), "a", 12) == 0, "delivered energy counts toward the floor"


def test_progress_floor_survives_a_rolling_resolve_under_a_falling_signal():
    """The morning MOER falls every slot until noon. A floor anchored to `now` lets each 5-min re-solve push the sip
    to the slot just before a checkpoint that itself keeps moving; the car never charges."""
    moer = [600.0 - 10 * t for t in range(48)] + [100.0] * (H - 48)
    price = [0.40] * 48 + [0.10] * (H - 48)
    c, delivered, now = car("a", 8, 14), 0.0, NOW
    for k in range(12):  # one hour of 5-min re-solves
        plan = solve([dict(c, kwh_delivered=delivered)], site(), signal(moer[k:] + moer[:k]), tariff(price[k:] + price[:k]), now)
        delivered += plan["a"][0] * SLOT_H
        now += timedelta(minutes=5)
    assert delivered >= S.ALPHA * (12 / 90) * 14 - 1e-6, f"after an hour the car holds only {delivered:.2f} kWh"


def test_tariff_only_and_deadline_only_rungs_still_meet_deadlines():
    cars = [car("a", 6, 20), car("b", 3, 12)]
    for sig, tar in ((signal(), tariff()), ({"moer": [], "kind": None}, tariff()), ({"moer": [], "kind": None}, tariff([]))):
        plan = solve(cars, site(), sig, tar, NOW)
        for c in cars:
            assert met(plan, c["connector_id"], c["kwh_needed"])


def test_never_plans_more_than_needed_plus_one_min_kw_slot():
    plan = solve([car("a", 8, 3.3)], site(), signal(), tariff(), NOW)
    assert met(plan, "a", 3.3)


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
    assert met(plan, "a", 20.0)


def test_baseline_of_nearly_full_cars_solves():
    """Captured from the day replay at 14:05: the baseline call for 38 nearly-full ASAP cars returned HiGHS
    'Unknown' because the only objective terms were 1e-7 tie-breaks. ASAP cars now carry ASAP_EPS."""
    import json
    from pathlib import Path
    d = json.loads((Path(__file__).parent / "fixtures" / "baseline_1405.json").read_text())
    now = datetime.fromisoformat(d["now"])
    cars = [dict(c, arrival=datetime.fromisoformat(c["arrival"]), departure=datetime.fromisoformat(c["departure"])) for c in d["cars"]]
    plan, info = solve_lp(cars, d["site"], d["signal"], d["tariff"], now)
    assert info["status"] == "optimal", info["status"]
    assert sum(info["shortfall_kwh"].values()) == 0
    need = sum(c["kwh_needed"] - c["kwh_delivered"] for c in cars)
    got = sum(kwh(plan, c["connector_id"], 6) for c in cars)
    assert got >= 0.9 * need, "charge-immediately: the remainder lands within 30 min (the 6 A trim may drop a car for one slot)"


def test_car_below_e_min_just_finishes_at_min_kw():
    plan, info = solve_lp([car("a", 6, 10.0, delivered=9.98)], site(), signal(), tariff(), NOW)
    assert info["status"] == "optimal" and plan["a"][0] == S.MIN_KW and sum(plan["a"]) == S.MIN_KW


# ---- 6 A floor post-step ----
def no_sub_min(plan):
    return all(v == 0 or v >= S.MIN_KW - 1e-9 for p in plan.values() for v in p)


def test_tiny_allocation_rounds_up_to_min_kw_never_pauses():
    plan = solve([car("a", 2, 0.05)], site(), signal(), tariff(), NOW)  # 0.05 kWh = 0.6 kW for one slot
    assert no_sub_min(plan) and max(plan["a"]) == S.MIN_KW and sum(v > 0 for v in plan["a"]) == 1


def test_rounding_up_still_respects_site_limit():
    st = site(feed=10, block=100, building=0)
    cars = [car(f"c{i}", 1, 0.05) for i in range(20)]  # 20 x 1.4 kW after rounding = 28 kW > 10 kW feed
    plan = solve(cars, st, signal(), tariff(), NOW)
    assert no_sub_min(plan)
    for t in range(H):
        assert site_kw(plan, t) <= 10 + 1e-6


def test_rounding_up_never_creates_block_overage_the_lp_did_not_choose():
    cars = [car(f"c{i}", 6, 10) for i in range(40)]  # 400 kWh over 5.5 h: fits under the 100 kW block
    plan = solve(cars, site(), signal(), tariff(), NOW)
    assert no_sub_min(plan)
    assert max(site_kw(plan, t) for t in range(H)) <= 100 + 1e-6
    lost = [10.0 - kwh(plan, c["connector_id"]) for c in cars]
    assert max(lost) <= 2 * S.MIN_KW * SLOT_H + 1e-6 and sum(lost) <= 0.01 * 400, "trims cost the rounded car a 6 A slot, not a full slot"


def test_trim_drops_a_car_to_zero_not_below_min_kw():
    cars = [dict(car(f"c{i}", 8, 14), departure=NOW) for i in range(40)]  # ASAP baseline: 280 kW wanted, 130 kW feed
    plan = solve(cars, site(), signal(), tariff(), NOW)
    assert no_sub_min(plan)
    for t in range(H):
        assert site_kw(plan, t) <= 130 + 1e-6
