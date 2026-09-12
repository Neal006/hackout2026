# Neal's lane: scheduler and proof. Execution plan and status

Scope from `team-plan.md`: `noonshift/scheduler.py` (solve, impact, price), `data/`, `scripts/prove.py`, tests.
Contract: the three signatures in the stub Tirth froze are unchanged; `api.py` calls them exactly as before.

## Status against the gates

| Hour | Gate | Status |
|---|---|---|
| 6 | `prove.py` prints >= 15% saving; slide 1 exists | Done on **real data both sides**: WattTime CAISO_NORTH MOER for 2026-04-14 and 36 ACN Caltech sessions (2019-04-09, re-dated): **CO2 -69.3%, $ -3.3%, peak -1.0%**, 0 fallbacks, gate PASS. Other days below. |
| 10 | `solve()` / `impact()` / `price()` frozen | Done, signatures identical to the stub. `solve_lp()` and `impact_detail()` added for prove.py, not for the API. |
| 16-30 | impact engine, price tiers | Done. Receipt path in `api.py` fixed so the receipt is metered-vs-baseline, not the shrinking remainder. |
| 30-48 | support demo scenarios, tune weights | Four demo endpoints exercised by `tests/test_day.py`. `W_CARBON` decided (below). Remaining: re-read the printed numbers with Srishti. |

## Real data: what `data/` holds

- `signal.json`: WattTime CAISO_NORTH marginal MOER, 2026-04-14 (289 points, 0 gaps). 0 g/kWh 08:00-18:00.
- `sessions.json`: 36 ACN-Data Caltech sessions from Tuesday 2019-04-09 (ACN covers 2018-04 to 2021-09, so no 2026
  day exists), re-dated onto 2026-04-14. `kwh_needed` = energy the car actually took (drivers requested a median
  1.47x that); `user_stated_departure` = what the driver typed (5 of 36 left before it, one 2.6 h early).
  **The slide must say "2019 sessions, 2026 grid signal".** Fetch commands in `scripts/fetch_data.py`.

## Three days, real signal x real sessions (`prove.py`)

| Day | MOER shape | $ | CO2 | peak | short of full |
|---|---|---|---|---|---|
| 2026-04-14 (demo) | 0 g/kWh 08:00-18:00, ~440 overnight | -3.3% | **-69.3%** (23.0 -> 7.1 kg) | -1.0% | 3, same 3 under charge-now (dwell-limited) |
| 2026-07-14 | 0 g/kWh 12:00-17:00, 180-480 elsewhere | -3.2% | -64.5% (104 -> 37 kg) | -1.9% | same 3 |
| 2026-01-20 | flat 413-494 all day (gas at the margin) | -2.2% | -1.8% (177 -> 174 kg) | -1.6% | those 3 + 2 early leavers |

Why $ and peak are small on the real site: these 36 cars arrive 06:30-15:00, most of their energy already lands
inside PG&E's 09-14 super-off-peak, and charge-now peaks at 101 kW on a 100 kW block, so the tariff already does
the money work. Noonshift's added value on this site is carbon, and it never costs more. The seeded placeholder
(40 cars arriving 07:30-09:30) showed $ -20% / peak -9% because its demand was bunched; do not quote those.
The CO2 saving is the grid's to give: ~65-70% on solar days, ~0 when gas sets the margin all day. Quote the range.

## `W_CARBON` decision: 0.05 $/kg, kept

Sweep on the real April MOER with the real sessions (`prove.py --w-carbon`): W=0 (tariff-only) gives CO2 -1.2%,
i.e. the tariff alone is carbon-blind (with the seeded sessions it even raised emissions 16.7% by running 100 kW
through a 172 g/kWh blip at 10:00-11:00); W=0.02 and every value up to 0.5 give -69.3% with an identical $ saving
(3.3%) and identical peak. The knee is at the first step, so the weight stays at the $50/t anchor.

## Run it

```
python -m venv .venv && .venv/Scripts/pip install -r requirements-dev.txt     # scipy is pinned to 1.14.*, see below
.venv/Scripts/python -m pytest                       # 52 tests, ~45 s (the day replay is 40 s of it)
.venv/Scripts/python scripts/prove.py                # slide 1; exit 1 if the gate fails
.venv/Scripts/python -m noonshift.test_loop          # Tirth's control-loop check, still green with the real solver
WATTTIME_USER=.. WATTTIME_PASSWORD=.. python scripts/fetch_data.py signal --day 2026-04-14
ACN_TOKEN=.. python scripts/fetch_data.py sessions --day 2019-04-16 --n 40    # re-dated onto 2026-04-14
python scripts/fetch_data.py caiso --day 2026-04-14  # no-auth fallback, kind=average (label the CO2 number)
```

## The LP as built (deviations from proposal 4.4, each forced by a failing test)

1. **Elastic energy** (rule 1) and a **never-over-deliver cap** so the plan cannot exceed what the car can take.
2. **Progress floor anchored to arrival, with its own $1/kWh slack.** Anchored to `now`, a 5-min rolling re-solve
   under a falling morning MOER deferred the floor forever: the day replay found a car at 0 kWh an hour after
   plug-in. Relaxing the floor through the total shortfall instead forced fake shortfalls that also lowered the
   energy requirement. Checkpoints every 30 min (hourly let a driver see a 0 kWh receipt).
3. **Sprint buffer as a surcharge, not an exclusion.** Excluding the last 30 min from the energy constraint left 25%
   of a 2 h deadline unplanned for a car that was already short. Buffer slots cost +$1/kWh: feasible cars finish
   before it, short cars use it.
