# Hard questions — answers the code actually backs

Each answer points at the mechanism in the repo, not at intent. Sections refer to `noonshift-proposal.md`.

**"The driver lies about their departure time."**
Deadline sets the price (`scheduler.price()`: more slack, cheaper tier), so stating a later time than you mean costs you nothing but earns nothing either; stating an earlier one costs more. The stated time is the driver's own input and is kept as such (`user_stated_departure`). Worst case, a driver who says "now" gets exactly today's behaviour: charge at plug-in.

**"The forecast is wrong."**
The plan is re-solved every 5 simulated minutes and on every event (`api.resolve()`), so a wrong forecast is corrected at the next tick. The receipt uses metered kWh, not the plan (`session_impact()`). Numbers are labelled estimates because the marginal model is third-party and noisy (§9.1).

**"The backend dies."**
The fail-safe ladder (`api.pick_mode()`): live signal → cached (≤ 6 h) → tariff-only → deadline-only → full power. The last rung is the charger's own default: `Connector.limit_kw` starts at full power and only a plan lowers it. Demo: "Grid signal unavailable" button.

**"Can a bug overcharge a circuit?"**
The site feed and the per-connector maximum are hard constraints in the LP (`scheduler.solve()`), allocations are rounded *down* to the limit, and the hardware limit stays on the charger — the scheduler can only ask for less. `tests/test_scheduler.py` asserts the site limit is never exceeded, including the oversubscribed case.

**"The driver leaves early."**
The progress floor (anchored to arrival, α = 0.5, 30-minute checkpoints) means every car is always partly charged before its window; a final sprint guarantees the deadline. Leaving early gives a usable charge and the receipt says plainly how many kWh short of the stated need the car left. Demo: "Driver leaves early" button.

**"More cars than chargers?"**
Not solved by the scheduler alone (§9.5): one charger per car for the dwell is assumed; with rotation, the deadline becomes a "move-by" time and the room to chase the cleanest hour shrinks. Say this before they ask.

**"Why not just a timer for 09–14?"**
On a well-designed tariff a timer captures much of the cost saving; the LP adds the site-limit sharing, the deadline guarantee under contention, the elastic shortfall when oversubscribed, and the carbon term on days the tariff and the grid disagree. On the real Caltech day the dollar and peak deltas were small (−3.3 % / −1.0 %) precisely because arrivals were already inside super-off-peak; the carbon delta (−69 %) is what the timer does not see minute by minute.

**"Isn't −69 % just a sunny-day artefact?"**
Yes, partly: January gas day −1.8 %, July −64.5 %, April −69.3 %. Quote the range. The mechanism is the product; the number depends on the grid that day.

**"You mixed 2019 sessions with a 2026 grid day."**
Deliberately, and said on the slide. Same-year check (2019 sessions × 2019 CAISO average intensity): −54.2 %. The story holds without mixing years.

**"Is this real hardware?"**
No. Simulated chargers exchange the same OCPP 1.6J messages a real one does (`ocpp_gateway.py`, `OCPP=1`); real firmware quirks are unmet (§9.6).

**"What do you not claim?"** (§8.4, §9)
Not 100 % renewable electrons; not certificates; not grid-scale herding solved alone; not DC fast charging; not bidirectional; attribution is temporal, not physical.
