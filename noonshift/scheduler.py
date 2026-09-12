"""STUBS. Neal owns this file; his version drops in with the same three signatures and nothing else changes.

Conventions the caller (api.py) relies on:
- Every list "per slot" is aligned: index 0 is the 5-min slot containing `now`, 288 slots follow, wrapping the day.
- Fail-safe rungs shape the inputs, not the call: tariff-only => signal == {"moer": [], "kind": None};
  deadline-only => additionally tariff["price_per_kwh"] == []. Full-power rung never calls solve().
"""
HORIZON = 288


def solve(cars, site, signal, tariff, now) -> dict[str, list[float]]:
    """cars: [{connector_id, arrival, departure, kwh_needed, kwh_delivered, p_max_kw, boost}]
    site: {feed_kw, building_load_kw: [per slot], block_kw}
    signal: {moer: [gCO2/kWh per slot], kind: "marginal"|"average"|None}
    tariff: {price_per_kwh: [per slot], block_price, overage_multiplier}
    returns {connector_id: [kW per slot from now to horizon]}

    Stub: full power for every car. This is also the "charge immediately" baseline."""
    return {c["connector_id"]: [c["p_max_kw"]] * HORIZON for c in cars}


def impact(plan, baseline, signal, tariff) -> dict[str, float]:
    """Savings of `plan` vs `baseline` (both {connector_id: [kW per slot]}). Stub: zero."""
    return {"saved_usd": 0.0, "saved_kgco2": 0.0}


def price(slack_hours: float) -> dict:
    """Deadline sets the price. Three tiers by slack (dwell minus charge time)."""
    if slack_hours >= 4:
        return {"tier": "green", "usd_per_kwh": 0.18}
    if slack_hours >= 1:
        return {"tier": "standard", "usd_per_kwh": 0.25}
    return {"tier": "boost", "usd_per_kwh": 0.40}
