"""Integration: the whole simulated day through api.step() with the real solver, the sim's battery taper and
the receipt path, then the four demo scenarios. No server, no Postgres (db.* are no-ops without DATABASE_URL)."""
import asyncio
import json
import logging
from datetime import timedelta
from pathlib import Path

import pytest

from noonshift import scheduler
from noonshift.api import (S, aligned, demo_boost, demo_early_unplug, demo_oversubscribe, demo_signal_outage, site_impact,
                           step, urgency)
from noonshift.models import OutageIn, UrgencyIn
from noonshift.sim import Sim, load_sessions

EARLY = {7, 23}  # seed.py: told us ~17:00, actually leave ~13:00
DATA = Path(__file__).parent / "data"  # frozen copy of the seeded placeholder day: data/ may hold real data later


def fresh():
    S.clear()
    S.update(site=json.load(open(DATA / "site.json")), signal=json.load(open(DATA / "signal.json")),
             tariff=json.load(open(DATA / "tariff.json")), plan={}, plan_at=None, baseline={}, impact={}, hist={}, mode="live",
             ladder={"live": True, "cached": True, "tariff": True, "deadline": True}, live_lost_at=None,
             last_solve_at=None, dr=[], clients=set(), next_id=1000)
    S["sim"] = Sim(load_sessions(DATA / "sessions.json"), S["site"])


def headroom_now():
    site = S["site"]
    k = (S["sim"].now.hour * 60 + S["sim"].now.minute) // 5
    return site["feed_kw"] - site["building_load_kw"][k]


async def play_until(when, worst=None):
    """Step the sim to `when`; track the worst site overload (metered kW minus headroom) in `worst`."""
    sim = S["sim"]
    while sim.now < when:
        await step()
        if worst is not None:
            worst[0] = max(worst[0], sum(c.kw for c in sim.connectors.values()) - headroom_now())


def pro_rata_floor(s, at):
    elapsed = (at - s["arrival"]).total_seconds()
    dwell = (s["user_stated_departure"] - s["arrival"]).total_seconds()
    return scheduler.ALPHA * s["kwh_needed"] * min(1.0, elapsed / dwell)


class Errors(logging.Handler):
    def __init__(self):
        super().__init__(logging.ERROR)
        self.records = []

    def emit(self, r):
        self.records.append(r.getMessage())


@pytest.fixture(scope="module")
def day():
    fresh()
    errors = Errors()
    logging.getLogger("noonshift.scheduler").addHandler(errors)
    worst = [-1e9]
    asyncio.run(play_until(S["sim"].day_end - timedelta(minutes=1), worst))
    return {"sessions": dict(S["sim"].sessions), "impact": dict(S["impact"]), "hist": dict(S["hist"]), "worst_overload": worst[0],
            "site": site_impact("site-1", None, None), "errors": errors.records}


def test_the_solver_never_fell_open_during_the_day(day):
    assert day["errors"] == [], day["errors"]


def test_metered_site_load_never_exceeds_headroom(day):
    assert day["worst_overload"] <= 1e-6, day["worst_overload"]


def test_every_long_dwell_car_is_full_before_it_leaves(day):
    for s in day["sessions"].values():
        if s["id"] in EARLY:
            continue
        assert s["status"] == "ended" and abs(s["kwh_delivered"] - s["kwh_needed"]) < 1e-3, (s["id"], s["kwh_delivered"], s["kwh_needed"])


def test_early_leavers_hold_the_progress_floor(day):
    for sid in EARLY:
        s = day["sessions"][sid]
        assert s["kwh_delivered"] >= pro_rata_floor(s, s["departure"]) - scheduler.MIN_KW * scheduler.SLOT_H, (sid, s["kwh_delivered"])


def test_first_hour_floor_holds_for_every_car_on_the_day(day):
    """business.md §4 rule 1 and rule 3, as one assertion: 60 min after plug-in every car has min(need, 3.5 kWh), which
    is what a dumb 7 kW charger gives in 30 min. Beyond the first hour the guarantee is the 50 % pro-rata floor (tested
    above); a dumb-charger bound over *every* rolling hour would forbid the shifting the product exists to do."""
    for sid, h in day["hist"].items():
        s = day["sessions"][sid]
        first_hour = sum(h["kw_min"][:60]) / 60
        assert first_hour >= min(s["kwh_needed"], scheduler.FIRST_HOUR_KWH) - 0.1, (sid, first_hour, s["kwh_needed"])


