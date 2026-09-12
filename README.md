# Noonshift

Deadline-based EV charging scheduler for daytime multi-connector sites. Proposal: `noonshift-proposal.md`. Team split: `team-plan.md`.

## Run

```
docker compose up -d --build
```

| What | Where |
|---|---|
| API + OpenAPI UI | http://localhost:8000/docs |
| WebSocket | ws://localhost:8000/ws |
| Web | http://localhost:3000 |
| Postgres | localhost:5432, user/pass/db `noonshift` |

The simulated day (2026-04-14, 40 sessions, 150 kW feed) starts at 06:00 and plays at `SIM_SPEED` sim-seconds per real second (default 480 = one day in 3 minutes). It restarts at midnight.

```
SIM_SPEED=120 docker compose up -d      # one day in 12 minutes
OCPP=1 docker compose up -d             # connectors speak OCPP 1.6J to an in-process CSMS (optional)
```

Code changes under `noonshift/` and `data/` hot-reload inside the container.

## Endpoints

```
POST /sessions                  {connector_id, departure_at, kwh_needed?}  driver answers "When do you leave?"
POST /sessions/{id}/boost
GET  /sessions/{id}/live
GET  /sites/site-1/plan
GET  /sites/site-1/impact?from&to
GET  /sites/site-1/status       {mode, last_solve_at, connectors_active}
GET  /grid/flex-forecast        (stub)
POST /openadr/events            {start, end, reduce_kw}  (stub: reduces feed headroom, re-solves)

POST /demo/early_unplug         Tom leaves now
POST /demo/boost                Sofia: deadline -> now+1h, Boost
POST /demo/oversubscribe        +20 late arrivals, 2 h deadlines
POST /demo/signal_outage        {rungs: ["live"|"cached"|"tariff"|"deadline"], restore: false}
```

Fail-safe ladder: `live -> cached (<= 6 sim-hours) -> tariff -> deadline -> full`. `status.mode` shows the rung.

## Contract with the front-end

`docs/openapi.json` and `docs/ws-frames.json` are regenerated on every API start from `noonshift/models.py`. `/ws` sends one JSON object per frame: `plan` (every re-solve), `meter` (every sim-minute), `event` (plug_in, unplug, deadline, boost, dr, demo, mode, day_reset).

## Scheduler

`noonshift/scheduler.py`: elastic LP over 40 connectors x 288 five-minute slots (scipy HiGHS, ~30-60 ms). `solve` = the
five rules of proposal 4.4 plus fairness and a 6 A floor; `impact` = energy-matched receipt vs the charge-now baseline;
`price` = three tiers by slack. Design notes, edge cases and status: `neal-plan.md`. Data in `data/*.json` is generated
placeholder data with the real files' schema (`python -m noonshift.seed gen`); `scripts/fetch_data.py` downloads the
real day (WattTime, ACN-Data, or the no-auth CAISO fallback).

## Checks

```
pip install -r requirements-dev.txt
python -m pytest                   # 52 tests: scheduler, impact, perf, full-day replay with the four demo scenarios (~45 s)
python scripts/prove.py            # slide 1: charge-immediately vs Noonshift on the day, exit 1 if the 15% CO2 gate fails
python -m noonshift.sim            # replays the day at full power
python -m noonshift.test_loop      # control loop + ladder, no DB needed
python -m noonshift.ocpp_gateway   # OCPP round trip
DATABASE_URL=postgresql://noonshift:noonshift@localhost/noonshift python -m noonshift.db   # schema
```

`requirements.txt` pins `scipy==1.14.*`: 1.15.x's HiGHS bindings took 66 s per solve on Windows (`tests/test_perf.py` guards it).
