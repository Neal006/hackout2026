# Noonshift — 48-hour team plan

Four people, four lanes. Everything hangs off one function:

```
solve(cars, site, signal, tariff, now) -> plan   # {connector_id: [kW per 5-min slot]}
```

The "charge immediately" baseline is the same function with every deadline set to now. The receipt is `baseline − plan`. Nobody writes a second scheduling path.

Shared rules:
- Demo must run offline. All grid and session data is downloaded to JSON before the clock starts.
- Single site, 40 connectors, 150 kW feed, PG&E Business EV tariff, WattTime CAISO_NORTH. Multi-site is a slide.
- No Redis, no TimescaleDB. In-process state + FastAPI WebSocket + plain Postgres.
- Hour 6 is the go/no-go gate: if `prove.py` shows < 15% saving, we change the day/site before anyone builds UI.

---

## Neal — Scheduler and proof (the number)

Owns `noonshift/scheduler.py`, `noonshift/data/`, `scripts/prove.py`, `tests/test_scheduler.py`.

**Before the clock**
- Register for WattTime Basic and the ACN-Data API token. Download one spring weekday (Caltech site) of ACN sessions and the matching WattTime MOER history to `data/*.json`.
- Fallback if WattTime stalls: gridstatus CAISO fuel mix → average intensity, flagged `"average"` in the signal object.

**h0–6 — prove**
- `scripts/prove.py`: load sessions, tariff dict (super-off-peak 09–14, peak 16–21, off-peak rest, kW block price and 2× overage), MOER. Run `solve`, run baseline, print for both: kWh, $ bill, kg CO₂, peak kW. That printout is slide 1.

**h6–16 — scheduler**
- `scipy.optimize.linprog` (HiGHS). Objective and five rules exactly as in `noonshift-proposal.md` §4.4: energy by deadline (elastic shortfall), progress floor α=0.5, 30-min final sprint, charger max, site limit minus building load, tariff block overage penalty.
- Post-step: any allocation between 0 and 6 A rounds up to 6 A.
- `tests/test_scheduler.py`, three asserts: feasible deadlines are met; site limit never exceeded; oversubscribed lot returns a plan with proportional shortfall and no exception.

**h16–30 — impact engine**
- `noonshift/impact.py`: metered kWh × MOER per slot vs baseline → `saved_usd`, `saved_kgco2`, per session and per site.
- Deadline-sets-the-price: three per-kWh tiers by slack (≥4 h cheapest, 1–4 h mid, <1 h = Boost). Returned with every plan.

**h30–48**
- Support Tirth on the four demo scenarios (they all exercise the solver). Tune weights so the demo numbers are honest and visible.

Hands to Tirth: `solve()`, `impact()`, `price()` signatures frozen by h10.

---

## Tirth — Simulator, API, OCPP (the engine room)

Owns `noonshift/sim.py`, `noonshift/api.py`, `noonshift/ocpp_gateway.py`, `docker-compose.yml`.

**h0–6**
- Docker Compose: `api`, `postgres`, `web`. One command up.
- Postgres schema: `sites`, `connectors`, `sessions`, `plan_slots`, `meter_values`.
- Stub `solve()` returning full power so the loop runs before Neal's solver lands.

**h6–16 — simulator + API**
- `sim.py`: simulated clock that plays one day in ~3 minutes (configurable). 40 connectors replay ACN sessions: arrive, state deadline (from session data), draw what the plan says, taper above ~80% SoC, unplug at departure.
- `api.py`: FastAPI with the seven endpoints from §6.6. `POST /sessions`, `POST /sessions/{id}/boost`, `GET /sessions/{id}/live`, `GET /sites/{id}/plan`, `GET /sites/{id}/impact`, `GET /grid/flex-forecast` (stub), `POST /openadr/events` (stub).
- Control loop: re-solve every simulated 5 min and immediately on any event. WebSocket `/ws` broadcasts every new plan and every meter tick.
- Fail-safe ladder: live signal → cached (≤6 h) → tariff-only → deadline-only → full power. Exposed as `GET /sites/{id}/status.mode` so Nandini can show a banner.

**h16–30 — OCPP adapter**
- `ocpp_gateway.py` with `mobilityhouse/ocpp`: CSMS in-process; simulated chargers speak OCPP 1.6J (`BootNotification`, `StartTransaction`, `MeterValues`, `SetChargingProfile`, `StopTransaction`). Same `Connector` interface as the direct-call sim, switchable by env var. The demo never depends on this path — direct calls are the default.

