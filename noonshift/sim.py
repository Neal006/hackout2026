"""Simulated day: a clock stepped one sim-minute at a time, 60 connectors, sessions replayed from data/sessions.json.

The Sim does physics only. It never solves; api.py sets each connector's limit from the current plan.
"""
import json
import os
from datetime import datetime, timedelta

SPEED = float(os.environ.get("SIM_SPEED", "1"))  # sim-seconds per real second; 1 = real time (POST /demo/jump to skip ahead), 480 = a day in 3 min
SLOT = timedelta(minutes=5)
START_HOUR = 6  # nothing happens before 06:00; skip it
DYN_VALID_MIN = 15  # a dynamic limit expires this many minutes after it was last set (OCPP profile valid_to); then safe share
MOVE_AFTER_MIN = 10  # Assumption A5: a driver told "done, please move" vacates within this when someone is waiting


def safe_share_kw(site):
    """solutions.md §5: the static per-connector share that keeps the site inside its feed with no controller at all:
    min(p_max, (feed - worst building load) / n). Sent once to every charger; what they revert to when we are gone."""
    if site.get("safe_share_kw"):
        return float(site["safe_share_kw"])
    load = site.get("building_load_kw") or [0.0]
    return round(max(0.0, min(site["p_max_kw"], (site["feed_kw"] - max(load)) / max(1, len(site["connectors"])))), 3)


def load_sessions(path="data/sessions.json"):
    out = []
    for s in json.load(open(path)):
        s = dict(s, kwh_delivered=0.0, boost=False, status="pending", ended_at=None)
        for k in ("arrival", "departure", "user_stated_departure"):
            s[k] = datetime.fromisoformat(s[k])
        out.append(s)
    return out


class Connector:
    """One charger. Draws min(limit, p_max * taper) while a session is charging.

    Two limits, like the two OCPP profiles: `safe_kw` is the static share (applied at plug-in, and again when the
    dynamic limit has not been refreshed for DYN_VALID_MIN minutes); `set_limit()` is the dynamic plan on top."""

    def __init__(self, id, p_max_kw=7.0, safe_kw=None):
        self.id, self.p_max_kw = id, p_max_kw
        self.safe_kw = min(safe_kw, p_max_kw) if safe_kw else p_max_kw  # no share configured = fail-open, as before
        self.session = None
        self.limit_kw = self.safe_kw
        self.dyn_left = 0
        self.slow_min = 0  # api.observe_caps: consecutive minutes drawing well under the limit
        self.kw = 0.0

    @property
    def status(self):
        return "idle" if not self.session else self.session["status"]

    def plug_in(self, session):
        self.session = session
        session["connector_id"] = self.id
        session["status"] = "charging"
        self.limit_kw, self.dyn_left = self.safe_kw, 0  # the static profile, until the next plan lands

    def set_limit(self, kw):
        self.limit_kw = max(0.0, min(kw, self.p_max_kw))
        self.dyn_left = DYN_VALID_MIN

    def tick(self, minutes):
        if self.dyn_left > 0:
            self.dyn_left -= minutes
            if self.dyn_left <= 0:
                self.limit_kw = self.safe_kw  # nobody refreshed the plan: the charger falls back on its own
        s = self.session
        if not s or s["status"] != "charging":
            self.kw = 0.0
            return
        frac = s["kwh_delivered"] / s["kwh_needed"]
        taper = 1.0 if frac < 0.8 else max(0.1, (1 - frac) / 0.2)  # battery taper: linear from 80% to ~10% at full
        car_kw = min(self.p_max_kw, s.get("car_kw") or self.p_max_kw)  # the car's own onboard charger limit
        self.kw = min(self.limit_kw, car_kw * taper)
        s["kwh_delivered"] = min(s["kwh_needed"], s["kwh_delivered"] + self.kw * minutes / 60)
        if s["kwh_delivered"] >= s["kwh_needed"] - 1e-6:
            s["status"], self.kw = "done", 0.0

    def unplug(self, now):
        s, self.session, self.kw = self.session, None, 0.0
        s["status"], s["ended_at"] = "ended", now
        return s


