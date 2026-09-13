# Architecture

How Noonshift works, from a driver plugging in to a charger changing its current. Everything here is what the code on `main` does today; where a piece is planned rather than built, it says so.

Diagrams are Mermaid — GitHub renders them inline.

---

## 1. The pieces

```mermaid
flowchart TB
    subgraph inputs [Inputs]
        SIG[Grid signal<br/>data/signal.json<br/>288 × gCO₂/kWh]
        TAR[Tariff<br/>data/tariff.json<br/>288 × $/kWh + kW block]
        SITE[Site<br/>data/site.json<br/>feed kW · building load · connectors]
        SES[Sessions<br/>data/sessions.json<br/>arrival · stated departure · kWh]
    end
    subgraph backend [noonshift/]
        API[api.py<br/>FastAPI · state dict S · control loop]
        SIM[sim.py<br/>1-min clock · connectors · taper]
        LP[scheduler.py<br/>elastic LP · scipy/HiGHS]
        OCPP[ocpp_gateway.py<br/>OCPP 1.6J CSMS]
        DB[(db.py<br/>Postgres, optional)]
    end
    subgraph apps [Front-ends]
        WW[wattwise/<br/>driver app]
        OPS[web/<br/>ops dashboard]
    end
    inputs --> API
    API <--> SIM
    API --> LP --> API
    API --> OCPP --> CP[(Charge points)]
    CP -. MeterValues .-> OCPP
    API --> DB
    API -- REST + /ws --> WW
    API -- REST + /ws --> OPS
    WW -- POST /sessions, /boost --> API
    OPS -- POST /demo/* --> API
```

| File | Role |
|---|---|
| `noonshift/scheduler.py` | `solve()` — the LP. `impact()` — receipt arithmetic. `price()` — tier lookup. Module constants at the top with their units and reasons. |
| `noonshift/api.py` | FastAPI app; the global state dict `S`; `step()` once per sim-minute; `resolve()` builds inputs, solves, pushes limits, broadcasts; `pick_mode()` is the fail-safe ladder; `/demo/*` scenario triggers. |
| `noonshift/sim.py` | `Sim` plays the day one minute at a time; `Connector` draws `min(limit, taper)`; `load_sessions()` reads `data/sessions.json`. |
| `noonshift/ocpp_gateway.py` | The CSMS side (`OcppConnector.set_limit` → `SetChargingProfile`) plus a fake charge point for the self-check. Enabled with `OCPP=1`. |
| `noonshift/models.py` | Pydantic bodies for REST and the three WebSocket frames — the contract with both front-ends. Regenerated into `docs/openapi.json` and `docs/ws-frames.json` on start. |
| `noonshift/db.py` | asyncpg writes for plans, sessions, meters; no-ops when `DATABASE_URL` is unset. |

---

## 2. The five-minute control loop

```mermaid
sequenceDiagram
    autonumber
    participant Clock as control_loop()<br/>every 60/SPEED s
    participant Sim as Sim
    participant API as api.step()
    participant LP as scheduler.solve()
    participant CP as Connectors / chargers
    participant WS as /ws clients

    Clock->>API: step()
    API->>Sim: tick(1 min) → events (plug_in, unplug, done)
    API->>API: meter_history() records each car's kW, finalises receipts
    alt event, or minute % 5 == 0
        API->>API: resolve() with mode = pick_mode(now)
        API->>LP: solve(cars, site, signal, tariff, now)
        API->>LP: solve(cars with departure=now) — the charge-now baseline
        LP-->>API: {connector: [kW × 288]}, baseline
        API->>API: receipt = metered so far + plan ahead, vs baseline frozen at plug-in
        API->>CP: set_limit(kW for this slot)
        API-->>WS: PlanMsg
    else
        API->>CP: apply_limits() with this slot's kW from the current plan
    end
    API-->>WS: MeterMsg (site kW, per-connector kW, kWh, status)
    API->>API: db.save_meters()
```

Two solves per cycle: the plan, and a **baseline** where every deadline is "now" (all cars ASAP). The receipt is the difference, and the baseline is **frozen at plug-in** per session — otherwise a rolling re-solve would shrink every receipt to zero by the time the driver unplugs.

---

## 3. The scheduler (LP)

