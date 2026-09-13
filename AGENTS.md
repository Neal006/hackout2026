# AGENTS.md — Project Memory (auto-maintained)
Last updated: 2026-09-13 | Sessions logged: 6

## Identity
Hackathon entry: "Noonshift" — a CPO-side, deadline-based EV charging scheduler that shifts flexible charging into low-marginal-carbon hours at daytime long-dwell sites (workplace/destination/depot). Four-person team, lanes in `team-plan.md`.

## Stack & Commands
- Python 3.12/3.13 · FastAPI · scipy 1.14 (HiGHS LP) · mobilityhouse/ocpp · asyncpg/Postgres (optional) · Docker Compose. Two Vite front-ends: `web/` (ops dashboard, React+JSX+Tailwind 3, :5173) and `wattwise/` (driver app, React+TS+Tailwind 4, :5174); `npm install && npm run dev` in each, both proxy `/api` and `/ws` to :8000. `npm run build` in each, then `docker compose up` serves them on :3000 / :3001.
- `python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt`
- `python -m pytest` (70 tests, ~90 s) · `python scripts/prove.py` (slide 1) · `python -m noonshift.test_loop` · `docker compose up -d --build`
- Data: `python -m noonshift.seed gen` (placeholders) · `python scripts/fetch_data.py signal|caiso|sessions --day ...` (real).

