# Noonshift — ten real-world scenarios, recorded

Run 2026-09-13 08:16 against `http://127.0.0.1:8001` · site `site-1`: 60 bays, feed 150.0 kW, block 100.0 kW, R = $0.25/kWh, package pilot · sim clock ×119 · zero-carbon hours today 09:00–18:00

**36 of 36 checks passed.** Every step below is a real request to the API or a frame from `/ws`; nothing is mocked. Reproduce with `SIM_SPEED=120 python -m uvicorn noonshift.api:app --port 8000` then `python scripts/scenarios.py`.

## 1. Priya's normal day

*Priya parks at the office, taps the pre-filled 'Leaving at 17:30?', asks for 12 kWh. She wants her car full by then; the site wants that energy in the zero-carbon hours and never above the feed.*

| sim | who | what happened |
|---|---|---|
| 06:17 | driver | previews the price for a ready-by 8 h out on bay c60 `GET /price?departure_at=2026-04-14T14:17:00&kwh_needed=12` |
| 06:17 | driver | plugs in: 12 kWh by 14:17 `POST /sessions` |
| 06:23 | system | plan window 06:20–10:15, ready by 14:17; 58% of her planned energy lands in zero-carbon hours (charging right now: 0%) |
| 07:18 | driver | checks the app an hour in `GET /sessions/1001/live` |
| 07:18 | driver | receipt so far: $0.3167 and 2.8517 kg CO2 saved (estimate) — grid cleaner than 1.0% of today |

**Promise kept?**

- ✅ plan ends before her stated departure — 10:15 <= 14:17
- ✅ price never above R — $0.2358 vs R $0.25 (green)
- ✅ more of her energy in clean hours than charging immediately — 58% vs 0%
- ✅ first-hour floor: >= min(need, 3.5 kWh) after 60 min — 3.50 kWh

**Ask the site:** *what is bay c60 doing right now?*

