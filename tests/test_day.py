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
from noonshift.sim import DYN_VALID_MIN, Sim, load_sessions, safe_share_kw

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
    share = safe_share_kw(S["site"])
    assert out.detail["mode_after"] == "full" and all(c.limit_kw == share for c in mid_morning.active()), "full = the static share, not p_max"
    assert sum(c.limit_kw for c in mid_morning.connectors.values()) <= S["site"]["feed_kw"] - max(S["site"]["building_load_kw"])
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


# ---- the controller dies (solutions.md §5) ----
def test_when_the_control_loop_dies_the_site_falls_back_to_the_static_share(mid_morning):
    """Nobody calls step() after 10:30: no re-solve, no apply_limits. Cars keep their last limit for DYN_VALID_MIN
    minutes (the dynamic profile's valid_to), then revert to the static share; new arrivals plug in on it. The site
    never exceeds its headroom, and after the expiry never exceeds n * safe_share_kw, with no controller at all."""
    sim = mid_morning
    share, n = safe_share_kw(S["site"]), len(sim.connectors)
    worst_headroom, worst_after = -1e9, -1e9
    for minute in range(1, 6 * 60 + 1):
        sim.tick(1)
        ev_kw = sum(c.kw for c in sim.connectors.values())
        worst_headroom = max(worst_headroom, ev_kw - headroom_now())
        if minute > DYN_VALID_MIN:
            worst_after = max(worst_after, ev_kw - n * share)
    assert worst_headroom <= 1e-6, f"site exceeded its headroom by {worst_headroom:.1f} kW with the loop dead"
    assert worst_after <= 1e-6, f"after {DYN_VALID_MIN} min the site drew {worst_after:.1f} kW above n * safe share"
    assert all(c.limit_kw == share for c in sim.active()), "every plugged car sits on the static share"


# ---- WP3: cars, needs, queues (solutions.md §3, §10, §11) ----
class Sink:
    """A fake /ws client: collects every broadcast frame."""
    def __init__(self):
        self.msgs = []

    async def send_json(self, m):
        self.msgs.append(m)

    def events(self, name):
        return [m["detail"] for m in self.msgs if m.get("type") == "event" and m["name"] == name]


def plug(connector_id, hours=4, **body):
    from noonshift.api import create_session
    from noonshift.models import SessionIn
    return asyncio.run(create_session(SessionIn(connector_id=connector_id, departure_at=S["sim"].now + timedelta(hours=hours), **body)))


def test_a_3_3_kw_car_on_a_7_kw_bay_is_planned_at_3_3_and_meets_its_deadline(mid_morning):
    from noonshift.api import car
    out = plug("c50", hours=4, vehicle={"model": "PHEV", "battery_kwh": 40, "max_kw": 3.3}, soc_now=0.7, target_soc=0.9)
    s = mid_morning.sessions[out.session_id]
    assert out.kwh_needed == pytest.approx(8.0) and out.need_confidence == "declared" and out.max_kw == 3.3
    assert car(mid_morning.connectors["c50"])["p_max_kw"] == 3.3
    assert max(S["plan"]["c50"]) <= 3.3 + 1e-9, "the brain never plans more than the car can take"
    asyncio.run(play_until(s["user_stated_departure"]))
    assert s["kwh_delivered"] == pytest.approx(8.0, abs=0.1), "8 kWh at 3.3 kW fits in 4 h and lands"


def test_need_comes_from_history_or_the_site_when_the_driver_types_nothing(mid_morning):
    out = plug("c51", hours=5)
    assert out.need_confidence in ("history", "site") and out.kwh_needed > 0
    assert out.kwh_needed == pytest.approx(8.0, abs=2.0), "the frozen day's median need, not a magic number"


def test_observation_guard_believes_the_meter_over_the_plan(mid_morning):
    """A car the form calls a 7 kW car draws 3.3 kW (PHEV, cold battery). After 5 minutes under 80 % of its limit the
    brain caps it at metered * 1.05 and says so; from then on the plan never asks for more than the car can take."""
    from noonshift.api import car
    sink = Sink()
    S["clients"].add(sink)
    out = plug("c52", hours=6, kwh_needed=9.0)
    s = mid_morning.sessions[out.session_id]
    s["car_kw"] = 3.3  # the physical truth the sim knows and the brain does not
    asyncio.run(urgency(out.session_id, UrgencyIn(level="now")))  # full power asked, so the gap shows
    asyncio.run(play_until(mid_morning.now + timedelta(minutes=7)))
    assert s["cap_observed"] and s["max_kw"] == pytest.approx(3.3 * 1.05, abs=0.02)
    caps = sink.events("cap_observed")
    assert caps and caps[-1]["connector_id"] == "c52" and caps[-1]["limit_kw"] > caps[-1]["metered_kw"]
    assert car(mid_morning.connectors["c52"])["p_max_kw"] == pytest.approx(3.47, abs=0.02)
    assert max(S["plan"]["c52"]) <= 3.47 + 1e-6
    S["clients"].discard(sink)


def test_asap_bay_is_never_deferred(mid_morning):
    from noonshift.api import car
    out = plug("c41", hours=8, kwh_needed=20.0)  # site.json connectors_asap: a loading-dock bay, 8 h of slack
    assert car(mid_morning.connectors["c41"])["boost"] is True
    assert S["plan"]["c41"][:6] == [S["site"]["p_max_kw"]] * 6, "full power from the first slot despite 8 h of slack"
    assert out.boost is False, "the session itself is not a driver Boost; the bay is configured that way"


def test_a_queue_tightens_the_slackest_car_and_a_bay_frees(mid_morning):
    from noonshift.api import site_status
    sink = Sink()
    S["clients"].add(sink)
    for _ in range(3):  # 36 replayed + 60 late cars > 60 bays
        asyncio.run(demo_oversubscribe())
    sim = mid_morning
    waiting = [s["id"] for s in sim.waiting]
    assert waiting and site_status("site-1").waiting == len(waiting)
    moved = [c.session for c in sim.active() if c.session.get("move_by")]
    assert moved, "at least one plugged car got a move-by time"
    for s in moved:
        finish = sim.now + timedelta(hours=(s["kwh_needed"] - s["kwh_delivered"]) / S["site"]["p_max_kw"])
        assert finish <= s["user_stated_departure"] <= finish + timedelta(minutes=6), "deadline = now + time to finish at full power"
        assert not s.get("urgent")
    assert len(moved) <= len(waiting), "one tightened car per waiting car"
    assert sink.events("move_by") and all(e["waiting"] > 0 for e in sink.events("move_by"))
    asyncio.run(play_until(sim.now + timedelta(hours=4)))
    plugged_later = [e for e in sink.events("plug_in") if e["session_id"] in waiting]
    assert plugged_later and all(e["waited_min"] > 0 for e in plugged_later), "waiting cars got a bay as bays freed"
    assert len(sim.waiting) < len(waiting)
    dones = sink.events("done")
    assert dones, "a full car raises a done event (the 'please move' notification)"
    S["clients"].discard(sink)


def test_metered_peak_never_reports_above_the_feed(day):
    """site_peaks() lays per-minute meters onto absolute 5-min slots. A session that began mid-slot used to be shifted by
    up to 4 minutes, so two cars misaligned in opposite directions could report a slot above the feed that never
    happened. The instantaneous sum is checked above; the reported KPI must agree with it."""
    assert any(h["start"].minute % 5 for h in day["hist"].values()), "the seed has mid-slot plug-ins, or this test proves nothing"
    assert day["site"].peak_kw <= S["site"]["feed_kw"] + 1e-6, day["site"].peak_kw
