Here's the full brief. Everything below is verified from the code, tests and prove.py runs in this session.

1. What Noonshift is

A CPO-side (site-owner) EV charging scheduler for daytime long-dwell sites (workplace / destination / depot). Driver answers one question at plug-in ("when do you leave?") plus an optional Boost toggle. The scheduler shifts each car's flexible energy into the cheapest, cleanest hours before its deadline while respecting the site feed, the tariff's subscription block, and a guaranteed progress floor. Demo grid is California (CAISO_NORTH), tariff is PG&E BEV-2-S.

Your lane (team-plan.md): noonshift/scheduler.py, data/, scripts/prove.py, tests.

2. What was built

┌───────────────────────────┬──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│           Piece           │                                                   What it does                                                   │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ noonshift/scheduler.py    │ solve(), impact(), price() (frozen signatures Tirth's api.py calls) + solve_lp() / impact_detail() for prove.py. │
│                           │  Elastic LP, 288 five-minute slots × up to 40 connectors (~11.5k columns).                                       │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ noonshift/api.py (+~30    │ Receipt fix: S["hist"] freezes a per-car baseline at plug-in, meter_history() records metered kW per sim-minute, │
│ lines)                    │  session_impact() computes the receipt as metered-vs-baseline, energy-matched. Nothing else in Tirth's file      │
│                           │ touched.                                                                                                         │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ scripts/prove.py          │ Slide-1 number. Replays the whole day twice through the real api.step() loop (charge-immediately policy vs       │
│                           │ Noonshift), minute-accurate, prints the table + GATE, exit 1 on fail. --w-carbon sweep flag.                     │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ scripts/fetch_data.py     │ signal (WattTime v3), caiso (no-auth fuel-mix fallback, average intensity), sessions (ACN-Data).                 │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ data/                     │ Real on both sides: WattTime marginal MOER 2026-04-14 + 36 ACN Caltech sessions.                                 │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ tests/                    │ 53 tests (43 scheduler unit, impact, perf tripwire, full-day integration + 4 demo scenarios), frozen fixtures    │
│                           │ under tests/data/ and tests/fixtures/.                                                                           │
├───────────────────────────┼──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Docs                      │ neal-plan.md (status vs gates, LP deviations, edge-case→test matrix, slide wording), AGENTS.md, README,          │
│                           │ requirements*.txt.                                                                                               │
└───────────────────────────┴──────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

3. How the scheduler works

Variables per car i, slot t: power p[i,t] kW; per car: shortfall s[i], floor slack F[i]; site-wide: block overage over, worst shortfall fraction z.

Objective (minimise): energy cost = tariff $/kWh + W_CARBON (0.05 $/kg ≈ $50/t) × MOER; block overage at block_price × multiplier / 30 per day; M_SHORT=10 × shortfall + min-max term z; BUFFER_COST $1/kWh surcharge in the last 30 min before departure ("sprint buffer"); M_FLOOR $1/kWh on floor slack; 1e-7 tie-breaks; ASAP cars (deadline passed or Boost) get an earliest-first 1e-3 cost.

Constraints: elastic energy (deliver need − s); never over-deliver; charger p_max (taper-aware above 80 % SoC) and site feed minus building load; progress floor anchored to arrival — every 30 min the car must hold ≥ 50 % of its pro-rata energy; taper tail-time row reserving time for the slow last 20 %.

Post-step: anything in (0, 6 A) rounds up to 1.4 kW (IEC 61851: cars can't charge below 6 A); trim caps each slot at min(feed headroom, max(block, LP's own site sum)); the rounded car gives way first and drops to 0, never below 6 A; values rounded down to 3 dp so the site limit is never crossed by a watt.

Baseline = the same solve() with every departure = now → charge-immediately FCFS under the same 150 kW feed, no overage term. That is what "charge-immediately" means in every table.

Fail-safe ladder (api.py): live signal → cached → tariff-only → deadline-only → full power. Any HiGHS non-optimal status fails open to full power and logs ERROR. Never happened on real data (0 fallbacks).

4. How it was built

- Branch → 14 commits → PR #2 (merged 041562f), reviewed from three views (product / senior engineer / driver) before merging. PR #3 (real MOER + taper fix, 2cfdc17). PR #4 (real ACN sessions + fetch fix, 1c68baf, today).
- Unit tests (~3 s) on every scheduler change; tests/test_day.py full-day replay before every hand-off; every regression the replay found got a unit test that fails on the old code first.
- Registered WattTime and ACN-Data accounts (neal_noonshift, credentials in ~/noonshift-credentials.json, outside the repo), fetched real data, re-proved three days, swept W_CARBON.

5. What the test loop caught (12 real defects, each now pinned by a test)