## Current State & Focus
- Tirth's lane on main: api.py (7 endpoints, /ws, ladder, /demo/*), sim.py (1-min clock, taper), ocpp_gateway.py, db.py, seed.py, docker, hosting.
- Neal's lane merged (PRs #2-#4): real `scheduler.py`, impact/price, receipt fix in api.py, 53 tests, prove.py, fetch_data.py. `data/` is real on both sides: WattTime MOER 2026-04-14 + 36 ACN Caltech sessions (2019-04-09 re-dated). prove.py: CO2 -69.3%, $ -3.3%, peak -1.0%, 0 fallbacks; July -64.5%, January -1.8%.
- Both front-ends are wired to the backend (branch `feat/e2e-flow`, PR #7, merges Nandini): driver plug-in/Boost in WattWise shows up live on the ops Gantt/Sessions/Alerts; ops demo buttons hit `/demo/*`; fail-safe banner from `status.mode`; price tiers previewed at the ready-by choice (`GET /price`); "peak avoided (est.)" from `ImpactOut.peak_kw/baseline_peak_kw`. `scripts/smoke.py` = browser-free clean-machine gate (prints SMOKE OK); `scripts/dev.ps1` starts all three. Pitch material in `pitch/` (deck, 4-min demo script, hard questions), all sourced from the proposal + prove.py.
- team-plan.md audit, not done and why: "last 5 visits" line (no driver identity in the backend, sessions are per connector); 400 px mobile check and backup video (need a browser); cost-savings slide numbers ($20k vs $13k, 28 %/9 %) are in the plan but nowhere in the proposal → left as a TODO in `pitch/deck.md`, do not quote; competitor table re-verification (needs web); Docker run (no Docker on this machine). WattWise narrative copy (ChargeView/ChargingTimeline/SmartExplanationCard/ProfileView/OptimalWindowBanner) still tells the home-overnight story with fixed strings; numbers are live, prose isn't.
- Next: pitch rehearsal. Slide must say "2019 sessions, 2026 grid signal" and quote the CO2 range.

## Architecture
Signals (WattTime MOER; CAISO fuel-mix fallback) + tariff table + sessions (deadline, kWh) + site meters
→ `scheduler.solve()` (elastic LP, 5-min slots; api re-solves every 5 sim-min + on event) → per-connector kW limits (direct or OCPP SetChargingProfile)
→ `api.step()` per sim-minute: sim draws min(limit, taper), `meter_history()` records kW, receipts = metered vs baseline frozen at plug-in
→ WebSocket frames (plan/meter/event) → driver PWA + ops dashboard. Ladder: live → cached → tariff-only → deadline-only → full power. Hardware limits stay on the charger.

## File Map
- `noonshift/scheduler.py` — `solve(cars, site, signal, tariff, now)`, `solve_lp()` (+info), `impact()`, `impact_detail()`, `price(slack, *, r, saving_usd, kwh, alpha, urgent)` (§7b: R − α·S/E, ≤ R), `tier_of()`; per-car optional `floor_alpha`, `priority`; constants W_CARBON, ALPHA, FLOOR_EVERY, FIRST_HOUR_KWH (3.5), SPRINT_SLOTS, BUFFER_COST, M_SHORT, M_FLOOR, ASAP_EPS, E_MIN, MIN_KW. Slot 0 carries only its remaining minutes (`dur[0]`); floor checkpoints are times since arrival, pro rata in the slot containing the mark.
- `noonshift/api.py` — FastAPI app, state dict `S`, `resolve()`, `step()`, `session_impact()`, `meter_history()`, ladder `pick_mode()`, `/demo/*`; `POST /sessions/{id}/urgency {level: now|soon|priority, leave_at?}` (`/boost` = alias of `now`; `URGENCY_MIN` 15 min; `PRIORITY` = floor 0.9 / weight 2.0); `site_rate()` = `site.json: employee_rate_usd_per_kwh` (0 = free); `session_price()`; `car_kw(c)` = min(bay, `session.max_kw`); `need_estimate()` (bay history median → site median); `observe_caps()` (5 min under 80 % of limit → `max_kw` = metered × 1.05, event `cap_observed`); `move_by()` (waiting cars → slackest plugged cars get deadline = now + e_rem/p_max, one per waiting car); `site.json: connectors_asap` bays are always `boost`.
- `noonshift/sim.py` — `Sim`, `Connector(id, p_max_kw, safe_kw)` (taper from 80% SoC; plug-in starts on `safe_kw`; a `set_limit` expires after `DYN_VALID_MIN`=15 min back to `safe_kw`), `load_sessions()`, `safe_share_kw(site)` = min(p_max, (feed − max building)/n) = 1.833 kW on site-1. `Sim.waiting` (arrivals with no bay; plugged FIFO as bays free); a `done` car with `idle_since` ≥ `MOVE_AFTER_MIN`=10 is unplugged when someone waits (A5); `session.car_kw` = the car's physical limit (sim only; `max_kw` is the planner's belief).
- `noonshift/models.py` — pydantic REST bodies + WS frames (contract with front-end). `SessionIn` optional `vehicle{model,battery_kwh,max_kw}`, `soc_now`, `target_soc`; `SessionOut` +`kwh_needed`, `need_confidence`, `max_kw`, `urgency`; `ConnectorMeter` +`idle_min`, `need_confidence`, `p_max_kw`, `cap_observed`, `asap`, `move_by`, `urgency`; `MeterMsg.waiting`; `StatusOut` +`safe_share_kw`, `waiting`, `connectors_asap`; `EventMsg.name` +`urgency|done|cap_observed|move_by`. All additive.
- `web/src/context/GlobalStateContext.jsx` — ops app state: opens `/ws`, polls `/sites/site-1/impact|status`, derives the page shape (siteDetail/connectors Gantt on a 06–22 axis, sessions, alerts from events, chargersList); `triggerEvent()` maps demo buttons → `/demo/*`, prioritize → `/sessions/{id}/boost`.
- `.docs/ROADMAP.md` — plain-language plan (§0 status, §1 driver inputs, §3 emergency rules, §4 price flip, §5 evidence runs, §7 CI, §8 order). `.github/workflows/ci.yml` — backend job + web/wattwise matrix.
- `wattwise/src/api/noonshift.ts` — driver app client + hand-copied types; `connectWs()`, `onSimDay()` (ready-by is built on the **sim** day and must be > sim now).
- `wattwise/src/context/WattwiseContext.tsx` — driver state: `POST /sessions` on the highest free connector (replayed sessions use c01–c36), `/live` polled every 2 s for the receipt, meter/plan frames for kW/kWh/window; unplug/day_reset moves the session to History.
- `noonshift/ocpp_gateway.py` — two profiles per connector: static share at stack 0 (sent as a task after BootNotification, no expiry) + dynamic plan at stack 1 with `valid_to` = now + 15 min, refreshed every 10 sim-min; `Charger.profiles`, `Charger.apply(now)`; self-check `python -m noonshift.ocpp_gateway`. Never `await self.call()` inside an `@after` handler (deadlocks the message loop). `db.py`, `seed.py`, `test_loop.py` — Tirth's.
- `scripts/prove.py` — real-loop replays: charge-now vs Noonshift (+ `--policy timer` = dumb 09–14 timer; `--block/--feed` overrides; `--forecast <file>` plans on it and scores on data/signal.json); prints clean-hour share, block overage $, kWh short, stated-vs-actual departures; gate exit code. Timer delta on the real day: CO2 −56 %, bill −28.5 %, peak −28 %. At feed 80/block 50: CO2 −23 % but bill +7 % (deferred energy lands in the 16–21 h price peak).
- `scripts/fit.py <sessions.json|csv>` — pre-sales site fit: `cash tiers | perks only | not a fit` from stated-slack median, tariff spread, demand charge, `--saving-rate` (measured). Caltech: perks only (slack median 3.8 h, 4/15/17).
- `scripts/replay_days.py --days a,b,c` — min/median/max over `data/days/<date>.json` signals; names missing days instead of inventing them.
- `scripts/smoke.py` — e2e without a browser: driver REST (`/price`, `/sessions`, `/boost`, `/live`) + `/ws` as the ops app sees it + all four `/demo/*` + ladder drop/restore; plugs 2 extra cars before the demo beats so early-unplug/boost always have a target.
- `.docs/pitch/` — `deck.md` (slide list, all sourced), `demo-script.md` (4 min, 7 beats, what the audience sees per beat, failure modes), `hard-questions.md` (answers tied to code + tests).
- `scripts/fetch_data.py` — WattTime / ACN-Data / CAISO fallback → `data/*.json`; `signal --forecast` → `data/signal_forecast.json` via `/v3/forecast/historical` (untested: no WattTime creds on this machine); `signal` also stores `health_damage` ($/MWh) when the plan serves it → `impact(..., health=True)["health_usd"]`.
- `tests/test_scheduler.py`, `test_impact.py`, `test_perf.py`, `test_day.py` (full day + demo scenarios), `tests/fixtures/baseline_1405.json`.
- `.docs/neal-plan.md` — Neal's lane: status vs gates, LP deviations and why, edge-case→test matrix, open items.
- `.docs/team-plan.md`, `.docs/noonshift-proposal.md`, `ev-green-charging-ideation.html` — plan and evidence base.