def test_every_session_has_a_finalised_receipt(day):
    for sid, s in day["sessions"].items():
        assert day["hist"][sid].get("final"), sid
        r = day["impact"][sid]
        assert set(r) == {"saved_usd", "saved_kgco2"}
        if sid not in EARLY:
            assert r["saved_kgco2"] > 0, (sid, r)


def test_site_receipt_is_a_visible_saving(day):
    out = day["site"]
    kwh_needed = sum(s["kwh_needed"] for s in day["sessions"].values())
    assert out.sessions == 40 and out.kwh == pytest.approx(kwh_needed - sum(
        day["sessions"][i]["kwh_needed"] - day["sessions"][i]["kwh_delivered"] for i in EARLY), abs=0.05)
    assert out.saved_usd > 0 and out.saved_kgco2 > 0
    # the h6 gate in team-plan.md is a 15% saving; this is against the seeded placeholder signal (prove.py: real data)
    plan_kg = sum(receipt_detail(h)["plan"]["kgco2"] for h in day["hist"].values())
    pct = out.saved_kgco2 / (plan_kg + out.saved_kgco2)
    assert pct >= 0.15, f"CO2 saving {100 * pct:.1f}% < 15% gate"


def receipt_detail(h):
    """Same arithmetic as api.session_impact, but the full impact_detail() of the finished session."""
    full = len(h["kw_min"]) // 5
    metered = [sum(h["kw_min"][5 * k:5 * k + 5]) / 5 for k in range(full)]
    sig = {"moer": aligned(S["signal"]["moer"], h["start"]), "kind": S["signal"]["kind"]}
    tar = dict(S["tariff"], price_per_kwh=aligned(S["tariff"]["price_per_kwh"], h["start"]))
    return scheduler.impact_detail({"s": metered}, {"s": h["baseline"]}, sig, tar)


# ---- demo scenarios from a 10:30 snapshot ----
@pytest.fixture
def mid_morning():
    fresh()
    asyncio.run(play_until(S["sim"].now.replace(hour=10, minute=30)))
    return S["sim"]


def test_demo_boost_charges_now_at_boost_price(mid_morning):
    out = asyncio.run(demo_boost())
    sid, cid = out.detail["session_id"], out.detail["connector_id"]
    assert out.detail["price"]["tier"] == "boost"
    assert S["plan"][cid][:6] == [S["site"]["p_max_kw"]] * 6, "boost = full power from now"
    s = mid_morning.sessions[sid]
    before = s["kwh_delivered"]
    asyncio.run(play_until(mid_morning.now + timedelta(hours=1)))
    assert s["kwh_delivered"] - before >= 0.9 * min(s["kwh_needed"] - before, S["site"]["p_max_kw"]), "an hour at (near) full power"


def test_demo_early_unplug_finalises_an_honest_receipt(mid_morning):
    out = asyncio.run(demo_early_unplug())
    sid = out.detail["session_id"]
    s = mid_morning.sessions[sid]
    assert s["status"] == "ended" and out.detail["shortfall_kwh"] >= 0
    assert s["kwh_delivered"] >= pro_rata_floor(s, mid_morning.now) - scheduler.MIN_KW * scheduler.SLOT_H
    asyncio.run(play_until(mid_morning.now + timedelta(minutes=1)))
    assert S["hist"][sid]["final"] and sid not in S["plan"] and sid in S["impact"]


def test_demo_oversubscribe_degrades_without_starving_anyone(mid_morning):
    out = asyncio.run(demo_oversubscribe())
    late = out.detail["session_ids"]
    assert out.detail["added"] == 20 and out.detail["demand_kw_if_all_full_power"] > S["site"]["feed_kw"]
    worst = [-1e9]
    asyncio.run(play_until(mid_morning.now + timedelta(hours=2, minutes=1), worst))
    assert worst[0] <= 1e-6, "site limit holds while oversubscribed"
    fr = [mid_morning.sessions[i]["kwh_delivered"] / mid_morning.sessions[i]["kwh_needed"] for i in late]
    assert min(fr) > 0.3, f"no late car is starved: {min(fr):.2f}"
    assert max(fr) - min(fr) <= 0.35, f"late cars share the shortfall: {min(fr):.2f}..{max(fr):.2f}"
    assert all(mid_morning.sessions[i]["status"] == "ended" for i in late)