**h30–40 — demo scenario endpoints**
- `POST /demo/early_unplug` (Tom leaves at 13:00), `POST /demo/boost` (Sofia), `POST /demo/oversubscribe` (+20 late arrivals), `POST /demo/signal_outage` (kill the feed → ladder drops). Each returns what changed so Nandini can show it.

**h40–48**
- Seed script, `README.md` run instructions, freeze the demo dataset.

Hands to Nandini: OpenAPI schema and WebSocket message shapes frozen by h12.

---

## Nandini — Front-ends (what the judges see)

Owns `web/` — React + Vite, one code base, two routes: `/driver` (PWA) and `/ops`.

**h0–6**
- Scaffold, routing, WebSocket client, mock data matching Tirth's message shapes. Colour system: warm off-white, amber accent, grid-blue for data.

**h6–16 — driver PWA**
- One screen. "Leaving at 17:30?" pre-filled, a time picker, the three price tiers shown next to the choice, one Boost button.
- After OK: plan line ("charging 11:10–12:20, ready by 17:30"), live bar "grid is cleaner than X% of today", kWh delivered.
- On unplug: receipt — "You saved $X and Y kg CO₂ vs charging at plug-in", labelled *estimate*, method one tap away. If a shortfall happened, say so plainly.
- Small line under the question: "your last 5 visits: left 17:20–17:45" (from Tirth's session history).

**h16–30 — operator dashboard**
- Site kW vs 150 kW limit and tariff block: live line chart.
- Per-connector Gantt: planned (light) vs actual (solid), deadline markers, Boost in red.
- Counters ticking up: $ saved, kg CO₂ saved, peak kW avoided — all vs baseline.
- "Re-solved 4 s ago" pulse. Deadline-risk list. Fail-safe mode banner (from `status.mode`).

**h30–40 — demo controls**
- A "Demo" drawer on `/ops` with four buttons wired to Tirth's `/demo/*` endpoints. Each button must produce a change the audience can see within two seconds (Gantt reshuffle, banner, ETA update).

**h40–48**
- Polish, mobile check of `/driver` at 400 px, remove mock data, PWA manifest.

---

## Srishti — Data, pitch, demo (the story)

Owns `pitch/`, `README.md` narrative, demo choreography, and unblocking everyone else.

**Before the clock**
- Back up Neal on registrations: WattTime, ACN-Data, gridstatus install. Pick the demo day (a spring weekday with strong midday curtailment) and confirm both datasets cover it.
- Re-verify the competitor table (§8.1) against current public pages; note any change.

**h0–6**
- Turn `prove.py` output into slide 1 the moment it exists. Draft the one-line claim.

**h6–16**
- Pitch deck: problem picture (24 h carbon vs parked-at-work vs default charging), four numbers, "When do you leave?", six parts, who pays, empty-square quadrant, comparison table, what we don't claim, 48 h plan. Pull everything from `noonshift-proposal.md`; no new claims.
- Cost-savings slide: the worked 40-charger example (~$20k unmanaged vs ~$13k, ~30%), with published 10–40% range and the peer-reviewed 28% peak / 9% cost case as the floor.

**h16–30**
- Demo script, timed to 4 minutes: (1) plug-in question, (2) dashboard fills as the day plays, (3) Boost, (4) early unplug, (5) oversubscribe, (6) signal outage, (7) receipt. Rehearse against Nandini's mock data before the real thing exists.
- Herding slide: why we never broadcast; committed-load term; full cascading method is roadmap.
- "Hard questions" slide: driver lies about time (deadline sets price; accuracy learned; worst case = today's baseline), forecast wrong, backend dies, can a bug overcharge a circuit, driver leaves early.

**h30–40**
- Run the full demo end to end on a clean machine from the README. Log every rough edge to the owner. Record a backup screen capture of the working demo.

**h40–48**
- Final rehearsal ×3. Submission form, repo description, backup video attached.

---

## Handoffs and checkpoints

| Hour | Gate | Owner |
|---|---|---|
| 6 | `prove.py` prints ≥15% saving; slide 1 exists | Neal, Srishti |
| 10 | `solve()` / `impact()` / `price()` signatures frozen | Neal → Tirth |
| 12 | OpenAPI + WebSocket shapes frozen | Tirth → Nandini |
| 16 | Day plays end to end with stub UI | Tirth, Nandini |
| 30 | Both front-ends live on real data | Nandini |
| 40 | Four demo buttons work; clean-machine run passes | Tirth, Nandini, Srishti |
| 46 | Backup video recorded | Srishti |