## Conventions
- Every factual claim in docs must cite a reference that was actually opened; mark secondary/abstract-only sources.
- Say "we found no product doing X", never "none exists". Impact numbers are labelled estimates, never certificates.
- Grid signal and session data must be from the same grid (CA sessions ↔ CAISO signals); `signal.kind` "average" must be labelled as such.
- Scheduler contract is dict-based and frozen; add keyword-only extras or new functions, never change the three signatures.
- Every regression found by the day replay gets a unit test that fails on the old code before the fix.

## Dependencies & Gotchas
- **scipy must stay 1.14.x**: 1.15.2's HiGHS bindings took 66 s for any ~11k-column LP on Windows (HiGHS itself 0.01 s); 1.14.1 = 38 ms. `tests/test_perf.py` trips if the pin is lifted.
- HiGHS returns "Unknown" (status 4) when the objective is only 1e-7 tie-breaks (all-ASAP baseline of nearly-full cars). Keep ASAP_EPS = 1e-3; `solve()` falls open to full power and logs ERROR if it ever happens.
- Progress floor must be anchored to arrival, not `now`: a rolling re-solve otherwise defers it forever under a falling MOER.
- Peak-based block overage in the LP means once one slot exceeds the block, exceeding everywhere is free; the post-step trim caps rounding at the block.
- WattTime Basic (free): CAISO_NORTH only (co2_moer + health_damage); 2+ yrs history; 72 h forecast. MOER is lbs/MWh → ×0.4536 = g/kWh. Registration is `POST /register`, then a Keycloak email link that needs a **second click** ("Click here to proceed") in the same cookie session before `/login` stops returning 403. Account `neal_noonshift`, creds in `~/noonshift-credentials.json` (outside the repo). Electricity Maps free: 1 zone, 50 req/h, no forecast. NESO (GB): free, no auth.
- Real CAISO_NORTH MOER is 0 g/kWh for hours on solar days (marginal plant is renewable), flat ~450 on winter gas days: CO2 savings ~65-70% on solar days, ~0 on gas days. On the real Caltech day $ and peak savings are only 2-3% / 1-2% (arrivals already inside super-off-peak, peak 101 kW on a 100 kW block); the seeded placeholder's -20% / -9% came from bunched arrivals, do not quote it.
- Same-day pair exists via the CAISO fallback (WattTime Basic has no 2019 history): 2019-04-09 sessions x 2019-04-09 CAISO average = CO2 -54.2%, $ -2.9%, gate PASS. Use it for the "you mixed years" question; not in `data/` because it is average intensity.
- ACN-Data: Caltech sessions 2018-04-25..2021-09-14 (31,424); API token appears on the portal page right after login (not by email); `kWhRequested` is a median 1.47x what the car took, so `kwh_needed` = kWhDelivered. Account `neal_noonshift`, token in `~/noonshift-credentials.json`.
- Battery taper: the sim draws p_max*(1-SoC)/0.2 above 80% SoC; the LP bounds tapering cars by that and reserves time for the slow last 20% (TAPER_* constants), else flat-signal days leave cars 0.2 kWh short.
- CAISO fuel mix CSV: `https://www.caiso.com/outlook/history/YYYYMMDD/fuelsource.csv`, no auth, 5-min local time; 2026-04-14 midday average is ~14 g/kWh.
- Windows Python has no tz database: `tzdata` (in requirements-dev) for `fetch_data.py`.
- PG&E BEV rate: super-off-peak 09–14, peak 16–21, subscription kW blocks; overage in `impact()` is block_price × multiplier / 30 per day.
- EVs can't charge below 6 A (IEC 61851); MIN_KW = 1.4; never pause a car, round up.
- Martin/Powell/Rajagopal (Nat. Comms Dec 2025): broadcast MEF/AEF signals can raise emissions at scale; no broadcast here.
- Nature.com blocks automated fetch → PMC/OSTI/RePEc mirrors. MDPI Energies 403. Mermaid: validate with `mermaid@11` + jsdom.
- Open limitation: 1 charger per car for the whole dwell; cars > chargers → deadline becomes 'move-by' time (proposal §9.5).

