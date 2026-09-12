"""Seed: generate placeholder data/*.json and load them into Postgres.

    python -m noonshift.seed gen    # write data/{site,sessions,signal,tariff}.json (placeholders until Neal's real files land)
    python -m noonshift.seed        # create schema and insert site, connectors, sessions
"""
import asyncio
import json
import random
import sys
from datetime import datetime, timedelta

DAY = "2026-04-14"  # spring Tuesday; every data file uses this date
SLOTS = 288


def _band(anchors):
    """Piecewise-linear 288-slot curve from {hour: value} anchors."""
    hs = sorted(anchors)
    out = []
    for k in range(SLOTS):
        h = k / 12
        lo = max(x for x in hs if x <= h)
        hi = min((x for x in hs if x > h), default=lo)
        f = 0 if hi == lo else (h - lo) / (hi - lo)
        out.append(round(anchors[lo] + f * (anchors[hi] - anchors[lo]), 1))
    return out


def gen():
    rnd = random.Random(7)
    t = lambda h, m: f"{DAY}T{h:02d}:{m:02d}:00"
    sessions = []
    for i in range(1, 41):
        arr = 7 * 60 + 30 + rnd.randint(0, 120)
        dep = 16 * 60 + rnd.randint(0, 120)
        stated = dep + rnd.randint(0, 30)  # drivers round up
        if i in (7, 23):  # two Toms: told 17:00-ish, actually leave ~13:00
            dep = 13 * 60 + rnd.randint(0, 30)
        sessions.append({
            "id": i, "connector_id": f"c{i:02d}",
            "arrival": t(*divmod(arr, 60)), "departure": t(*divmod(dep, 60)),
            "user_stated_departure": t(*divmod(stated, 60)),
            "kwh_needed": round(rnd.uniform(6, 10), 1),
        })
    json.dump(sessions, open("data/sessions.json", "w"), indent=1)

    json.dump({"kind": "marginal", "region": "CAISO_NORTH", "date": DAY,
               "moer": _band({0: 430, 6: 390, 9: 260, 12.5: 120, 15: 190, 18.5: 540, 21: 490, 24: 430})},
              open("data/signal.json", "w"))

    # PG&E Business EV shape: super-off-peak 09-14, peak 16-21, off-peak rest. $/kWh approximate.
    price = [0.16 if 9 <= k / 12 < 14 else 0.36 if 16 <= k / 12 < 21 else 0.20 for k in range(SLOTS)]
    json.dump({"name": "PG&E BEV-2-S (approx)", "price_per_kwh": price,
               "block_kw": 100, "block_price": 12.41, "overage_multiplier": 2.0},
              open("data/tariff.json", "w"))

    json.dump({"id": "site-1", "feed_kw": 150, "block_kw": 100,
               "connectors": [f"c{i:02d}" for i in range(1, 61)], "p_max_kw": 7.0,  # 40 in use, 20 spare for /demo/oversubscribe
               "building_load_kw": _band({0: 20, 7: 20, 8: 40, 18: 40, 19: 20, 24: 20})},
              open("data/site.json", "w"))
    print("wrote data/{site,sessions,signal,tariff}.json")


async def load():
    from . import db
    await db.connect()
    if not db.pool:
        print("no DATABASE_URL: running without Postgres")
        return
    site = json.load(open("data/site.json"))
    sessions = json.load(open("data/sessions.json"))
    async with db.pool.acquire() as c:
        await c.execute("insert into sites values ($1,$2,$3) on conflict (id) do update set feed_kw=$2, block_kw=$3",
                        site["id"], site["feed_kw"], site["block_kw"])
        await c.executemany("insert into connectors values ($1,$2,$3) on conflict do nothing",
                            [(cid, site["id"], site["p_max_kw"]) for cid in site["connectors"]])
        await c.executemany(
            "insert into sessions (id, connector_id, site_id, arrival, departure, user_stated_departure, kwh_needed) "
            "values ($1,$2,$3,$4,$5,$6,$7) on conflict (id) do update set kwh_delivered=0, boost=false, ended_at=null",
            [(s["id"], s["connector_id"], site["id"], datetime.fromisoformat(s["arrival"]),
              datetime.fromisoformat(s["departure"]), datetime.fromisoformat(s["user_stated_departure"]),
              s["kwh_needed"]) for s in sessions])
    print(f"seeded {site['id']}: {len(site['connectors'])} connectors, {len(sessions)} sessions")


if __name__ == "__main__":
    gen() if sys.argv[1:] == ["gen"] else asyncio.run(load())
