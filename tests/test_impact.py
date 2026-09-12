"""impact() and price(): the receipt must be honest, the tiers must be total."""
import math

import pytest

from noonshift.scheduler import HORIZON, SLOT_H, impact, impact_detail, price

H = HORIZON


def series(kw, slots, start=0):
    p = [0.0] * H
    p[start:start + slots] = [kw] * slots
    return p


def sig(moer=None):
    return {"moer": moer if moer is not None else [500.0] * 48 + [100.0] * (H - 48), "kind": "marginal"}


def tar(price=None, block_kw=None):
    t = {"price_per_kwh": price if price is not None else [0.40] * 48 + [0.10] * (H - 48), "block_price": 12.41, "overage_multiplier": 2.0}
    if block_kw is not None:
        t["block_kw"] = block_kw
    return t


def test_shifting_into_clean_cheap_slots_saves_money_and_carbon():
    plan, base = {"a": series(7, 12, start=60)}, {"a": series(7, 12)}  # 7 kWh at 100 g / $0.10 vs 500 g / $0.40
    out = impact(plan, base, sig(), tar())
    assert out == {"saved_usd": pytest.approx(7 * 0.30), "saved_kgco2": pytest.approx(7 * 0.4)}


def test_identical_plans_save_nothing():
    p = {"a": series(7, 12)}
    assert impact(p, p, sig(), tar()) == {"saved_usd": 0.0, "saved_kgco2": 0.0}


def test_shortfall_is_not_booked_as_a_saving():
    plan, base = {"a": series(7, 6, start=60)}, {"a": series(7, 12)}  # plan delivered half the energy
    d = impact_detail(plan, base, sig(), tar())
    assert not d["energy_matched"]
    assert d["saved_usd"] == pytest.approx(3.5 * 0.30) and d["saved_kgco2"] == pytest.approx(3.5 * 0.4)


def test_no_signal_means_zero_carbon_claim_not_a_guess():
    out = impact({"a": series(7, 12, start=60)}, {"a": series(7, 12)}, {"moer": [], "kind": None}, tar())
    assert out["saved_kgco2"] == 0.0 and out["saved_usd"] == pytest.approx(7 * 0.30)


def test_no_tariff_means_zero_dollar_claim():
    out = impact({"a": series(7, 12, start=60)}, {"a": series(7, 12)}, sig(), tar(price=[]))
    assert out["saved_usd"] == 0.0 and out["saved_kgco2"] == pytest.approx(7 * 0.4)


def test_block_overage_counts_at_site_level_only_when_block_kw_is_known():
    base = {f"c{i}": series(7, 12) for i in range(20)}       # 140 kW peak
    plan = {f"c{i}": series(7, 12, start=i) for i in range(20)}  # staggered, lower peak
    flat = tar(price=[0.2] * H, block_kw=100)
    d = impact_detail(plan, base, sig([100.0] * H), flat)
    assert d["baseline"]["peak_kw"] == 140 and d["plan"]["peak_kw"] < 140
    assert d["saved_usd"] == pytest.approx((140 - 100 - max(0, d["plan"]["peak_kw"] - 100)) * 12.41 * 2 / 30, abs=1e-3)
    assert impact(plan, base, sig([100.0] * H), tar(price=[0.2] * H))["saved_usd"] == 0.0


def test_empty_and_ragged_inputs():
    assert impact({}, {}, sig(), tar()) == {"saved_usd": 0.0, "saved_kgco2": 0.0}
    out = impact({"a": [7.0, float("nan"), 7.0]}, {"a": [7.0] * 3}, sig([100.0] * H), tar(price=[0.2] * H))
    assert out["saved_usd"] == pytest.approx(0.0) and out["saved_kgco2"] == pytest.approx(0.0)


@pytest.mark.parametrize("slack,tier", [(4, "green"), (10, "green"), (3.99, "standard"), (1, "standard"), (0.99, "boost"),
                                        (0, "boost"), (-2, "boost"), (math.nan, "standard"), (None, "standard")])
def test_price_tiers_are_total(slack, tier):
    assert price(slack)["tier"] == tier and price(slack)["usd_per_kwh"] > 0
