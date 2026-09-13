# Implementation plan — WP1–WP7, refined

`prompt.md` is the spec. This file is the delta: the assumptions it asked us to confirm, the places where the spec
as written would not work against the code as it is, and the order. Every PR description links here.

Before (main @ 379bf25, `python scripts/prove.py`): CO₂ −69.3 %, bill −3.3 %, peak −1.0 %, 530 solves, max 70 ms,
0 fallbacks, 53 tests green.

## Assumptions the spec asked us to confirm (answered here, repeated in each PR)

| # | Spec asked | Decision | Why |
|---|---|---|---|
| A1 | `employee_rate_usd_per_kwh` default `0.0`? | Code default **0.0** (free workplace charging). `data/site.json` ships **0.25** — the "flat employee rate" case in `business.md` §0b — so the demo shows the §7b math instead of three $0.00 chips. Set it to 0 for a free site. | Both cases are the customer; the demo has to show a number. |
| A2 | `contracted_peak_kw` default = `feed_kw`? | Yes. | Nothing better is known without the bill. |
| A3 | `package` default `pilot`? | Yes. | §9b. |
| A4 | `safe_share_kw` computed default | `min(p_max_kw, (feed_kw − max(building_load_kw)) / n_connectors)` = 1.83 kW on site-1. | `solutions.md` §5. |
| A5 | queue: a done car occupies the bay forever in the sim | The sim assumes a notified driver **moves within 10 sim-minutes when someone is waiting** (`Sim.MOVE_AFTER_MIN`). Real-world signal: OCPP StatusNotification. | Without it the queue can never drain and the WP3 test is untestable. |
| A6 | `/sessions/{id}/boost` = alias of `urgency now` | Yes: sets `boost`, `urgent`, deadline = now. WattWise's "Charge now" therefore forfeits the discount, per §4b. | One path, one price rule. |

## Deviations from the spec text (each one is in the code as a comment too)

1. **`price()` denominator.** Spec: pass `kwh_delivered`. At plug-in that is 0, so `α·S/ε` would clamp every new
   session to $0. The receipt's saving is computed over the *planned* series (metered + remaining plan), so the
   matching denominator is `kwh_needed` while charging and `kwh_delivered` once ended (an early leaver shifted less).
2. **`/price` preview (no session yet).** The spec is silent. Preview = `R − α × (today's site saving rate so far)`
   for flex/green, `R` for boost. Labelled estimate; settled on the receipt. No LP call for a preview.
3. **`urgency now` does not move the sim's physical departure.** "Leaving now" means *charge at full power until I
   unplug*; if the sim also unplugged the car a minute later there would be nothing to show. `soon` moves both the
   deadline and the physical departure (the driver said when they leave).
4. **Never-worse-than-dumb window.** Asserted for the first hour after plug-in only: `min(need, 3.5 kWh)` by 60 min.
   Beyond that the guarantee is the progress floor (≥ 50 % pro-rata at every 30-min checkpoint), which the day test
   already checks; a dumb-charger bound over *every* rolling hour would forbid the very shifting the product sells.
5. **Fail-safe in the sim mirrors OCPP.** `Connector` gets `safe_kw`; `plug_in` applies it (the static profile); a
   dynamic limit expires 15 sim-minutes after the last `set_limit` and the connector reverts to `safe_kw`. In normal
   operation `apply_limits()` refreshes every minute, so nothing changes; when the loop dies, the sim degrades the way
   a real charger does. This is what makes the kill-the-loop test mean something.
6. **Observation guard needs a physical car in the sim.** Sessions carry `car_kw` (what the car can actually draw;
   sim only, defaults to the declared `max_kw`) separately from `max_kw` (what the planner believes). The guard moves
   `max_kw` toward the meter; a test sets `car_kw = 3.3` on a bay the planner thinks is 7 kW.
7. **Assistant errors.** Anything that is not `RateLimitError` falls back (`degraded: true`) — including a 400 from an
   SDK/parameter mismatch. A demo must never 500 because of the model call.
8. **`connectors_asap` = `["c37", "c38"]`.** The smoke test and the replayed day use `c01–c36` and the top free bays
   (`c58–c60`); `c37/c38` collide with nothing and the smoke test now plugs a van into `c37` to prove the flag.
9. **Multi-day replay.** Only one real day is on disk. `scripts/replay_days.py` takes `data/days/<date>/{signal,sessions}.json`
   and says which days are missing instead of inventing them.

## Order and size

| PR | WP | Touches | Tests that fail on old code |
|---|---|---|---|
| 1 | WP1 pricing + emergency + first-hour floor | `scheduler.py`, `api.py`, `models.py`, `data/site.json`, `smoke.py` | price ≤ R / urgent = R / §6b number; `now` full power; `priority` ≥ 90 % pro-rata; priority car 0 shortfall when oversubscribed; 3.5 kWh at 60 min; dumb-charger window |
| 2 | WP2 safe share + OCPP two profiles | `sim.py`, `api.py`, `scheduler.py`, `ocpp_gateway.py` | kill-the-loop; `full` mode = safe share; gateway self-check |
| 3 | WP3 vehicle / soc / guard / asap bays / done / queue | `models.py`, `api.py`, `sim.py` | 3.3 kW car meets deadline; guard trips; queue of 3 tightens the slackest and a bay frees |
| 4 | WP4 evidence scripts | `scripts/prove.py`, `fetch_data.py`, new `fit.py`, `replay_days.py`; `impact(health_usd=)` | script self-checks |
| 5 | WP5 ops dashboard | `web/`, plus `impact.csv`, `renewable_share`, status fields | lint + build |
| 6 | WP6 operator assistant | `assist.py`, `assist_knowledge.md`, `/assist`, chat drawer | `tests/test_assist.py`, smoke `/assist` |
| 7 | WP7 docs | README, ARCHITECTURE §7/§9, CHANGELOG, AGENTS, ROADMAP §0 | contract-file diff |

## Out of scope (spec "what not to do", kept)

No new front-end dependencies, no ChargePoint, no bookings ahead of arrival, no V2G, no separate chatbot service,
`SIM_SPEED` untouched, `wattwise/` touched only to keep it building.
