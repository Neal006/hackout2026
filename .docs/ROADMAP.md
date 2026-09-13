# Noonshift + WattWise — what to do next, in plain words

Goal in one line: **drivers pay less, the charging station uses the cleanest power available, and dirty power for EV charging goes as close to zero as the grid that day allows.**

This file says what exists today, what is missing, and in what order to build it. "Exists" means it is in the code on `main` and covered by a test or the smoke check. "Partly" means the plumbing is there but not the behaviour. "Missing" means not started. Nothing here claims a number we have not measured; measured numbers come from `scripts/prove.py` on the real day (36 real Caltech sessions, real California grid day 2026-04-14): same energy, CO₂ −69 %, bill −3 %, peak −1 %.

---

## 0. Where we are today

| Piece | Status | What it does |
|---|---|---|
| Brain (`noonshift/scheduler.py`) | Exists, 92 tests across the suite | Decides, every 5 minutes, how much power each plugged-in car gets so every car is full by its ready-by time, the site never exceeds its feed, and charging lands in the cleanest / cheapest slots. |
| Engine (`noonshift/api.py`, `sim.py`) | Exists | Simulated day of 60 chargers, live plan/meter/event feed on `/ws`, four demo buttons, fail-safe ladder (live signal → cached → tariff → deadline → static safe share), urgency bands, queue with move-by, observation guard, hourly ledger. |
| Ops dashboard (`web/`) | Exists, live | Facilities-manager console: load vs contracted peak, Gantt with urgent/ASAP/move-by marks, urgency control, CO₂-first impact with EPA equivalents and ledger export, fail-safe banner in plain words, operator assistant drawer. |
| Driver app (`wattwise/`) | Exists, live | "Ready by when?" → plan window → live kW → receipt. Price tier shown next to the choice. |
| End-to-end check (`scripts/smoke.py`) | Exists | Driver actions → backend → what the ops screen sees. Prints `SMOKE OK`. |
| Pitch (`pitch/`, `business.md`, `metrics.md`) | Exists | Deck outline, 4-minute demo script, hard questions, business model. |

What the two apps exchange **today**:

| Direction | Data | Status |
|---|---|---|
| Driver → Noonshift | connector (bay), ready-by time, kWh wanted | Exists (`POST /sessions`) |
| Driver → Noonshift | Boost ("charge now") | Exists (`POST /sessions/{id}/boost` = urgency `now`) |
| Driver → Noonshift | "Leaving now" / "Leaving soon" + time / "Prioritise" — three bands, one price | Exists (`POST /sessions/{id}/urgency`); ops UI exists, driver UI pending |
| Driver → Noonshift | car model / battery / max kW, SoC now, target SoC | Exists (`POST /sessions` `vehicle`, `soc_now`, `target_soc`); driver UI pending |
| Noonshift → Driver | plan window, ETA, price tier, live kW, kWh delivered, "grid cleaner than X % of today", $ and kg saved (estimate) | Exists |
| Noonshift → Driver | today's hourly grid carbon + tariff (for the "why this hour" graph) | Exists (`GET /grid/signal`) |
| Noonshift → Ops | every plan, every meter tick, every event; site status, impact incl. peak vs charge-now peak | Exists |
| Ops → Noonshift | demo buttons; urgency on a driver's behalf | Exists |
| Ops ↔ Noonshift | questions about today's site, answered from live state + docs | Exists (`POST /assist`) |

---

## 1. Driver app (WattWise): simplify, then add the four inputs

### 1a. Remove what overwhelms (nothing here feeds the backend)
- **Charge screen:** the "Interactive Live Session Simulator" block, the two marketing cards with fixed copy ("waits for the 11:40 PM trough", "avoids peak $4.70"). Keep one switch: *Scheduled* / *Charge now*.
- **Dashboard:** VIN, firmware, variant, "smart explanation" card, the "optimal window" banner with fixed copy. Keep: status, ready-by, window, live kW, one receipt line.
- **Schedule screen:** the narrative timeline (fixed strings). Keep the graph (it is live) with one sentence: "your car charges in the highlighted hours".
- **Profile:** the three fixed rate cards. Replace with the vehicle form (below).
- **Connect modal:** plug-in date/time fields (plug-in is *now*; the sim clock already fills them). Keep: ready-by time, current %, target %, vehicle.

