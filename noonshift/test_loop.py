"""Control loop + fail-safe ladder check. Runs without Postgres or a server:  python -m noonshift.test_loop"""
import asyncio
import json
from datetime import timedelta

from . import api
from .api import S, pick_mode, resolve, step
from .sim import Sim, load_sessions


class Spy:
    def __init__(self):
        self.frames = []

    async def send_json(self, m):
        self.frames.append(m)


async def main():
    S.update(site=json.load(open("data/site.json")), signal=json.load(open("data/signal.json")),
             tariff=json.load(open("data/tariff.json")), plan={}, plan_at=None, baseline={}, impact={}, mode="live",
             ladder={"live": True, "cached": True, "tariff": True, "deadline": True}, live_lost_at=None,
             last_solve_at=None, dr=[], clients=set(), next_id=1000)
    S["sim"] = Sim(load_sessions(), S["site"])
    spy = Spy()
    S["clients"].add(spy)

    # 1. control loop: a re-solve on every 5-min boundary and on every plug-in, never otherwise
    for _ in range(4 * 60):  # 06:00 -> 10:00 covers every arrival
        await step()
    plans = [f for f in spy.frames if f["type"] == "plan"]
    events = [f for f in spy.frames if f["type"] == "event"]
    meters = [f for f in spy.frames if f["type"] == "meter"]
    assert len(meters) == 240, len(meters)
    plug_ins = [e for e in events if e["name"] == "plug_in"]
    assert len(plug_ins) == 40, len(plug_ins)
    for e in plug_ins:  # each plug-in is followed by a plan solved at that same sim-minute
        assert any(p["solved_at"] == e["sim_time"] and p["reason"].startswith("event") for p in plans), e
    assert all(p["solved_at"][-2:] == "00" or p["reason"].startswith("event") for p in plans)
    assert len({p["solved_at"] for p in plans if int(p["solved_at"][14:16]) % 5 == 0}) == 48, "a solve on every 5-min boundary"
    assert all(len(c["kw"]) == 288 for p in plans for c in p["connectors"])
    assert S["sim"].active(), "cars are plugged in by 10:00"
    assert all(c.limit_kw == S["plan"][c.id][0] for c in S["sim"].active() if c.status == "charging"), "plan drives connector limits"

    # 2. ladder: live -> cached (<= 6 h) -> tariff -> deadline -> full, and back
    now = S["sim"].now
    assert pick_mode(now) == "live"
    S["ladder"]["live"] = False
    S["live_lost_at"] = now
    assert pick_mode(now) == "cached"
    assert pick_mode(now + timedelta(hours=6, minutes=1)) == "tariff", "cache goes stale after 6 h"
    S["ladder"]["tariff"] = False
    assert pick_mode(now + timedelta(hours=7)) == "deadline"
    S["ladder"]["deadline"] = False
    assert pick_mode(now + timedelta(hours=7)) == "full"
    msg = await resolve("mode")
    assert msg.mode == "cached" and S["mode"] == "cached"  # cache still fresh at `now`
    S["ladder"]["cached"] = False
    msg = await resolve("mode")
    assert msg.mode == "full" and all(c.limit_kw == c.p_max_kw for c in S["sim"].active()), "full rung = fail-open"
    S["ladder"].update(live=True, cached=True, tariff=True, deadline=True)
    assert (await resolve("mode")).mode == "live"
    print(f"loop ok: {len(plans)} plans, {len(plug_ins)} plug-ins, {len(meters)} meter frames; ladder walks all five rungs")


if __name__ == "__main__":
    asyncio.run(main())
