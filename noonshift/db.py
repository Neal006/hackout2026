"""Postgres: schema + three write helpers. No DATABASE_URL -> every call is a no-op so sim/tests run without a DB."""
import os

import asyncpg

DDL = """
create table if not exists sites (id text primary key, feed_kw real not null, block_kw real not null);
create table if not exists connectors (id text primary key, site_id text references sites, p_max_kw real not null);
create table if not exists sessions (
  id int primary key, connector_id text references connectors, site_id text references sites,
  arrival timestamp not null, departure timestamp not null, user_stated_departure timestamp not null,
  kwh_needed real not null, kwh_delivered real not null default 0, boost bool not null default false,
  ended_at timestamp);
create table if not exists plan_slots (
  solved_at timestamp not null, connector_id text not null, slot_start timestamp not null,
  mode text not null, kw real[] not null);
create table if not exists meter_values (
  ts timestamp not null, connector_id text not null, session_id int, kw real not null, kwh real not null);
create index if not exists meter_values_ts on meter_values (ts);
"""

pool = None


async def connect():
    global pool
    url = os.environ.get("DATABASE_URL")
    if not url or pool:
        return
    pool = await asyncpg.create_pool(url)
    async with pool.acquire() as c:
        await c.execute(DDL)


async def save_session(s):
    if not pool:
        return
    await pool.execute(
        "insert into sessions (id, connector_id, site_id, arrival, departure, user_stated_departure, kwh_needed, kwh_delivered, boost, ended_at) "
        "values ($1,$2,'site-1',$3,$4,$5,$6,$7,$8,$9) on conflict (id) do update set connector_id=$2, "
        "user_stated_departure=$5, kwh_delivered=$7, boost=$8, ended_at=$9",
        s["id"], s["connector_id"], s["arrival"], s["departure"], s["user_stated_departure"],
        s["kwh_needed"], s["kwh_delivered"], s["boost"], s.get("ended_at"))


async def save_plan(solved_at, mode, plan):
    if not pool:
        return
    await pool.executemany("insert into plan_slots values ($1,$2,$1,$3,$4)",
                           [(solved_at, cid, mode, kw) for cid, kw in plan.items()])


async def save_meters(ts, rows):
    """rows: [(connector_id, session_id, kw, kwh)]"""
    if not pool or not rows:
        return
    await pool.executemany("insert into meter_values values ($1,$2,$3,$4,$5)", [(ts, *r) for r in rows])


if __name__ == "__main__":  # self-check: python -m noonshift.db
    import asyncio

    async def main():
        await connect()
        rows = await pool.fetch("select table_name from information_schema.tables where table_schema='public' order by 1")
        names = [r[0] for r in rows]
        assert names == ["connectors", "meter_values", "plan_slots", "sessions", "sites"], names
        print("schema ok:", names)

    asyncio.run(main())