Result: three screens a driver actually needs — **Home** (one card + Boost + Emergency), **Schedule** (graph), **History** (receipts) — plus a small **Vehicle** form.

### 1b. The four inputs the driver gives (what changes where)

| # | Input | Today | Needed |
|---|---|---|---|
| 1 | **Slot booking** — which bay, and (later) a booked arrival | App picks the highest free bay silently | Show the free bays, let the driver pick or accept "any". Booking *ahead of arrival* is a new backend concept (a reservation the brain treats as a future car); do it after the pilot, not before. |
| 2 | **Type of vehicle** — battery size (kWh) and onboard AC charger limit (kW; many cars take 3.7, 7 or 11) | Fixed Tesla, 75 kWh, 7 kW assumed | Vehicle form once, remembered on the phone. Sent with every plug-in. The brain caps each car at min(bay power, car power) — today it only knows the bay's 7 kW. |
| 3 | **Current battery %** | Fixed at 62 % | One slider at plug-in. kWh wanted = (target − current) × battery size. Today's "wanted" number is guessed from this fixed 62 %. |
| 4 | **Time needed for a full charge** | Not shown | Derived, not typed: kWh wanted ÷ min(bay kW, car kW). Show it next to the ready-by picker. If ready-by is *sooner* than that, say so before submit and offer "charge now". |

Backend change for 2–4: `POST /sessions` grows optional fields `vehicle: {model, battery_kwh, max_kw}` and `soc_now`; `api.car()` passes `min(connector.p_max, vehicle.max_kw)` to the solver; the response already carries the plan window and ETA. Contract change is additive (old callers keep working).

### 1c. Emergency button (the part the user asked for)
See section 3 for the rules. In the app: one button **"I need to leave earlier"** → pick the new time → pick urgency (*Need to leave* / *Urgent* / *Emergency*) → the app shows, in one line, what it can do: "You'll have ~X kWh (Y km) by HH:MM" or "Under 15 minutes: charging at full power now, you'll have ~X kWh".

### 1d. Mobile
The layout already collapses correctly below 768 px (bottom nav, hidden sidebar, 2-column cards). **Not yet checked by eye on a phone** — a browser session was excluded from the last pass. Do the 400 px check once the three-screen cut is done, not before.

---

## 2. Noonshift (the brain) — changes the driver inputs need

| Change | Why | Where | Size |
|---|---|---|---|
| Per-car power cap (`max_kw` from the vehicle) | An 11 kW-capable bay charging a 3.7 kW car must not plan 7 kW; the plan would be fiction | `api.car()`, `SessionIn` | small |
| Current % and battery size → kWh wanted | Today the app guesses; the brain should get the real need | `SessionIn`, driver app | small |
| Bay list for the driver | "Slot booking" step 1 | new `GET /sites/{id}/connectors` (free / busy) | small |
| Emergency endpoint with the rules in §3 | Priya's child is sick | new `POST /sessions/{id}/emergency` | medium |
| Urgency → priority in the solver | An *Emergency* car must not share shortfall equally with everyone | per-car shortfall weight in `solve()` (today one global weight) | medium |
| First-hour floor: every car gets min(need, 3.5 kWh) within 60 min of plug-in | Never worse than a dumb charger in the first hour; makes the <15-min emergency survivable | `scheduler.py` floor, one test, one `prove.py` run to price its carbon cost | small–medium |
| Bookings ahead of arrival | Slot booking step 2 | new model + solver treats it as a future car | large — after pilot |

---

## 3. Emergency model — the rules, in plain words

A driver taps "I need to leave earlier" at time *t* with a new departure *d* and an urgency level.