Variables: `p[i,t]` = kW for car *i* in 5-min slot *t* (288 slots), `s[i]` = shortfall kWh, `over` = site kW above the tariff block, `z` = worst shortfall fraction.

```
minimise  Σ p·SLOT_H·(price[t] + W_CARBON·moer[t]/1000)  +  M_SHORT·s[i]  +  overage·over  +  M_SHORT·mean(e_rem)·z
```

| # | Constraint | Why |
|---|---|---|
| 1 | **Energy by deadline** — `Σ_{t<d} p·SLOT_H + s[i] ≥ e_rem[i]` | Elastic: the LP is never infeasible; a shortfall is explicit, priced at `M_SHORT`, and reported |
| 2 | **Progress floor** — at every 30-min checkpoint *since arrival*, delivered + planned ≥ `ALPHA` × pro-rata | Early leavers are never stranded; anchored to arrival so a rolling re-solve cannot defer it forever |
| 3 | **Sprint buffer** — last 30 min before the deadline carry a `BUFFER_COST` surcharge | A feasible car finishes early; the buffer is spent only by cars that would otherwise fall short, or after a bad forecast |
| 4 | **Charger cap** — `0 ≤ p ≤ p_max_kw` (reduced above 80 % SoC by the taper model) | Hardware limit; the taper tail is reserved so the slow last 20 % does not spill past the deadline |
| 5 | **Site limit** — `Σ_i p[i,t] ≤ feed_kw − building_load[t]` | Never exceed the feed |
| — | **Block** — `Σ_i p[i,t] − over ≤ block_kw` | Tariff demand block; overage priced at `block_price × multiplier / 30` per day |
| — | **Cap** — `Σ p·SLOT_H ≤ e_rem` | Never plan more than the car can take |
| — | **Fairness** — `s[i]/e_rem[i] ≤ z` | Minimising the worst fraction spreads shortfall across cars instead of starving one |

Post-step: any allocation in `(0, MIN_KW)` rounds **up** to 1.4 kW (6 A, IEC 61851 — some EVs never resume after a pause); if that pushes a slot over the cap, the cars with the most slack give way first. Results round *down* to the milliwatt, never over a limit.

Size: ~11,500 variables for 40 cars; HiGHS solves in 40–60 ms on the pinned scipy 1.14 (`tests/test_perf.py` guards it).

ASAP cars (deadline passed, or Boost): slot cost is just an earliest-first tie-break, so they charge now. When *every* car is ASAP (the baseline call) the block-overage term is dropped — charge-immediately means exactly that.

```mermaid
gantt
    title What the plan looks like for three cars (illustrative)
    dateFormat HH:mm
    axisFormat %H:%M
    section MOER
    gas ≈ 450 g/kWh     :crit,   m1, 07:00, 09:30
    solar ≈ 0 g/kWh     :active, m2, 09:30, 14:30
    mixed               :        m3, 14:30, 17:30
    section Car A (leave 17:30, 12 kWh)
    floor 1.4 kW        :        a1, 08:30, 09:30
    full 7 kW           :active, a2, 09:30, 11:00
    section Car B (leave 12:00, 15 kWh, boost 10:40)
    plan 7 kW           :active, b1, 09:30, 10:40
    boost 7 kW          :crit,   b2, 10:40, 11:45
    section Car C (leave 10:00, 5 kWh)
    ASAP 7 kW           :crit,   c1, 08:45, 09:30
```

---

## 4. The fail-safe ladder

```mermaid
stateDiagram-v2
    [*] --> live
    live --> cached : signal API down
    cached --> tariff : cache older than 6 h
    tariff --> deadline : tariff table unavailable
    deadline --> full : solver unavailable
    full --> live : everything back
    cached --> live : signal back
    tariff --> live : signal back
    note right of live : marginal CO₂ + tariff + deadlines
    note right of cached : same, last forecast ≤ 6 h old
    note right of tariff : tariff + deadlines, no carbon
    note right of deadline : earliest-deadline-first only
    note right of full : every connector holds its static safe share (no solve)
```

`pick_mode()` in `api.py` walks the rungs top-down and returns the first healthy one; `resolve()` shapes the LP inputs to match (tariff-only ⇒ empty `moer`; deadline-only ⇒ also empty `price_per_kwh`; full ⇒ no solve). The demo button `POST /demo/signal_outage` flips the rungs.