class Sim:
    def __init__(self, sessions, site, connector_cls=Connector):
        day = min(s["arrival"] for s in sessions).replace(hour=0, minute=0, second=0, microsecond=0)
        self.now = day + timedelta(hours=START_HOUR)
        self.day_end = day + timedelta(days=1)
        self.pending = sorted(sessions, key=lambda s: s["arrival"])
        self.waiting = []  # arrived, no free bay (solutions.md §3); plugged in as bays free up, first come first served
        self.site = site
        self.connectors = {cid: connector_cls(cid, site["p_max_kw"], safe_share_kw(site)) for cid in site["connectors"]}
        self.sessions = {s["id"]: s for s in sessions}

    def free_connector(self, preferred=None):
        c = self.connectors.get(preferred)
        if c and not c.session:
            return c
        return next((c for c in self.connectors.values() if not c.session), None)

    def arrive(self, session):
        """Plug a session in now. Returns the connector, or None if the lot is full (the car then waits)."""
        self.sessions[session["id"]] = session
        c = self.free_connector(session.get("connector_id"))
        if c:
            c.plug_in(session)
            # A newcomer takes its static share only out of headroom nobody holds yet: the plan may already fill the
            # feed, and a re-solve (a thread, tens of ms) can be a tick away. Falls back to the full share after
            # DYN_VALID_MIN if no plan ever lands, so the no-backend guarantee is unchanged.
            room = self.site["feed_kw"] - self.site["building_load_kw"][(self.now.hour * 60 + self.now.minute) // 5] \
                - sum(x.limit_kw for x in self.connectors.values() if x.session and x is not c)
            if room < c.limit_kw:
                c.limit_kw, c.dyn_left = max(0.0, room), DYN_VALID_MIN
        elif session not in self.waiting:
            self.waiting.append(session)
        return c

    def tick(self, minutes=1):
        """Advance the clock. Returns [{"name": "plug_in"|"unplug"|"done", "session_id", "connector_id"}]."""
        for c in self.connectors.values():
            c.tick(minutes)
        self.now += timedelta(minutes=minutes)
        events = []
        for c in self.connectors.values():
            s = c.session
            if s and s["status"] == "done" and not s.get("idle_since"):
                s["idle_since"] = self.now
                events.append({"name": "done", "session_id": s["id"], "connector_id": c.id})
            moved = s and s.get("idle_since") and self.waiting and self.now - s["idle_since"] >= timedelta(minutes=MOVE_AFTER_MIN)
            if s and (s["departure"] <= self.now or moved):
                s = c.unplug(self.now)
                events.append({"name": "unplug", "session_id": s["id"], "connector_id": c.id, "moved": bool(moved)})
        while self.pending and self.pending[0]["arrival"] <= self.now:
            s = self.pending.pop(0)
            c = self.arrive(s)
            if c:
                events.append({"name": "plug_in", "session_id": s["id"], "connector_id": c.id})
        while self.waiting and self.free_connector():
            s = self.waiting.pop(0)
            c = self.arrive(s)
            events.append({"name": "plug_in", "session_id": s["id"], "connector_id": c.id, "waited_min": int((self.now - s["arrival"]).total_seconds() // 60)})
        return events

    def active(self):
        return [c for c in self.connectors.values() if c.session]


def _replay(site):
    sim = Sim(load_sessions(), site)
    plugged, peak = set(), 0.0
    while sim.now < sim.day_end:
        for e in sim.tick():
            s = sim.sessions[e["session_id"]]
            if e["name"] == "plug_in":
                assert s["arrival"] <= sim.now < s["arrival"] + timedelta(minutes=2), (s["arrival"], sim.now)
                plugged.add(s["id"])
            else:
                assert abs((s["departure"] - sim.now).total_seconds()) < 60
        peak = max(peak, sum(c.kw for c in sim.connectors.values()))
    ss = sim.sessions.values()
    assert plugged == set(sim.sessions), "every session plugged in"
    assert all(s["status"] == "ended" for s in ss), "every session unplugged"
    assert all(s["kwh_delivered"] <= s["kwh_needed"] + 1e-6 for s in ss), "never overfill"
    return sim, peak


if __name__ == "__main__":  # self-check: python -m noonshift.sim
    site = json.load(open("data/site.json"))
    # 1. no controller at all: every charger sits on its static share and the site never leaves the feed
    sim, peak = _replay(site)
    share = safe_share_kw(site)
    assert peak <= len(site["connectors"]) * share + 1e-6 <= site["feed_kw"] - max(site["building_load_kw"]), peak
    short = [s for s in sim.sessions.values() if s["kwh_delivered"] < s["kwh_needed"] - 1e-3]
    # 2. fail-open (no share configured): the old picture, an uncontrolled peak above the feed
    sim, peak_open = _replay(dict(site, safe_share_kw=site["p_max_kw"]))
    short_open = [s for s in sim.sessions.values() if s["kwh_delivered"] < s["kwh_needed"] - 1e-3]
    assert all(s["kwh_delivered"] >= 0.9 * s["kwh_needed"] for s in short_open), "at full power only the taper tail can be missing"
    assert peak < peak_open <= len(site["connectors"]) * site["p_max_kw"], f"uncontrolled peak {peak_open:.0f} kW vs shared {peak:.0f} kW"
    print(f"sim ok: {len(sim.sessions)} sessions replayed; static share {share} kW/connector keeps the site at {peak:.0f} kW "
          f"({len(short)} cars short without a plan); fail-open peak {peak_open:.0f} kW, {len(short_open)} cars physically unfillable")