1. **Under 15 minutes to go (d − t < 15 min): nothing clever is possible.** The car goes to full power immediately (the *Emergency* band from `business.md` §4b: priced at today's rate R, no premium, no quota). The app says what the driver will have when they leave. The brain re-solves everyone else around it.
2. **15 minutes or more: reschedule, cleanest-first.** The ready-by moves to *d*; the brain re-solves at once. It already puts energy in the cleanest slots that still fit before *d*; nothing new to invent there. What is new: **urgency decides who gives way if the site is tight** —
   - *Need to leave* (default): same priority as everyone; may share a small shortfall if the site is oversubscribed.
   - *Urgent*: this car's shortfall is weighted heavier than others' — the solver takes power from cars with more slack first.
   - *Emergency*: this car must reach its need if physically possible; others absorb the shortfall.
   In the code this is one number per car in the fairness term of `solve()`.
3. **Always true, whatever the level:** the site never exceeds its feed; no car is ever paused (min 1.4 kW); the first-hour floor applies to everyone.
4. **What the driver sees back:** the new window, the ETA, and — honestly — the kWh they will *not* get if the request cannot be fully met.
5. **Abuse guard:** every emergency band is priced at today's rate and forfeits the discount (`business.md` §4b), so there is nothing to gain by pressing it without need. The stated-deadline accuracy over the last 10 sessions (from `business.md` §7) is the input for the Green tier, so lying about times costs the driver the discount, nothing else.

Ops side sees every emergency as an alert with the level, and the Gantt reshuffles within a re-solve (< 100 ms).

---

## 4. Incentives — make "following the schedule" pay

Principle from `business.md` §7: **anchor at today's price, discount for flexibility, never surcharge.**

| Tier | When | Price |
|---|---|---|
| Now / Boost | less than 1 h of slack, or Boost pressed | today's price (R) |
| Flex | 1–4 h slack | R − d₁ |
| Green | ≥ 4 h slack and the driver's stated times have been accurate ≥ 80 % over the last 10 sessions | R − d₂ |
| Emergency | any band, any time | R (today's rate), no premium, no discount, priority by band |

**Fix needed in code:** `scheduler.price()` today charges Boost *more* than standard ($0.40 vs $0.25). Flip it to the table above. The discounts d₁, d₂ are funded from the site's *measured* saving (`business.md` §7 funding rule: driver discounts ≤ 50 % of measured site benefit) — on the Caltech-like day that saving is tiny (0.6 ¢/kWh), so **the money story only works at a constrained site**; say that on stage rather than promise a discount the site cannot fund.

**Receipt stays the honest one:** "$X and Y kg CO₂ vs charging at plug-in — estimate, method here." Add the tier the driver earned and the accuracy streak.

---

## 5. Evidence before the pitch (Tier 0 — 1 to 2 days, no UI work)

| # | Do | Why | Where |
|---|---|---|---|
| 1 | Add a third policy to `prove.py`: **dumb timer, full power 09–14, else off**. Report the brain's saving *over that*, not only over charge-now. | The judge's kill question. If the delta ≈ 0, the carbon story is a feature, not a company. | `scripts/prove.py` |
| 2 | Re-run with **block = 50 kW**, then **feed = 80 kW**, then **ports = 2×**. Report $ overage, kWh shortfall, and what the ladder does when deadlines and the block collide. | Capacity is the only number that can ever be big; the −1 % peak was measured at a site already sized right. | `scripts/prove.py`, `data/site.json` |
| 3 | Add the **first-hour floor** and re-run. Report its carbon cost. | This is the emergency answer with a number. | `scheduler.py`, `prove.py` |
| 4 | Replay **5–10 days across seasons**. Report min / median / max for CO₂, $, peak. | n = 1 day today. | `scripts/fetch_data.py --day` already does the fetch |
| 5 | Pitch the **range** (−2 % gas day … −69 % solar day) and say "2019 sessions, 2026 grid signal" out loud. | Already the rule in `AGENTS.md`. | slides |

---

## 6. Pilot gaps (Tier 1 — the product holes the review found)

Brain
6. **What happens when the site's tariff block is too small for everyone's deadlines.** Today the ladder falls to full power and bursts the block — the one thing a constrained site pays you *not* to do. Make it a site setting: *hard block* (cap it; spread the shortfall fairly; tell drivers) or *soft block* (pay the overage). Write the test that fails on today's fall-through first.
7. **More cars than chargers.** Add a "move-by" time and a small penalty for holding a plug after full. Otherwise slow charging hogs bays.
8. **How much energy a car really needs.** The charger cannot read the battery (OCPP 1.6 AC gives no %). Use the driver's current % (input 3 above), meter readings, and history; carry a confidence so the receipt does not over-claim.
9. **Regions where cheap hours are at night.** Expose the carbon-vs-cost weight per site and report both numbers instead of one blend.

Driver
10. **Pass-through pricing** (the driver pays the real per-kWh price for the minutes they charged; metering law requires per-kWh time-varying rates anyway). Then the driver is the one who saves, and Boost = "pay today's rate to jump the queue" is coherent.
11. **"Leaving now" path** — this is the emergency model in §3; the progress floor exists, it is just not surfaced.
12. **Ask, don't infer.** Never pre-fill the ready-by from history without an opt-in; inferred departure times are employee-movement tracking.

Ops
13. Per-connector plan and the tariff block on the site chart — done; keep.

---

## 7. CI checks (run on every push and pull request)

Added in `.github/workflows/ci.yml`:

| Job | What it proves |
|---|---|
| `pytest` | 53 scheduler / impact / day-replay tests |
| `scripts/prove.py` | The headline number still holds (gate: CO₂ saving ≥ 15 %, zero fallbacks) |
| `scripts/smoke.py` against a live `uvicorn` | Driver → backend → ops flow works: plug-in, boost, all four demo buttons, ladder drop and restore |
| contract check | `docs/openapi.json` and `docs/ws-frames.json` are committed and current (the API regenerates them; a diff means someone changed the front-end contract without saying so) |
| `web` and `wattwise`: `npm ci`, `oxlint`, `npm run build` | Both apps lint, type-check (`tsc`) and build |

Not in CI (needs a real browser or hardware): the 400 px mobile check, a real OCPP charger.

---

## 8. Order of work

| Step | What | Who (lane) | Size |
|---|---|---|---|
| 1 | Tier 0 evidence runs (§5, items 1–4) | scheduler lane | 1–2 days, scripts only |
| 2 | WattWise cut to three screens (§1a) | front-end lane | 1 day |
| 3 | Vehicle form + current % + derived full-charge time; backend accepts `vehicle` + `soc_now`, caps per car (§1b, §2) | front-end + engine | 1 day |
| 4 | Bay picker (`GET /sites/{id}/connectors`) | engine + front-end | ½ day |
| 5 | First-hour floor + test + `prove.py` cost (§2, §5.3) | scheduler | ½ day |
| 6 | Emergency endpoint with the 15-minute rule + urgency weight + app button + ops alert (§3) | engine + scheduler + front-end | 2 days |
| 7 | Price table flip (never surcharge) + tier and accuracy on the receipt (§4) | scheduler + front-end | ½ day |
| 8 | Block policy setting + failing-first test (§6.6) | scheduler | 1 day |
| 9 | Mobile 400 px pass by eye; copy pass on the remaining strings | front-end | ½ day |
| 10 | Bookings ahead of arrival; move-by / port turnover (§2, §6.7) | after pilot | large |

Everything in steps 1–9 keeps the WebSocket contract unchanged (additive REST only), so the ops dashboard keeps working throughout.

---

## 9. What we say no to, and why
- **Guaranteeing zero dirty energy.** On a winter gas day the grid has no clean hour; the brain can only move charging into the *cleanest* hours that exist. We report the range, we do not promise zero.
- **Certificates.** The receipt is an estimate from a third-party marginal model. It says so.
- **Reading the battery from the charger.** Not possible on OCPP 1.6 AC; hence input 3 is asked, not read.
- **Pausing a car to make room.** Never (IEC 61851 minimum current); the solver spreads, it does not switch off.
- **Numbers without a source.** The $20k-vs-$13k / 28 % / 9 % figures in the old team plan have no reference in the repo; they stay off the slides until one is opened.