**The last rung is inspector-grade.** `full` no longer means "every connector at `p_max`" (40 deferred cars would have been a 280 kW spike on a 100 kW block). It is the static **safe share** `min(p_max, (feed − max building load) / n)` — 1.833 kW per bay on the demo site — which is also the OCPP stack-0 profile that lives on each charger underneath the dynamic plan (§5), so chargers revert to it on their own when the backend disappears. `sim.safe_share_kw()`, `tests/test_day.py::test_when_the_control_loop_dies_the_site_falls_back_to_the_static_share`, [`solutions.md`](solutions.md) §5.

---

## 5. OCPP

```mermaid
sequenceDiagram
    participant CP as Charge point<br/>(OCPP 1.6J)
    participant GW as ocpp_gateway.py<br/>(CSMS)
    participant API as api.py
    CP->>GW: BootNotification
    GW-->>CP: Accepted
    GW->>CP: SetChargingProfile (stack 0, static safe share, no expiry)
    CP->>GW: StartTransaction (idTag, meterStart)
    GW->>API: session on connector
    loop every 5 min / on event, re-sent at least every 10 min
        API->>GW: set_limit(kW)
        GW->>CP: SetChargingProfile (stack 1, plan kW, validTo = now + 15 min)
        CP-->>GW: Accepted
    end
    CP->>GW: MeterValues (kW, kWh)
    GW->>API: metered draw
    CP->>GW: StopTransaction (meterStop)
    GW->>API: unplug → receipt
```

`OcppConnector` replaces the simulator's `Connector` when `OCPP=1`; `set_limit` only takes effect once the charge point accepts the profile (`python -m noonshift.ocpp_gateway` runs the round-trip self-check against a fake charge point: static after boot, dynamic with `validTo`, revert to the safe share on expiry). Two profiles per connector: stack 0 is the static safe share with no expiry; stack 1 is the plan limit, valid 15 minutes and refreshed every 10, so a silent backend means the charger falls back to the share by itself. Hardware max current is configured on the charger itself; a profile can only lower it. Never `await self.call()` inside an `@after` handler — it deadlocks the message loop; schedule it as a task.

Not yet done: authentication on the websocket (OCPP security profile 1), a real charger. See [`SECURITY.md`](../SECURITY.md) and [`solutions.md`](solutions.md) §5, §13.

---

## 6. Data

```mermaid
flowchart LR
    WT[WattTime API<br/>CAISO_NORTH co2_moer<br/>lbs/MWh → ×0.4536 g/kWh] -->|scripts/fetch_data.py signal| SJ[data/signal.json<br/>kind: marginal]
    CA[CAISO fuel-mix CSV<br/>no auth] -->|fetch_data.py caiso| SJ2[data/signal.json<br/>kind: average — labelled]
    ACN[ACN-Data API<br/>Caltech sessions 2018–2021] -->|fetch_data.py sessions --day| SS[data/sessions.json<br/>kwh_needed = kWhDelivered]
    SJ --> PROVE[scripts/prove.py]
    SS --> PROVE
    PROVE --> T[results table + PASS/FAIL gate]
```