4. **Min-max shortfall fraction `z`.** A linear shortfall penalty alone starved whole cars in an oversubscribed lot
   (`[14.0, 0.0, 0.0, ...]`). Minimising the worst fraction spreads the shortfall; identical cars now land within 10%.
5. **ASAP cars** (deadline passed, or Boost) carry only an earliest-first cost. `api.py`'s baseline call sets every
   departure to now, so the baseline is charge-immediately FCFS under the feed with no block-overage term.
   Their tie-break is 1e-3, not 1e-7: the 1e-7 version returned HiGHS "Unknown" on 38 nearly-full cars at 14:05.
6. **Post-step**: allocations in (0, 6 A) round up; the trim caps each slot at min(feed headroom, max(block, LP's
   own site sum)); the rounded car gives way first and drops to 0, never below 6 A. Cars under 0.05 kWh skip the LP.

## Edge cases and the test that holds each one

| Case | Test |
|---|---|
| feasible deadlines met, finished before the buffer, nothing after the deadline | `test_feasible_deadlines_are_met_before_the_30_min_buffer` |
| site limit with a building-load spike; building load above the feed | `test_site_limit_never_exceeded`, `test_building_load_above_feed_leaves_zero_headroom_not_negative` |
| oversubscribed lot: no exception, feed fully used, nobody starved, near-equal shares | `test_oversubscribed_lot_returns_proportional_shortfall_without_raising` |
| empty lot, car that needs nothing, zero p_max | `test_empty_lot`, `test_car_that_needs_nothing_gets_zero_plan`, `test_zero_p_max_gets_zero_plan_and_full_shortfall` |
| deadline already passed; Boost; the baseline call | `test_passed_deadline_charges_now`, `test_boost_charges_now_even_when_later_is_cheaper`, `test_baseline_call_is_charge_immediately` |
| energy lands in cheap, clean slots; early leaver protected; rolling re-solve cannot defer the floor | `test_plan_moves_energy_into_cheap_clean_slots`, `test_progress_floor_*` (three tests) |
| tariff-only and deadline-only ladder rungs | `test_tariff_only_and_deadline_only_rungs_still_meet_deadlines` |
| NaN / short signal arrays; determinism | `test_short_and_nan_signal_arrays_are_tolerated`, `test_deterministic` |
| 6 A floor: tiny allocation, 20 cars on a 10 kW feed, oversubscribed baseline, block overage from rounding | `test_tiny_allocation_*`, `test_rounding_up_*` (two), `test_trim_drops_a_car_to_zero_not_below_min_kw` |
| HiGHS "Unknown" on nearly-full ASAP cars (captured inputs) | `test_baseline_of_nearly_full_cars_solves` + `tests/fixtures/baseline_1405.json` |
| 40 and 60 cars solve under 1 s | `tests/test_perf.py` |
| receipt: shortfall not booked as saving; no signal => no CO2 claim; no tariff => no $ claim; block overage at site level only | `tests/test_impact.py` |
| price tiers total over slack incl. NaN/None/negative | `test_price_tiers_are_total` |
| whole day: solver never falls open, metered load never over headroom, every long-dwell car full, early leavers hold the floor, every receipt finalised, site saving >= 15% | `tests/test_day.py` (module fixture) |
| demo: Boost, early unplug, +20 oversubscribe, signal outage ladder | `tests/test_day.py::test_demo_*` |

## Keeping unit and integration tests in the loop

- Unit tests (`test_scheduler`, `test_impact`, `test_perf`) run in ~3 s: run them on every change to `scheduler.py`.
- `tests/test_day.py` is the integration gate: the full day through `api.step()` with the real solver, the sim's taper
  and the receipt path, then the four demo endpoints. Run it before every hand-off (h10, h16, h30, h40) and after
  any change to `api.py`, `sim.py` or `data/*.json`. It found four real defects that unit tests did not.
- `scripts/prove.py` is the same loop run twice (charge-now policy vs Noonshift) and is the number on slide 1.
- Every regression found in the loop gets a unit test that fails on the old code before the fix lands
  (checked for the rolling-floor and HiGHS-Unknown tests).

## What is still open for Neal

1. **Accounts.** WattTime `neal_noonshift` and ACN-Data `neal_noonshift` (token shown after portal login) are both
   registered; credentials in `~/noonshift-credentials.json`, outside the repo.
2. **Average vs marginal.** If WattTime stalls, the CAISO fallback is average intensity; `signal.kind` is
   "average" and prove.py says so. Slide 1 must not call it marginal.
3. **Early leavers** (5 of the 36 real drivers left before the time they typed) get the progress-floor guarantee
   (>= 50% pro-rata), not a full charge, on flat-signal days. Put it on the hard-questions slide, not in a footnote.
4. **Site sizing.** With the real Caltech day the 150 kW feed and 100 kW block are never really stressed
   (peak 101 kW); the oversubscribe demo is what shows the elastic behaviour. If a bigger $/peak story is wanted,
   it needs a site with bunched arrivals or a smaller block, and the slide must say which.

## Notes for the others

- **Tirth**: `api.py` gained `session_impact()`, `meter_history()` and `S["hist"]` (baseline frozen at plug-in,
  metered kW per sim-minute). `resolve()` now writes receipts from that; `step()` calls `meter_history()` once per
  minute. `test_loop.py` still passes. Nothing else changed.
- **Nandini**: `LiveOut.saved_*` now grow through the session and stop at unplug. A short car's receipt is
  energy-matched, so "you saved $X" never includes energy the car did not get; show the shortfall next to it. The
  Gantt will show a short full-power block right after plug-in (the floor's insurance energy) then the clean block.
- **Srishti**: quote prove.py's saving row and its `signal:` line together; "charge-immediately" in that table is
  FCFS under the same 150 kW feed, not an unmanaged breaker-tripping site.