## Decisions Log
- 2026-09-13 — Emergency = three bands (now/soon/priority), every band pays exactly R; first-hour floor min(need, 3.5 kWh) costs 4.8 pts of CO2 saving on the real day (69.4 → 64.6 %), kept — it is the trust promise (business.md §4).
- 2026-09-13 — First-hour floor beats the signal and the tariff block but never the feed (M_FLOOR 1.0 > block overage 0.83 $/kW-day); a 40-car mass arrival bursts the block, staggered real arrivals do not.
- 2026-09-11 — Wedge = daytime workplace/destination sites, payer = site owner.
- 2026-09-11 — One plug-in question + one Boost toggle; no pricing lanes.
- 2026-09-11 — Elastic LP with progress floor; anti-herding = no broadcast; demo grid = California.
- 2026-09-12 — Baseline = same `solve()` with every departure = now (charge-now FCFS under the feed, no overage term); prove.py replays the day under both policies rather than overlaying frozen per-car baselines (those ignored the feed).
- 2026-09-12 — Receipt = metered history vs baseline frozen at plug-in, energy-matched; no signal ⇒ no CO2 claim.
- 2026-09-12 — Fairness = min-max shortfall fraction; floor anchored to arrival with its own slack; sprint buffer = surcharge; 30-min floor checkpoints.
- 2026-09-12 — W_CARBON stays 0.05 $/kg: on the real April MOER, W=0 is carbon-blind (-1.2% with real sessions, +16.7% emissions with the seeded ones); every W in 0.02..0.5 gives the full saving at identical $ and peak.
- 2026-09-12 — Session data = ACN 2019-04-09 re-dated onto the 2026 signal day; kwh_needed = delivered energy, stated departure = the driver's own input (early leavers kept).