def test_demo_signal_outage_walks_the_ladder_and_keeps_planning(mid_morning):
    out = asyncio.run(demo_signal_outage(OutageIn(rungs=["live"])))
    assert (out.detail["mode_before"], out.detail["mode_after"]) == ("live", "cached")
    out = asyncio.run(demo_signal_outage(OutageIn(rungs=["cached", "tariff"])))
    assert out.detail["mode_after"] == "deadline" and S["plan"], "deadline-only rung still yields a plan"
    assert all(c.limit_kw == S["plan"][c.id][0] for c in mid_morning.active() if c.status == "charging")
    out = asyncio.run(demo_signal_outage(OutageIn(rungs=["deadline"])))
    assert out.detail["mode_after"] == "full" and all(c.limit_kw == c.p_max_kw for c in mid_morning.active())
    out = asyncio.run(demo_signal_outage(OutageIn(restore=True)))
    assert out.detail["mode_after"] == "live"


# ---- urgency bands (business.md §4b) ----
def charging_now(sim):
    return sorted((c.session for c in sim.active() if c.status == "charging" and not c.session["boost"]),
                  key=lambda s: s["kwh_delivered"] / s["kwh_needed"])


def test_urgency_now_is_full_power_at_todays_rate(mid_morning):
    s = charging_now(mid_morning)[0]
    out = asyncio.run(urgency(s["id"], UrgencyIn(level="now")))
    assert out.urgency == "now" and out.boost and out.price.usd_per_kwh == S["site"]["employee_rate_usd_per_kwh"]
    assert S["plan"][s["connector_id"]][:6] == [S["site"]["p_max_kw"]] * 6, "full power from the next slot"
    assert s["user_stated_departure"] == mid_morning.now and s["urgent"]


def test_urgency_soon_moves_the_deadline_and_under_15_min_is_now(mid_morning):
    a, b = charging_now(mid_morning)[:2]
    leave = mid_morning.now + timedelta(hours=2)
    out = asyncio.run(urgency(a["id"], UrgencyIn(level="soon", leave_at=leave)))
    assert out.urgency == "soon" and not out.boost and a["user_stated_departure"] == a["departure"] == leave
    assert out.plan.ready_by == leave and out.price.usd_per_kwh == S["site"]["employee_rate_usd_per_kwh"]
    assert sum(S["plan"][a["connector_id"]][24:]) == 0, "nothing planned after the new deadline"
    out = asyncio.run(urgency(b["id"], UrgencyIn(level="soon", leave_at=mid_morning.now + timedelta(minutes=10))))
    assert out.urgency == "now" and out.boost, "under 15 minutes nothing can be scheduled: full power now"


def test_urgency_priority_keeps_the_deadline_and_raises_the_floor(mid_morning):
    s = charging_now(mid_morning)[0]
    was = s["user_stated_departure"]
    out = asyncio.run(urgency(s["id"], UrgencyIn(level="priority")))
    assert out.urgency == "priority" and not out.boost and s["user_stated_departure"] == was
    assert out.price.usd_per_kwh == S["site"]["employee_rate_usd_per_kwh"], "any band pays exactly R"
    from noonshift.api import car
    c = car(mid_morning.connectors[s["connector_id"]])
    assert c["floor_alpha"] == 0.9 and c["priority"] == 2.0


def test_flexible_driver_pays_less_than_r_and_never_more(day):
    """§7b on the replayed day: every non-urgent receipt is at or below R, and the day's flexible cars earned a discount."""
    from noonshift.api import session_out
    prices = [session_out(s).price.usd_per_kwh for s in day["sessions"].values()]
    r = S["site"]["employee_rate_usd_per_kwh"]
    assert max(prices) <= r and min(prices) < r
