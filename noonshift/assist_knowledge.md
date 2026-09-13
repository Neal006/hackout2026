# Noonshift — operator assistant knowledge

Static text, assembled by hand from README, .docs/ARCHITECTURE.md §2–§5, .docs/business.md §0b/§4b/§7b, .docs/metrics.md §2/§3/§6 and .docs/pitch/hard-questions.md. Nothing time-varying belongs here; live numbers come from `<site_state>`.

## What Noonshift does

1. Asks one pre-filled question at plug-in — "Leaving at 17:30?" — and works if the driver ignores it (need is then estimated from this bay's history, else the site median; `need_confidence` = declared / history / site).
2. Solves a linear program every 5 minutes across every connector at the site: minimise marginal CO₂ and tariff cost, subject to the site feed, the tariff block, and every driver's deadline.
3. Never broadcasts a signal: one solver per site, so it cannot herd a fleet the way broadcast carbon signals do.
4. Shows an honest receipt — $ and kg CO₂ saved vs charging at plug-in, labelled estimate, method one tap away.
5. Fails safe: live → cached → tariff → deadline → full. Hardware limits live on the charger; software can delay charging, never exceed a limit.

Demo buttons on the ops dashboard (`POST /demo/*`): Boost (a driver taps "leaving now" → full power at rate R), Early unplug (progress floor means they leave with a usable charge), Oversubscribe (+20 cars; elastic LP spreads shortfall fairly), Signal outage (the ladder steps down and back).

## The five-minute control loop (ARCHITECTURE §2)

Every simulated minute `api.step()` ticks the simulator (plug-ins, unplugs, done, queue moves), records each car's metered kW, and runs the observation guard. On an event or at a 5-minute boundary `resolve()` picks the mode from the ladder, solves the plan **and** a charge-now baseline (every deadline = now), pushes per-connector limits, and broadcasts a `plan` frame; every minute it broadcasts a `meter` frame (site kW, per-connector kW/kWh/status). The receipt is metered-so-far + plan-ahead versus the baseline **frozen at plug-in**, otherwise a rolling re-solve would shrink every receipt to zero by unplug time.

## The scheduler (ARCHITECTURE §3)

Variables: `p[i,t]` kW per car per 5-min slot (288 slots), `s[i]` shortfall kWh, `over` kW above the tariff block, `z` worst shortfall fraction.

minimise Σ p·h·(price[t] + W_CARBON·moer[t]/1000) + M_SHORT·priority_i·s[i] + overage·over + M_SHORT·mean(e_rem)·z

Constraints and why:
- Energy by deadline (elastic): Σ p·h + s[i] ≥ e_rem — never infeasible; a shortfall is explicit, priced, reported.
- Progress floor: at every 30-min checkpoint since arrival, delivered + planned ≥ ALPHA (0.5; 0.9 for a "prioritise" car) × pro-rata need. Anchored to arrival so re-solves cannot defer it forever.
- First-hour floor: min(need, 3.5 kWh) within 60 min of arrival. A floor beats the carbon signal and the tariff block but never the feed.
- Sprint buffer: the last 30 min before a deadline carry a surcharge, so a feasible car finishes early.
- Charger cap: 0 ≤ p ≤ min(bay p_max, car max_kw), reduced above 80 % SoC by the taper model.
- Site limit: Σ p ≤ feed − building_load[t]. Never exceeded. Block: Σ p − over ≤ block_kw (overage priced from the demand charge).
- Fairness: s[i]/e_rem[i] ≤ z — the worst fraction is minimised, so shortfall is shared, nobody is starved.
- Post-step: any allocation in (0, 1.4 kW) rounds up to 1.4 kW (6 A, IEC 61851: a car is never asked for a sub-6 A trickle it cannot draw). A deferred car draws 0 kW in the slots the plan leaves empty and resumes inside its window; when rounding would exceed a limit, the cars with the most slack give way first. Results round down, never over a limit.

Why a bay shows 0 or 1.4 kW: the LP deferred the bulk of that car's energy to cleaner or cheaper slots later inside its deadline (0 kW = this slot is empty in its plan; 1.4 kW = the 6 A floor). The first-hour floor (min(need, 3.5 kWh) in 60 min) and the 30-min progress floor still hold, so it is never far behind. It is not a fault. A bay can also be capped by the observation guard (below) or by the car itself.

ASAP cars (deadline passed, "leaving now", or a fleet bay in `connectors_asap`) charge immediately; slot cost is only a tie-break for them. Size: ~11,500 variables for 40 cars, HiGHS solves in tens of ms on scipy 1.14.

Observation guard (solutions.md §10): a car that draws under 80 % of its limit for 5 minutes cannot take what was planned (PHEV, cold battery, wrong form). The planner believes the meter: `max_kw` = metered × 1.05 for the rest of the session, flagged `cap_observed`.

Queue (solutions.md §3): more cars than bays is normal at a corporate lot. Arrivals with no bay wait; a done car idle ≥ 10 min is asked to move when someone waits; per waiting car the plugged car with the most slack (≥ 1 h, not urgent) gets a move-by time = now + time to finish at full power.

## The fail-safe ladder (ARCHITECTURE §4)

live (marginal CO₂ + tariff + deadlines) → cached (same, on the last forecast ≤ 6 h old) → tariff (tariff + deadlines, no carbon) → deadline (earliest-deadline-first only) → full (no solve: every connector holds its static **safe share**).

`pick_mode()` walks the rungs top-down and returns the first healthy one; `resolve()` shapes the LP inputs to match (tariff ⇒ empty moer; deadline ⇒ also empty price; full ⇒ no solve). A rung down is a degraded plan, never a stranded car: deadlines are honoured on every rung that solves, and the full rung is exactly what the chargers do by themselves when the backend disappears.

Safe share (solutions.md §5): `min(bay p_max, (feed − max building load) / n_connectors)` — 1.833 kW on the 60-bay, 150 kW demo site. It is the profile an electrical inspector accepts: the sum over every bay never exceeds the feed even with no software running.

## OCPP (ARCHITECTURE §5)

OCPP 1.6J, two charging profiles per connector: stack 0 = the static safe share, sent once after BootNotification with no expiry; stack 1 = the dynamic plan limit, valid for 15 minutes and refreshed every 10. If the backend goes quiet the dynamic profile expires and the charger reverts to the safe share on its own. Hardware max current is configured on the charger; a profile can only lower it. Simulated chargers exchange the same messages a real one does (`OCPP=1`); no real hardware yet.

## The customer (business §0b)

A company that owns its building and chargers, pays the building's bill, and lets employees charge — usually free, sometimes at a flat employee rate R. Dwell 8–9 h. More EVs than plugs; rotation at lunch. The money is the building's demand charge and the feed, not energy arbitrage: never let the chargers create a new building peak, and fit more ports on the existing service (60 × 7 kW nameplate on a 150 kW feed). Two reports the company already files benefit: Scope 2 and Scope 3 category 7, with an hourly ledger behind them (`/sites/{id}/impact.csv`). Honest sentence: at a building with spare capacity the recurring cash value is small; at one adding chargers or near its peak it is five figures a year plus a one-time upgrade avoided.

Packages: **capacity** (more ports on the same service, peak never raised), **clean-hours** (Scope 2/3 ledger, renewable-hour share), **pilot** (both, evaluation term).

## Urgency — three bands, one price (business §4b)

| Band | Driver sees | Scheduler does | Price |
|---|---|---|---|
| now | "Leaving now" | deadline = now → full power immediately, first claim on headroom; other cars keep their floors | R |
| soon | "Leaving soon" + time | deadline = that time (≥ 15 min out); the LP fills the cleanest slots inside the window | R |
| priority | "Not urgent — prioritise me" | deadline unchanged; floor 90 % of pro-rata + weight 2 in the shortfall term, so it wins ties | R |

Every urgent session pays the traditional rate R; the §7b discount exists only for sessions never marked urgent — pressing any button forfeits the discount, so nobody presses it to game the queue. Twenty "now" at once: headroom ÷ 7 kW ≈ 17 cars at full power; the LP shares the shortfall fairly — "as fast as the site can", not "full power". Fleet bays default to now.

## The shared-savings price (business §7b)

R = what the driver pays per kWh today (site setting; $0 where charging is free). E_i = kWh delivered. S_i = the measured saving of that session versus charge-now (energy arbitrage + that car's slice of avoided demand charge and program payments), floored at 0.

discount_i = α × S_i / E_i · price_i = R − discount_i · urgent or no slack ⇒ S_i = 0 ⇒ price = R.

Profit: π_site = π_today + (1 − α − β) × S_i ≥ π_today; π_noonshift = β × S_i; driver = α × S_i. α = driver share (site knob, 0–0.5), β = Noonshift share (contract, e.g. 0.2). The site cannot lose, the driver cannot pay more than R, Noonshift is paid on results. The estimate is shown at plug-in and settled on the receipt from metered kWh. On the measured Caltech day S ≈ $2.20 for 379 kWh — pennies per driver; at evening-arrival or power-limited sites it is $18–33/day.

## Carbon into things people picture (metrics §2, EPA factors)

km not driven = ΔCO₂ / 0.25 kg per km · litres of petrol = ΔCO₂ / 2.31 · tree seedlings grown 10 yr = ΔCO₂ / 60 kg · cars off the road per year = ΔCO₂_yr / 4.6 t · smartphone charges = ΔCO₂ / 8.2 g.

## Renewable share (metrics §3)

The signal is marginal: MOER = 0 means the next kWh comes from a renewable plant that would otherwise be curtailed. Renewable-hour share = Σ_{t: MOER=0} E_t / Σ E_t. Curtailment absorbed = Σ_{MOER=0} E_t, label "at most". When the signal kind is "average" (CAISO fallback) say "cleaner than the grid average", not "renewable".

## Driver-side guarantees (metrics §6)

Deadline hit rate (target 100 %), shortfall kWh (0), first-hour guarantee ≥ min(need, 3.5 kWh) (test-enforced), no sub-6 A allocation (every non-zero kW ≥ 1.4), fairness z = worst shortfall fraction (0), emergency rate (< 10 %), price parity max price ≤ R (test-enforced).

## Hard questions

- The driver lies about departure: the stated time sets the deadline and therefore the discount; a later-than-true time earns nothing extra because the discount is on kWh actually shifted; an earlier one costs slack. Saying "now" is today's behaviour.
- The forecast is wrong: re-solved every 5 min and on every event; the receipt uses metered kWh; numbers are labelled estimates.
- The backend dies: the ladder, then the static safe share on the charger — inspector-grade, no software needed.
- Can a bug overcharge a circuit: feed and per-bay caps are hard LP constraints, allocations round down, the hardware limit stays on the charger; tests assert the feed is never exceeded even oversubscribed.
- The driver leaves early: the progress floor and first-hour floor mean a usable charge; the receipt says how many kWh short.
- More cars than chargers: queue + move-by; the room to chase the cleanest hour shrinks and we say so.
- Why not a 09–14 timer: on the real day the LP beats the dumb timer by −56 % CO₂, −28 % bill, −28 % peak, because it shares the feed, honours deadlines under contention, and follows the signal minute by minute.
- Isn't −69 % a sunny-day artefact: partly — January gas day −1.8 %, July −64.5 %, April −69 %; quote the range; the mechanism is the product.
- What we do not claim: not 100 % renewable electrons, not certificates, not DC fast charging, not V2G; attribution is temporal, not physical.
