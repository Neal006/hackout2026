# AGENTS.md — Project Memory (auto-maintained)
Last updated: 2026-09-12 | Sessions logged: 2

## Identity
Hackathon entry: "Noonshift" (working name) — a CPO-side, deadline-based EV charging scheduler that shifts flexible charging into low-marginal-carbon hours at daytime long-dwell sites (workplace/destination/depot). Team is in ideation; no code yet.

## Stack & Commands
Planned (nothing installed yet):
- Python 3.12 · FastAPI · scipy (HiGHS LP) · mobilityhouse/ocpp · gridstatus · acnportal · PostgreSQL · Redis
- React (Vite) operator dashboard · PWA driver app · Docker Compose
- No install/dev/test commands exist yet. Deliverable so far is a single HTML doc (open in a browser).

## Current State & Focus
- Ideation document complete: `ev-green-charging-ideation.html` (13 collapsible sections, 23 verified refs).
- Published copy: https://claude.ai/code/artifact/74850316-de52-44a0-91a4-54c3d8d5d497
- Narrative proposal (md, 13 mermaid diagrams, 5 case studies, market table): `noonshift-proposal.md` — same evidence base, plain-language, no em dashes.
- Next: hour-0 feasibility — run the elastic LP on 40 ACN-Data sessions vs PG&E BEV tariff + WattTime CAISO_NORTH history; print bill & CO₂ delta vs charge-immediately.

## Architecture
Signals (WattTime MOER, gridstatus CAISO, Electricity Maps, NESO) + tariff table + sessions (deadline, kWh) + site meters
→ Scheduler (elastic LP, 5-min slots, re-solve every 5 min + on event) → per-connector kW profiles via OCPP SetChargingProfile
→ Impact engine (metered kWh × MOER vs charge-now baseline) → Driver PWA (one question, plan, receipt) · Operator dashboard · Grid API (stub).
Hard current limits live on the charger, outside the optimiser. Fail-open to full power if backend unreachable.

## File Map
- `ev-green-charging-ideation.html` — full ideation doc: problem, root cause, solution, evidence, novelty, incumbents, comparison, stack/architecture, edge cases, limitations, council pressure-test, research trail, references.
- `noonshift-proposal.md` — 10-section narrative proposal (abstract → intro → problem → solution → why optimal/feasible → stack/architecture → 5 case studies → market table → limitations → refs). Mermaid diagrams validated.
- `AGENTS.md` — this file.

## Conventions
- Every factual claim in docs must cite a reference that was actually opened; mark secondary/abstract-only sources.
- Say "we found no product doing X", never "none exists".
- Impact numbers are labelled estimates, never certificates.
- Grid signal and session data must be from the same grid (CA sessions ↔ CAISO signals).

## Dependencies & Gotchas
- WattTime Basic (free): all signals for CAISO_NORTH only; 2+ yrs history; 72 h forecast updated every 5 min.
- Electricity Maps free tier: 1 zone, 50 req/h, NO forecast. NESO (GB) API: free, no auth, 96 h forecast, 14 regions.
- PG&E BEV rate: super-off-peak 09–14, peak 16–21, subscription kW blocks (no demand charges).
- EVs can't charge below 6 A (IEC 61851); some EVs don't resume after a pause → throttle to 6 A, never 0.
- Martin/Powell/Rajagopal (Nat. Comms Dec 2025): broadcast MEF/AEF signals can raise emissions at scale; avoid plain MEF beyond ~500k EVs.
- Nature.com blocks automated fetch → use PMC/OSTI/RePEc mirrors. MDPI Energies returned 403.
- Mermaid validation: `mermaid@11` + `jsdom` in node, `mermaid.parse()` per block (script in job tmp). GitHub renders xychart-beta, quadrantChart, timeline, gantt with `dateFormat HH:mm`.
- Open limitation: scheduler assumes 1 charger per car for full dwell; more cars than chargers → deadline becomes 'move-by' time (proposal §9.5).

## Decisions Log
- 2026-09-11 — Wedge = daytime workplace/destination sites, payer = site owner — home-overnight is where incumbents already are; solar surplus + idle dwell are daytime.
- 2026-09-11 — One plug-in question + one Boost toggle; no pricing lanes — lanes contradicted deferral-aversion evidence and manufactured a coordination problem.
- 2026-09-11 — Elastic LP with progress-floor constraint — solver must never fail; fairness and early-unplug handled by one constraint.
- 2026-09-11 — Anti-herding = architecture (no broadcast) + multi-site committed-load penalty; full Cascading MEF is roadmap.
- 2026-09-11 — Demo grid = California (WattTime CAISO_NORTH + gridstatus), matching ACN-Data sessions.

## Changelog
2026-09-12 | Narrative md proposal with diagrams + case studies | noonshift-proposal.md, AGENTS.md | Case studies = real deployments (ACN, Rivian, Powell, ev.energy/Martin, Ava/PG&E), not invented scenarios; cars>chargers added as limitation
2026-09-11 | Ideation doc + council pressure test | ev-green-charging-ideation.html, AGENTS.md | Site-owner-paid deadline scheduler for daytime lots; lanes dropped; LP made elastic

## Archived Summary
(none yet)
