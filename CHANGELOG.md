# Changelog

All notable changes to this project. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); there are no version tags yet — entries are grouped by day and pull request.

## [Unreleased]

### Added
- **WP1 — pricing + emergency.** `scheduler.price()` is the shared-savings formula (business §7b): `R − α·S/E`, never above `R`, `R` from `site.json` (0 = free). `POST /sessions/{id}/urgency {level: now|soon|priority, leave_at?}` — three bands, one price (§4b); `/boost` is an alias of `now`. First-hour floor `min(need, 3.5 kWh)` and 30-min progress floors anchored to arrival; per-car `floor_alpha` / `priority`.
- **WP2 — inspector-grade fail-safe.** The `full` rung and the OCPP stack-0 profile are the static safe share `min(p_max, (feed − max building)/n)` = 1.833 kW on the demo site; the dynamic stack-1 profile expires after 15 min. Nothing the backend can do exceeds the feed.
- **WP3 — cars, needs, queues.** Vehicle form (`vehicle`, `soc_now`, `target_soc`), need estimate from bay history → site median with `need_confidence`, observation guard (`cap_observed`), always-ASAP fleet bays (`connectors_asap`), `done` events, a waiting queue with move-by times.
- **WP4 — evidence scripts.** `prove.py --policy timer | --block | --feed | --forecast`, `fit.py` (site fit verdict), `replay_days.py`, WattTime forecast + health-damage fetch (unverified without credentials), `impact(..., health=True)`.
- **WP5 — facilities-manager dashboard.** CO₂ first, every number a live field, `UrgencyControl`, fail-safe banner in plain words, hourly ledger export `GET /sites/{id}/impact.csv`, `StatusOut`/`ImpactOut` site-card fields.
- **WP6 — operator assistant.** `POST /assist`, `GET /assist/suggestions`, `noonshift/assist.py` + `assist_knowledge.md`, chat drawer in the ops app; deterministic fallback without a key; `OPS_TOKEN` bearer on operator endpoints.
- `.docs/implementation-plan.md` — the refined plan for WP1–WP7 with every assumption and deviation.
- Open-source scaffolding: `LICENSE` (MIT), `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, issue and PR templates, this changelog.
- `.docs/ARCHITECTURE.md` — control loop, LP constraints, fail-safe ladder and OCPP flow, with Mermaid diagrams.
- `.docs/business.md` — scoped to the corporate-building customer (§0b: who pays, value stack; §9b: the deal, employee incentives when charging is free); break points, edge cases where the scheduler is worse than a dumb charger, the shared-savings pricing formula (§7b), the emergency scale (§4b), 4-tier benefits.
- `.docs/metrics.md` — every reported metric with its formula; money metrics derived from the shared-savings formula.
- `.docs/solutions.md` — real-world fixes for every open problem, mapped to code locations; two findings from the data (drivers under-state their stay; `prove.py` plans with perfect foresight).

### Fixed
- `site_peaks()` / `hourly_ledger()` dropped the start-minute offset of mid-slot plug-ins and could report a slot peak above the feed that never happened.

### Changed
- README API block lists every endpoint; ARCHITECTURE §7 contracts and new §9 (operator assistant).
- README rewritten for an open-source audience; OCPP badge corrected to 1.6J (the gateway implements 1.6J only).
- All human-written documentation moved from the repo root to `.docs/` (`README.md` and `AGENTS.md` stay at root).
- `ROADMAP.md`: emergency pricing reconciled with the team decision — every emergency band is priced at today's rate, no free quota.

## 2026-09-13 — PR #8 (roadmap + CI)
### Added
- `ROADMAP.md`: plain-language plan — driver inputs, emergency model, incentives, Tier 0/1 evidence, order of work.
- GitHub Actions CI: pytest, `prove.py` gate, end-to-end smoke against a live server, contract-file check, lint + build for both front-ends.

## 2026-09-13 — PR #7 (front-ends wired end to end)
### Added
- WattWise driver app (`wattwise/`, React + TypeScript) and ops dashboard (`web/`, React) wired to the backend: plug-in → plan window → live kW → receipt; Gantt, alerts, site load vs limit, fail-safe banner.
- `scripts/smoke.py`: driver REST → `/ws` → ops flow, four demo buttons, ladder drop and restore.
- Price preview next to the ready-by choice; peak-avoided on the impact card.

## 2026-09-12 — PR #5 (same-day check)
### Added
- Same-year cross-check: 2019-04-09 sessions × 2019-04-09 CAISO average intensity → CO₂ −54.2 %, answers the "you mixed years" question.

## 2026-09-12 — PR #4 (real sessions)
### Added
- 36 real Caltech ACN sessions (2019-04-09) re-dated onto the 2026-04-14 signal day.
### Fixed
- `fetch_data.py`: `kwh_needed` = energy actually delivered (ACN `kWhRequested` is a median 1.47× what the car took); early leavers kept.

## 2026-09-12 — PR #3 (real signal)
### Added
- Real WattTime CAISO_NORTH marginal emissions for 2026-04-14; July and January cross-check days documented.
### Fixed
- Taper-aware tail in the LP so a flat-signal day cannot leave cars 0.2 kWh short.

## 2026-09-12 — PR #2 (scheduler lane)
### Added
- `scheduler.solve()`: elastic LP with energy-by-deadline, progress floor anchored to arrival, 30-min sprint buffer, per-car cap, site limit, tariff-block overage, min-max fairness on shortfall.
- 6 A floor post-step (`MIN_KW = 1.4`): never pause a car; floor-aware site trim that cannot create block overage.
- `impact()` / `impact_detail()` (energy-matched), `price()`.
- `scripts/prove.py`: two real-loop replays, the results table, a pass/fail gate.
- `scripts/fetch_data.py`: WattTime MOER, ACN-Data sessions, CAISO fuel-mix fallback.
- 53 tests including a full simulated day through `api.step()` and the four demo scenarios; performance tripwire (`scipy` 1.14 pin).
### Fixed
- Receipt compares metered history with the baseline frozen at plug-in (rolling re-solve had shrunk it to zero).
- Three defects exposed by the full-day replay (floor anchoring, buffer waste, shortfall starvation).

## 2026-09-12 — scaffold
### Added
- FastAPI app: seven endpoints, `/ws`, control loop, fail-safe ladder, demo endpoints.
- Simulator (1-minute clock, battery taper), OCPP 1.6J gateway behind `OCPP=1`, Postgres schema (optional), seed script.
- Docker Compose (api, postgres, web), Render + Vercel hosting files.
- Proposal, 48-hour team plan, project memory (`AGENTS.md`).