Rules baked into the scripts: signal and sessions come from the same grid; `kwh_needed` is what the car actually took (ACN's `kWhRequested` is a median 1.47× too high); an `average` signal is labelled as such all the way to the receipt.

**Perfect-foresight caveat:** today `prove.py` and `resolve()` plan on the realised signal. A product plans on the morning forecast and is scored on the actual. The change — fetch the forecast as published, plan on it, score on actual — is [`solutions.md`](solutions.md) §6.

---

## 7. Contracts

- REST bodies and WS frames: `noonshift/models.py` → `docs/openapi.json`, `docs/ws-frames.json` (regenerated on start; CI fails if a diff is uncommitted). Every change since the first release has been **additive**: new optional fields, new endpoints, never a renamed or removed field.
- Scheduler: `solve(cars, site, signal, tariff, now) → {connector_id: [kW × 288]}`, `impact(plan, baseline, signal, tariff, *, health=False)`, `price(slack_hours, *, r, saving_usd, kwh, alpha, urgent)` — positional signatures frozen; extras are keyword-only. Per-car optional keys: `floor_alpha`, `priority`, `boost`.
- REST (additive since WP1): `POST /sessions` accepts `vehicle{model, battery_kwh, max_kw}`, `soc_now`, `target_soc`; `POST /sessions/{id}/urgency {level, leave_at?}` (`/boost` = `now`); `SessionOut` carries `urgency`, `kwh_needed`, `need_confidence`, `max_kw`; `StatusOut` carries `safe_share_kw`, `waiting`, `connectors_asap`, `contracted_peak_kw`, `package`, `employee_rate_usd_per_kwh`, `driver_share`, `noonshift_share`, `signal_kind/source`, `tariff_name`, `ladder`; `ImpactOut` carries `renewable_share`, `health_usd`; `GET /sites/{id}/impact.csv` is the hourly ledger; `POST /assist` / `GET /assist/suggestions` (§9).
- WS frames: `PlanMsg` (per-connector kW plan, site kW, mode, reason), `MeterMsg` (per-connector live kW, kWh, status, `urgency`, `idle_min`, `need_confidence`, `p_max_kw`, `cap_observed`, `asap`, `move_by`; site `waiting`), `EventMsg` (plug_in, unplug, done, boost, urgency, cap_observed, move_by, day_reset, …).
- Auth: `OPS_TOKEN` bearer on `/assist*` and `/demo/*` when set; driver and read endpoints are open.

---

## 8. Tests

| File | What it pins down |
|---|---|
| `tests/test_scheduler.py` | each LP rule, the 6 A floor, the trim, ASAP semantics, HiGHS "Unknown" guard |
| `tests/test_impact.py` | energy-matched receipt arithmetic, average-signal labelling |
| `tests/test_perf.py` | 40- and 60-car solves under a second; trips if the scipy pin is lifted |
| `tests/test_day.py` | a full simulated day through `api.step()` plus the four demo scenarios, on a frozen fixture day |
| `scripts/smoke.py` | driver REST → `/ws` → ops, against a live server (CI) |
| `scripts/prove.py` | the headline number, gated |
| `tests/test_assist.py` | the assistant: snapshot cap and keys, every starter answered offline, the parser, the per-IP limit, cache reuse (skipped without a key) |

---

## 9. Operator assistant

A facilities manager types a question in the ops dashboard; the answer is grounded in **today's live state** and a **static knowledge file**, and it never acts — each answer ends with up to two *label → page* buttons the operator clicks.

```mermaid
sequenceDiagram
    participant UI as AssistDrawer
    participant API as POST /assist
    participant Snap as assist.snapshot()
    participant M as claude-opus-5
    UI->>API: question, last 6 turns, page
    API->>Snap: build from S (≤ 15 connector rows, events, signal, tariff)
    API->>M: system = [rules, knowledge] (cached) · user = <site_state> + question
    M-->>API: answer · label -> /ops/page · [sources: …]
    API-->>UI: {answer, sources, suggested_actions} — or the template fallback when there is no key
```

- **Snapshot** (`noonshift/assist.py: snapshot()`): built from the same REST builders the dashboard uses, so the numbers agree; the 15 most relevant connectors (at risk → urgent → charging → done → by slack) plus counts; capped at ~6 k tokens.
- **Knowledge** (`noonshift/assist_knowledge.md`): hand-condensed from this file, the README, business §0b/§4b/§7b, metrics §2/§3/§6 and the hard questions. Nothing time-varying lives in it, so the two system blocks stay prompt-cache hits.
- **Model call**: `claude-opus-5`, adaptive thinking, low effort, 1024 output tokens. Errors most-specific first: bad or missing key → fallback; rate limit → 429 with `Retry-After`; connection or 5xx → fallback flagged `degraded`.
- **Fallback** (`fallback()`): keyword-routed templates filled from the snapshot (a bay by id, at-risk sessions, the ladder walk, safe share, CO₂ → km, urgency bands, queue and move-by, money per §7b, load vs block/feed, the clean window). The demo needs neither a key nor the internet; the UI labels these "offline answer".
- **Limits**: 10 questions per minute per client IP; `OPS_TOKEN` bearer when set.