## Changelog
2026-09-13 | WP4 evidence scripts | scripts/prove.py, fetch_data.py, fit.py, replay_days.py, scheduler.impact(health=) | timer baseline is the judge's number (−56 % CO2 over a dumb timer); constrained site shows the carbon-vs-tariff conflict honestly; forecast flag wired, unverified without creds
2026-09-13 | WP3 cars, needs, queues | models.py, sim.py, api.py, data/site.json, tests/test_day.py, scripts/smoke.py | vehicle form → per-car cap + kWh from SoC; observation guard believes the meter; connectors_asap c41/c42; done event + idle_min; Sim.waiting + move-by tightening; a notified done car moves within 10 min when someone waits
2026-09-13 | WP2 fail-safe an inspector accepts: static share under everything | sim.py, api.py, scheduler.py, ocpp_gateway.py, models.py, data/site.json, tests/test_day.py | `full` rung, `apply_limits` fallback and the linprog fallback all return `safe_share_kw`; kill-the-loop test: 6 h with no step() never exceeds headroom and after 15 min never exceeds n × share; `StatusOut.safe_share_kw`
2026-09-13 | WP1 pricing + emergency + first-hour floor | scheduler.py, api.py, models.py, data/site.json, tests/, scripts/smoke.py, .docs/implementation-plan.md | price() = §7b shared savings (never above R); urgency endpoint; slot-0 remaining-duration + time-anchored checkpoints fixed a lost-energy bug that the 3.5 kWh promise exposed
2026-09-13 | Open-source docs pass: README rewrite (Mermaid, quick start, results, OCPP 1.6J badge), LICENSE/CONTRIBUTING/CODE_OF_CONDUCT/SECURITY/CHANGELOG, issue+PR templates, .docs/ARCHITECTURE.md (6 validated diagrams), .docs/README.md index; all human docs moved to .docs/; business.md (break points, §4b emergency scale at R, §7b shared-savings formula), metrics.md, solutions.md (real-world fixes → code; drivers under-state stay 29/36; prove.py plans with perfect foresight) | README.md, .docs/, LICENSE, CONTRIBUTING.md, SECURITY.md, CHANGELOG.md, .github/ | All Mermaid blocks validated with mermaid@11 + jsdom; ROADMAP emergency pricing reconciled to "R, no quota".
2026-09-13 | ROADMAP.md (layman plan: driver inputs, emergency, incentives, Tier 0/1, order of work) + GitHub Actions CI | ROADMAP.md, .github/workflows/ci.yml, wattwise/src/context/WattwiseContext.tsx, web/src/pages/ImpactView.jsx | CI = pytest + prove gate + smoke against live uvicorn + contract-diff + lint/build both apps; lint fixes only (refs not read during render, Card hoisted)
2026-09-13 | team-plan.md integration pass: price preview, peak-avoided, fail-safe banner, smoke gate, pitch/ | api.py, models.py, web/, wattwise/, scripts/smoke.py, scripts/dev.ps1, pitch/, README | Baseline peak = sum of frozen per-session baselines clipped at the feed (label "est."); cost-savings slide left TODO for lack of a source
2026-09-13 | Wire WattWise (driver) + Nandini ops dashboard to the backend; merge Nandini | web/src/{context,pages,components}, wattwise/src/{api,context,components,utils}, api.py, models.py, docker-compose.yml, web/nginx.conf | No WS frame changes, one additive endpoint; keep side effects out of React state updaters (StrictMode runs them twice)
2026-09-12 | Same-day 2019 check | neal-plan.md, AGENTS.md | 2019 sessions x 2019 CAISO average: CO2 -54.2%; story holds without mixing years
2026-09-12 | Real ACN sessions + accounts | data/sessions.json, scripts/fetch_data.py, neal-plan.md | kwh_needed = delivered not requested; early leavers kept; CO2 -69% / $ -3% on the real day
2026-09-12 | Real WattTime MOER + taper-aware tail | data/signal.json, noonshift/scheduler.py, tests/, neal-plan.md | Winter flat-signal day exposed taper gap; 3-day range recorded; W_CARBON kept 0.05
2026-09-12 | Neal's lane: scheduler, impact, prove, fetch, tests | noonshift/scheduler.py, api.py, scripts/, tests/, neal-plan.md, README | 4 defects found by the day replay fixed with failing-first tests; scipy pinned 1.14
2026-09-12 | Tirth's lane: api, sim, OCPP, docker, hosting | noonshift/*, data/, docker-compose.yml, render.yaml | Stubs with frozen signatures; ladder shapes inputs not calls
2026-09-12 | Narrative md proposal with diagrams + case studies | noonshift-proposal.md | Real deployments as case studies
2026-09-11 | Ideation doc + council pressure test | ev-green-charging-ideation.html | Site-owner-paid deadline scheduler; lanes dropped; LP made elastic

## Archived Summary
(none yet)