> Bay c60 is at 0.0 kW, 3.5 of 12.0 kWh delivered — deferred: an empty slot in its plan. It has 5.77 h of slack before 14:17, so the plan moves the bulk of its 12.0 kWh to cleaner or cheaper slots inside that deadline (today's zero-carbon hours are 09:00–18:00); next slots [0.0, 0.0, 0.0, 0.0, 0.0, 0.0] kW. Not a fault.

<sub>offline template answer (no model key) · sources: The scheduler · suggested: Open the bay → /ops/chargers, See the plan → /ops/schedules</sub>

## 2. Maya's sick kid — Leaving now

*Maya plugged in for the day. School calls mid-morning: come now. She taps 'Leaving now'. Promise: full power from the next slot, at today's rate, no premium — and nobody else loses their floor.*

| sim | who | what happened |
|---|---|---|
| 07:18 | driver | had plugged in for 6 h wanting 10 kWh `POST /sessions` |
| 07:19 | system | bay c59 is deferred to a cleaner hour, drawing 0.0 kW when the phone rings |
| 07:19 | driver | taps 'Leaving now' `POST /sessions/1002/urgency` |
| 07:22 | system | bay c59: 0.0 kW before -> 7.0 kW now; 'boost' event on the ops feed |

**Promise kept?**

- ✅ full power within two slots — 7.0 kW
- ✅ pays exactly R, no premium — $0.25
- ✅ ops feed shows the boost event and flag

**Ask the site:** *what does boost do to the other cars?*

> Three driver buttons, one price. 'Leaving now' sets the deadline to now: full power immediately, first claim on headroom. 'Leaving soon' takes a time (15 min or later) and the plan fills the cleanest slots inside it. 'Prioritise' keeps the deadline but raises the car's floor to 90 % of pro-rata and doubles its weight, so it wins ties. Every urgent session pays the traditional rate R = $0.25/kWh and forfeits the shared-savings discount — that is why nobody presses it to jump the queue. 1 urgent right now.

<sub>offline template answer (no model key) · sources: Urgency — three bands, one price · suggested: Sessions → /ops/sessions</sub>

## 3. Dev's meeting across town — Leaving soon

*Dev said 6 h, then a client moves the meeting up: he must leave in 90 minutes with 8 kWh. He taps 'Leaving soon' and picks the time. Promise: the new time becomes the deadline, the plan fills the cleanest slots before it, price R.*

| sim | who | what happened |
|---|---|---|
| 07:22 | driver | had plugged in for 6 h wanting 8 kWh `POST /sessions` |
| 07:22 | driver | taps 'Leaving soon' at 08:52 `POST /sessions/1003/urgency` |
| 07:22 | system | new plan 07:20–08:40: 0% of the energy in zero-carbon slots inside the 90 min (charge-now: 0%) |
| 08:52 | driver | walks to the car at the time he said `GET /sessions/1003/live` |

**Promise kept?**

- ✅ ready-by moved to the chosen time — 08:52
- ✅ pays exactly R — $0.25
- ✅ the 8 kWh are in the car by the new time — 7.84 / 8 kWh at 08:52

## 4. Aisha is on call — Prioritise

*Aisha, a nurse, might be paged. She keeps her 17:30 but taps 'Prioritise'. Ben plugs in next to her with the same need and no button. Promise: her deadline is unchanged, she pays R, she is held to 90 % of pro-rata (Ben to 50 %), and when the site is short her allowed shortfall is half of anyone else's. On a quiet site both simply get charged.*

| sim | who | what happened |
|---|---|---|
| 08:52 | driver | Aisha plugs in on c57: 12 kWh by 14:52 `POST /sessions` |
| 08:52 | driver | Ben plugs in on c58: same 12 kWh by 14:52 `POST /sessions` |
| 08:52 | driver | Aisha taps 'Prioritise' `POST /sessions/1004/urgency` |
| 09:52 | system | after 60 min: Aisha 5.23 kWh, Ben 5.82 kWh (pro-rata after 1 of 6 h = 2.0 kWh; floors 90 % / 50 %; both also hold the 3.5 kWh first-hour floor) |
| 09:52 | system | priority costs the other drivers nothing unless the site is short: today both are well above their floors |

**Promise kept?**

- ✅ deadline unchanged — 14:52
- ✅ pays exactly R — $0.25
- ✅ Aisha at or above 90 % of pro-rata — 5.23 >= 1.8
- ✅ Ben at or above 50 % of pro-rata — 5.82 >= 1.0

**Ask the site:** *what does prioritise do?*

> Three driver buttons, one price. 'Leaving now' sets the deadline to now: full power immediately, first claim on headroom. 'Leaving soon' takes a time (15 min or later) and the plan fills the cleanest slots inside it. 'Prioritise' keeps the deadline but raises the car's floor to 90 % of pro-rata and doubles its weight, so it wins ties. Every urgent session pays the traditional rate R = $0.25/kWh and forfeits the shared-savings discount — that is why nobody presses it to jump the queue. 2 urgent right now.

<sub>offline template answer (no model key) · sources: Urgency — three bands, one price · suggested: Sessions → /ops/sessions</sub>

## 5. Sam skips the form

*Sam plugs in and ignores the app: the default 'Leaving at 17:30?' stands and no kWh is typed. Promise: the site still plans for him — need from this bay's history, else the site median — and says how confident it is.*

| sim | who | what happened |
|---|---|---|
| 09:52 | driver | plugs in on c56, types nothing `POST /sessions` |
| 09:52 | system | need estimated at 9.1 kWh (confidence: site); plan 09:50–11:30 |

**Promise kept?**

- ✅ a need was estimated — 9.1 kWh
- ✅ confidence is history or site, never 'declared' — site
- ✅ a plan exists

## 6. Ravi's plug-in hybrid

*Ravi's PHEV takes 3.3 kW at most on a 7 kW bay; the app asks for the car once and remembers it. He is at 70 %, wants 90 % of a 40 kWh pack. Promise: the plan never asks the car for more than it can take, and the need comes from the SoC.*

| sim | who | what happened |
|---|---|---|
| 09:52 | driver | plugs in on c56: PHEV, 40 kWh pack, max 3.3 kW, 70 % -> 90 % `POST /sessions` |
| 10:00 | system | need 8.0 kWh (declared); planner cap 3.3 kW; plan peak 3.3 kW; meter 3.3 kW |

**Promise kept?**

- ✅ need = (0.9 - 0.7) x 40 = 8 kWh — 8.0
- ✅ plan never exceeds the car's 3.3 kW — peak 3.3 kW
- ✅ meter never exceeds 3.3 kW — 3.3 kW

**Ask the site:** *why is bay c56 only getting 3.3 kW?*

> Bay c56 is at 3.3 kW, 0.44 of 8.0 kWh delivered — in its planned window: next slots [3.3, 3.3, 3.3, 3.3, 3.3, 3.3] kW, deadline 16:52, slack 4.58 h.

<sub>offline template answer (no model key) · sources: The scheduler · suggested: Open the bay → /ops/chargers, See the plan → /ops/schedules</sub>

## 7. The delivery van on the fleet bay

*Facilities marked bays c41/c42 as fleet bays: a van that cannot leave is lost revenue, not an inconvenience. The van plugs into c41 with a vague '5 h'. Promise: full power immediately, whatever the slack, and the ops screen marks the bay ASAP.*

| sim | who | what happened |
|---|---|---|
| 10:00 | driver | van plugs into c41: 20 kWh, 5 h `POST /sessions` |
| 10:03 | system | plan first slot 7.0 kW; meter 7.0 kW; asap=True (boost=False: nobody pressed anything) |

**Promise kept?**

- ✅ full power from the first slot — 7.0 kW
- ✅ meter at full power — 7.0 kW
- ✅ ops sees the ASAP bay flag

## 8. Tom leaves early

*Tom said 17:00; something comes up and he unplugs after about an hour without telling anyone. Promise: the floors mean he leaves with a usable charge, the receipt says plainly how far short of the stated need he is, and the plan re-solves without him.*

| sim | who | what happened |
|---|---|---|
| 10:03 | driver | Tom plugs in on c55: 15 kWh by 18:03 `POST /sessions` |
| 11:05 | driver | Tom pulls the plug an hour in, without a word `POST /sessions/1008/unplug` |
| 11:07 | system | receipt: 4.90 of 15.0 kWh, status ended, 10.10 kWh short of what he said he needed; ops event: stated 18:03, left 11:05, 10.1 kWh short |

**Promise kept?**

- ✅ first-hour floor held: >= 3.5 kWh after ~60 min — 4.90 kWh
- ✅ receipt is honest: status ended, shortfall visible
- ✅ plan re-solved without him
- ✅ unplug event on the ops feed names him and the shortfall

**Ask the site:** *what happens when a driver leaves before the time they gave?*

> A driver who leaves before the time they gave still leaves with a usable charge: the first-hour floor puts min(need, 3.5 kWh) in the car within 60 minutes of plugging in, and the progress floor keeps every car at or above 50 % of pro-rata at every 30-minute checkpoint since arrival (90 % for a prioritised car). The receipt states plainly how many kWh short of the stated need the car left, the plan re-solves without it at once, and the ops feed logs an 'unplug' event with the stated and actual times.

<sub>offline template answer (no model key) · sources: The scheduler, Driver-side guarantees, Hard questions · suggested: Sessions → /ops/sessions, Alerts → /ops/alerts</sub>

## 9. The grid API goes dark

*The carbon-signal provider has an outage, then the cached forecast is knocked out too. Promise: planning continues on every rung (cached -> tariff), no car loses its plan or deadline, the banner says why, and it all comes back when the signal does.*

| sim | who | what happened |
|---|---|---|
| 11:07 | system | live signal lost `POST /demo/signal_outage` |
| 11:07 | system | cached forecast lost too `POST /demo/signal_outage` |
| 11:13 | system | mode live -> cached -> tariff; plan still covers 32 cars (was 32); mode events on the ops feed: 2 |
| 11:13 | system | signal restored `POST /demo/signal_outage` |

**Promise kept?**

- ✅ ladder stepped down in order
- ✅ no car lost its plan — 32 vs 32
- ✅ plan frames still flowing with the degraded mode — tariff
- ✅ back to live when the signal returns — live

**Ask the site:** *what happens if the grid API dies?*

> We are on the 'tariff' rung. If the grid API dies the ladder steps down: tariff (tariff + deadlines, no carbon) → deadline (earliest-deadline-first only) → full (no solve: every bay holds its static safe share). Every rung that solves still honours deadlines and the feed; the last rung is the 1.833 kW static share that lives on each charger itself, so even with the backend gone the sum over 60 bays stays under the 150.0 kW feed. Nobody is stranded; the plan gets less clean, not less safe.

<sub>offline template answer (no model key) · sources: The fail-safe ladder, OCPP · suggested: Watch the mode → /ops/overview, Alerts → /ops/alerts</sub>

## 10. The lunchtime rush

*Two waves of twenty cars arrive within minutes, all wanting 8–10 kWh inside two hours — more cars than bays, more demand than the feed can give. Promise: nobody is refused, the shortfall is shared instead of starving one car, the site never crosses its feed, cars that are done are asked to move, and the slackest cars get a move-by time.*

| sim | who | what happened |
|---|---|---|
| 11:13 | ops | first wave: 20 arrivals with 2 h deadlines `POST /demo/oversubscribe` |
| 11:14 | ops | second wave: 20 more `POST /demo/oversubscribe` |
| 11:14 | system | 55 of 60 bays active, 17 cars waiting for a bay; if every plugged car drew full power that would be 385.0 kW on a 150 kW feed; 230.5 kWh due inside 2 h |
| 11:44 | system | 30 min later: peak EV draw 110.0 kW vs headroom 110.0 kW; 17 move-by times issued, 0 cars finished, 5 done cars moved on for a waiting car, 13 still waiting |

**Promise kept?**

- ✅ metered EV load never exceeded feed minus building — worst 110.0 vs 110.0 kW
- ✅ nobody refused: every arrival is charging or queued
- ✅ the site really was full: a queue formed — 17 waiting
- ✅ move-by times were issued to the slackest cars — 17 move_by events
- ✅ the day's reported peak (EV + building) stays within the feed — 149.9 vs 150.0 kW

**Ask the site:** *13 cars are waiting — who moves first?*

> 13 cars waiting for a bay. Done cars idle 10 min or more are asked to move first (0 done now); then, one per waiting car, the plugged car with the most slack gets a move-by time = now + time to finish at full power (move-by set: c06 by 11:28, c13 by 11:30, c17 by 12:06, c24 by 12:05, c27 by 12:04). Never a car under 1 h of slack, never an urgent one.

<sub>offline template answer (no model key) · sources: The scheduler · suggested: Live charging → /ops/sites</sub>

## The day so far

67 sessions · 318.25 kWh metered · **13.91 kg CO₂** and $1.43 saved vs charging at plug-in (estimate) · peak 149.9 kW vs 150.0 kW charge-now · renewable-hour share 56 %

**Safety, whole run:** over 335 meter frames the EV load exceeded feed − building by at most 0.0 kW (never).