1. scipy 1.15.2 HiGHS bindings: 66 s per solve on Windows → pinned 1.14.1 (38 ms), perf tripwire test.
2. 6 A rounding produced sub-6 A values → drop to 0 instead.
3. Excluding the sprint buffer from energy wasted 25 % of a 2 h deadline → surcharge instead.
4. Linear shortfall penalty starved whole cars ([14, 0, 0, …]) → min-max z.
5. HiGHS "Unknown" on 38 nearly-full ASAP cars → 1e-3 tie-break + skip cars under 0.05 kWh; captured-input fixture.
6. Floor anchored to now was deferred forever under rolling re-solve (car at 0 kWh an hour after plug-in) → anchored to arrival with its own slack.
7. 3-dp rounding overshot the site limit by 1 W → round down.
8. Receipt shrank to $0 at unplug → metered history vs frozen baseline.
9. prove.py snapped sessions to slots and smeared peaks (123 kW) → minute-accurate placement.
10. Overlaying frozen per-car baselines ignored the feed (171 kW "baseline" on a 150 kW site) → two-policy replay.
11. Rounding created block overage (102.8 kW on a 100 kW block) → trim cap at block, rounded car first.
12. Winter flat-signal day left 22 cars 0.2 kWh short (LP planned 7 kW in the last slot, battery tapered to 2.8) → taper-aware bound + tail-time row.

6. Results

Demo day, real MOER × real sessions (2026-04-14 signal, 36 Caltech sessions from 2019-04-09):

┌────────────────────┬───────┬────────┬────────┬─────────┐
│                    │  kWh  │ $ bill │ kg CO₂ │ peak kW │
├────────────────────┼───────┼────────┼────────┼─────────┤
│ charge-immediately │ 378.9 │ 67.42  │ 23.0   │ 101.0   │
├────────────────────┼───────┼────────┼────────┼─────────┤
│ noonshift          │ 378.9 │ 65.22  │ 7.1    │ 100.0   │
├────────────────────┼───────┼────────┼────────┼─────────┤
│ saving             │       │ 3.3 %  │ 69.3 % │ 1.0 %   │
└────────────────────┴───────┴────────┴────────┴─────────┘

530 solves, max 68 ms, 0 fallbacks, GATE PASS. Same 3 dwell-limited cars are short under both policies (#3 49.8/50.1, #31 19.3/19.9, #33 30.4/32.5 kWh) — physics, not the scheduler.

Three days, same real sessions:

┌────────────┬────────────────────────────┬────────┬─────────────────────┬────────┐
│    Day     │            Grid            │   $    │         CO₂         │  peak  │
├────────────┼────────────────────────────┼────────┼─────────────────────┼────────┤
│ 2026-04-14 │ 0 g/kWh 08–18 (solar)      │ −3.3 % │ −69.3 %             │ −1.0 % │
├────────────┼────────────────────────────┼────────┼─────────────────────┼────────┤
│ 2026-07-14 │ 0 g/kWh 12–17              │ −3.2 % │ −64.5 % (104→37 kg) │ −1.9 % │
├────────────┼────────────────────────────┼────────┼─────────────────────┼────────┤
│ 2026-01-20 │ flat 413–494 (gas all day) │ −2.2 % │ −1.8 %              │ −1.6 % │
└────────────┴────────────────────────────┴────────┴─────────────────────┴────────┘

W_CARBON decision: W=0 (tariff-only) is carbon-blind (−1.2 %); every W in 0.02–0.5 gives −69.3 % at identical $ and peak. Kept 0.05 $/kg. With the seeded sessions W=0 actually raised emissions 16.7 % (ran 100 kW through a 172 g/kWh blip the tariff can't see).

Seeded placeholder vs real — the honest correction: the earlier seeded sessions (40 cars bunched 07:30–09:30) showed $ −20 % / peak −9 % / CO₂ −100 %. Real Caltech arrivals spread 06:30–15:00, most energy already lands in PG&E's 09–14 super-off-peak, and the site peaks at 101 kW on a 100 kW block — so the tariff already does the money work. Don't quote −20 % / −9 %. The real story is carbon, and it never costs more.

7. Performance

- 38 ms typical, 68 ms max per solve on an 11.5k-column LP; 60 cars < 1 s (perf test).
- 530 solves per day (every 5 sim-min + on events); both full-day replays in 15 s.
- Deterministic (test-pinned); 53/53 tests in ~62 s.

8. Key highlights for the pitch

1. Real data on both sides, 0 solver fallbacks, gate passes.
2. −69 % CO₂ on the demo day at a lower bill — never costs the site more.
3. Fairness by construction: min-max shortfall, ≥ 50 % pro-rata progress floor every 30 min, 6 A floor (no car is ever paused).
4. Fail-safe ladder: loses the signal → still meets deadlines; loses everything → full power.
5. Sub-100 ms re-plans, so Boost / early unplug / +20 cars re-solve live (all four demo scenarios tested).
6. Twelve real defects found by the integration loop, each with a failing-first test.

9. Limits to state out loud

- Slide must say "2019 Caltech sessions, 2026 California grid signal" (ACN has no 2026 data).
- CO₂ saving is the grid's to give: ~65–70 % on solar days, ~0 when gas sets the margin all day. Quote the range.
- Early leavers (5 of 36 typed a time and left before it) get the floor guarantee, not a full charge, on flat days.
- One charger per car for the whole dwell; cars > chargers isn't modelled (proposal §9.5).
- Sim battery taper is a simple linear model above 80 % SoC.
- Impact numbers are estimates, not certificates; CAISO fallback is average intensity and is labelled as such.

10. Where it lives

- main at 1c68baf on Neal006/hackout2026 (PRs #2, #3, #4 merged). Your checkout still needs git fetch origin && git pull origin main from C:\Users\Admin\hackout.
- Run: .venv/Scripts/python -m pytest · .venv/Scripts/python scripts/prove.py · scripts/fetch_data.py signal|sessions|caiso --day …. Use the venv — global Python has scipy 1.15 (66 s solves).