# Noonshift — Real-world solutions, mapped to the code

Companion to `business.md` (the problems) and `ROADMAP.md` (the order). This file answers: *for each problem we found, what is the real-world fix, where in the repo does it go, and what is it going to cost us.* The first three findings (Boost price, unfunded discount, emergency) are solved in `business.md` §4b and §7b and are not repeated here.

Rules for this file: every claim is grounded in code I read or data I computed today. Anything I could not verify is tagged **Assumption:** and says what would verify it.

---

## 0. Two facts from our own data that change the story

Computed today from `data/sessions.json` (36 real Caltech sessions) and `scripts/prove.py`:

**Fact 1 — real drivers under-state their stay, they don't over-state it.**
`departure − user_stated_departure`: 29 of 36 drivers left **later** than they said (average +130 min); 5 left earlier (worst −158 min); 2 exact. Dwell 3.1–14.2 h, mean 7.7 h. Stated slack: 4 cars < 1 h, 15 cars 1–4 h, 17 cars ≥ 4 h.
→ The "driver lies to get the discount" fear runs the wrong way in real life. Drivers hedge conservatively. The scheduler is *under*-using flexibility, not being gamed. This is a slide.

**Fact 2 — `prove.py` plans with perfect foresight.**
`resolve()` and `prove.py` feed the same realised `signal.moer` into planning and into scoring. A real product plans on the *forecast* at 06:00 and gets scored on what the grid *actually* did. Our −69 % is the ceiling, not the product number.
→ Fix in §6 below. Until it is fixed, say "with perfect foresight" on the slide. After it is fixed, we have the only honest number in the room.

---

## 1. Winter / gas-marginal days — site pays for software that saves nothing (edge B)

**Real-world fact:** On the January replay carbon saving is −1.8 %. Any fixed SaaS fee makes the site worse off for ~4 months a year.

**Solution — no fixed fee on the carbon product; fee is a share of measured savings.**
`business.md` §7b already defines Noonshift's revenue as `β × S` where `S` is the measured saving. On a gas day `S ≈ 0`, so the fee ≈ 0 automatically. The site never pays for a month that saved nothing. The fixed component (`$3/port/mo`) is charged **only** for the capacity product (block enforcement, NEC 625.42 EMS role, §5 below), which works every day of the year regardless of the grid.

**Code:** none in the scheduler. `impact()` already returns `saved_usd` per session; monthly invoice = `Σ β × saved_usd`. One aggregation query on `db.save_session` rows.

**Cost:** revenue is seasonal at carbon-only sites. That is the truth of the product; pricing it otherwise is the bluff.

---

## 2. Regions where cheap power is at night (edge C) and the "global" claim (§5)

**Real-world fact:** The LP is grid-agnostic — it takes any per-slot `moer[]` and `price_per_kwh[]`. What is California-specific is (a) the signal source, (b) the tariff shape, (c) the assumption that the interesting day runs 00:00–24:00.

**Solution — per-site plugins, not a rewrite.**

| Piece | Exists | Needed | Size |
|---|---|---|---|
| Signal adapters | `fetch_data.py signal` (WattTime) and `caiso` (fuel-mix average) | `electricitymaps` (global, average, free 1 zone), `neso` (GB, marginal-ish, free, no auth) — same output schema `{moer[], kind, region}` | ~30 lines each |
| Tariff | `data/tariff.json` per site | already per site; a UK DUoS red/amber/green or Indian TOD is just a different 288-array | 0 |
| Carbon weight | `W_CARBON` module constant | move to `site.json` (`w_carbon`) so a site where carbon and cost conflict can choose; `impact()` already reports both numbers separately | 3 lines |
| **Day boundary** | `api.step()` resets the sim at `sim.day_end`; sessions crossing midnight are cut | `site.json: day_start` (e.g. `"18:00"` for a depot); `Sim.day_end = day_start + 24 h`; the scheduler already wraps the horizon | ~10 lines + 1 test |

**Assumption:** Electricity Maps free tier still allows 1 zone / 50 req/h (per `AGENTS.md`, checked when the team registered); NESO carbon-intensity API remains auth-free. Both verifiable with one `curl`.

**What we then say honestly:** "Validated on California workplace data. The same code runs a UK depot with a 30-line adapter; the number for that site is unmeasured until we fetch its signal and sessions."

---

## 3. More cars than chargers (edge D)

**Real-world fact:** Every commercial network already solves plug-hogging with **idle fees** after the car is full (Tesla, ChargePoint site-configurable, EVgo) and a push notification "your car is done." Nobody solves it inside the optimiser. Our scheduler makes it slightly worse because it finishes late on purpose (clean slots > early slots).

**Solution — two layers, both small.**
1. **Notification + idle fee, outside the LP.** `sim.py` already flips a session to `"done"`; `api.step()` already emits events. Add a `done` event to the driver WS frame and an `idle_since` timestamp on the session record. The idle fee is a site setting on the receipt, not a scheduler concept.
2. **Dynamic move-by when a queue exists.** When `waiting_cars > 0`, `resolve()` tightens the deadline of the plugged car with the most slack to `now + e_rem / p_max` (i.e. "finish now, make room"). One loop before calling `solve()`; the LP does the rest. Cars with < 1 h slack are never touched.

**Assumption:** the sim has no queue concept (`sim.py` assigns arrivals to free connectors and has no waiting list). Adding `Sim.waiting` is ~15 lines; the real-world signal for it is OCPP `StatusNotification` (Preparing on an occupied bay) or a booking.

**Cost:** carbon saving drops at oversubscribed sites because we shift less. That is correct behaviour — throughput beats carbon when there is a queue — and `impact()` will show it.

---

## 4. Short-dwell sites (edge E) and flat-tariff sites (edge J) — don't sell there

**Solution — a site-fit check from the site's own sessions, before anyone signs.**
`scripts/fit.py` (new, ~40 lines): read a site's session export (any CSV with arrival, departure, kWh), compute the slack distribution the way I did today, and print one of:
- `cash tiers` — median slack ≥ 4 h and tariff spread ≥ 4 ¢/kWh or a demand charge exists
- `perks only` — median slack ≥ 2 h, no price spread
- `not a fit` — median slack < 1.5 h

Same arithmetic as `metrics.md` §6b "site-type check". This turns "we only sell to the right sites" from a slogan into a pre-sales tool that runs on the customer's data in 5 seconds.

---

## 5. Backend dies with 40 deferred cars → power spike (edge H) — and why this *is* the installer product

**Real-world fact (OCPP 1.6J):** charging profiles **persist on the charger** until cleared or expired, and stack: a higher `stack_level` overrides a lower one; each profile can carry `valid_to`. This is exactly how commercial static load management works in Wallbox / ChargePoint firmware.

**Today:** `ocpp_gateway.set_limit()` pushes one `TxDefaultProfile` at `stack_level 0` with no expiry; `pick_mode("full")` and `apply_limits()` fall back to `c.p_max_kw` (7 kW × every car).

**Solution — two profiles per connector, the safe one underneath.**
```
stack_level 0  static share    = min(p_max, (feed_kw − max building load) / n_connectors)   no expiry   ← sent once at boot
stack_level 1  dynamic plan    = this slot's LP kW                                         valid_to = now + 15 min
```
If Noonshift dies, the dynamic profile expires within 15 min and every charger reverts to its static share **on its own, with no network**. 60 chargers × (110 kW / 60) = 110 kW total — inside the feed, and the block overage is bounded at (110 − 100) × 2 × $12.41 / 30 ≈ **$8/day worst case** instead of an unbounded 280 kW spike.

`pick_mode("full")` returns the static share, not `p_max`. `_full_power()` in `scheduler.py` gets the same treatment.

**Why this matters commercially:** an "energy management system" under NEC 625.42 is precisely a device that guarantees the EV load never exceeds a set point *including when its controller is offline*. The static-profile-underneath design is that guarantee, expressed in OCPP. It is the thing an electrical inspector asks about, and the thing an installer buys.

**Assumption:** NEC 625.42 (2020/2023 editions) permits sizing the service for the EMS set point rather than the sum of nameplate loads — this is widely cited by installers and by CALeVIP guidance, but I have not opened the code text; one read of NFPA 70 §625.42 verifies it. Any UL listing requirement for the EMS itself (UL 916 / UL 2594) is **not verified** and would be a real cost line.

**Code:** `ocpp_gateway.set_limit()` (two profiles, ~15 lines), `api.pick_mode()` + `apply_limits()` (static share instead of `p_max`, ~5 lines), one test: kill the control loop, assert site kW ≤ feed after 15 sim-minutes. `ROADMAP.md` §6.6 already lists the block-policy setting; this is the mechanism under it.

---

## 6. Forecast is wrong (edge F) — and the perfect-foresight problem

**Real-world fact:** WattTime Basic gives a 72 h `co2_moer` forecast (per `AGENTS.md`); `fetch_data.py` stores only the realised history. A product plans at 06:00 on the forecast.

**Solution — plan on forecast, score on actual, in the same replay.**
- `fetch_data.py signal --forecast-at 06:00` writes `data/signal_forecast.json` (the forecast as published that morning) next to `data/signal.json` (actual).
- `prove.py --forecast data/signal_forecast.json`: `solve()` sees the forecast; `_totals()` scores with the actual. Print both the perfect-foresight number and the forecast number.
- `api.resolve()`: `S["signal"]` becomes the forecast; the receipt (`session_impact`) prices metered kWh with the actual signal as it lands (the `meter_history()` path already records per-minute kW).

**What this buys:** the honest headline, a **forecast-error metric** (`mean |forecast − actual|` g/kWh per day) for the ops dashboard, and a natural hedge: the existing 30-min sprint buffer and the 5-min re-solve already limit the damage from a wrong forecast; now we can measure how much.

**Assumption:** WattTime Basic's forecast endpoint returns the *historical* forecast for a past date (the "as published at" version). If it only returns the live forward forecast, we validate on a live day going forward instead — which is what a product does anyway. One API call verifies.

**Cost:** the number on the slide will drop below 69 %. That drop is the difference between a demo and a product.

---

## 7. Driver states a wrong time (edge G)

**Real-world fact (Fact 1 above):** drivers under-state. 5 of 36 left early, worst by 158 min; 29 stayed longer. The current floor (≥ 50 % pro-rata at every 30-min checkpoint since arrival) plus the first-hour floor from `business.md` §4 covers the early-leavers; the late-stayers are wasted flexibility.

**Solution — learn the per-driver bias, only with opt-in, and price honesty through §7b.**
- `db.save_session()` already stores `arrival`, `user_stated_departure`, `departure`. Per driver (OCPP `idTag` / app account) keep `median(actual − stated)` over the last 10 sessions.
- If the driver has opted in, the app pre-fills `stated + bias × 0.5` (never the full bias — a conservative pre-fill is still an ask, not a guess). The scheduler still receives whatever the driver confirms.
- No penalty for being wrong. §7b already makes the discount proportional to *energy actually shifted*, so a wrong time costs the driver the discount on the un-shifted part and nothing else.

**Code:** one aggregate on existing rows; one optional field in `POST /sessions` response (`suggested_departure`). `ROADMAP.md` §6.12 ("ask, don't infer") stays the rule — the suggestion is shown, never auto-submitted.

---

## 8. On-site solar / battery (edge I) and negative prices (edge L) — already handled, say so

**Solar:** `solve_lp` computes `avail = max(feed_kw − building_load_kw, 0)`. Feed the site's **net** load (building minus rooftop solar) and midday headroom grows automatically. For carbon, when the site is exporting, the marginal source of the next kWh is its own panel: set `moer[t] = 0` where `net_load[t] < 0`. Five lines in `resolve()` where `site["building_load_kw"]` is aligned.

**Negative prices:** `price_per_kwh` is a plain array; negative values make the LP charge as much as the cap constraint (`Σ p ≤ e_rem`) allows — never more than the car can take. No change needed. What is needed for a customer to *see* it is a wholesale-indexed tariff (CAISO day-ahead LMP as the array), which is a `fetch_data.py` adapter, not a scheduler change.

**Assumption:** the sim's `building_load_kw` is a fixed curve (edge K, next). Solar netting only helps with a live or forecast site meter.

---

## 9. Afternoon HVAC eats the solar window (edge K)

**Real-world fact:** `site.json` has a hand-drawn 20–40 kW curve. Real commercial buildings peak 13:00–16:00 on hot days, exactly when the grid is cleanest.

**Solution — building load as a forecast from the site's own meter history, updated live.**
- New `POST /sites/{id}/building_load` `{slot_start, kw}` — the same shape as the existing DR endpoint (`/openadr/events` just adds `reduce_kw` to `building_load_kw` in `resolve()`; this is the same path with a meter reading instead of a DR event).
- Forecast for today = same-weekday median of the last 4 weeks from stored readings; live readings overwrite the next slot. `resolve()` already re-runs every 5 min, so a 5-min-old meter reading is the natural cadence.

**Assumption:** the pilot building has a readable main meter (Modbus/BACnet gateway, utility Green Button, or a CT clamp). No meter → keep the curve and say "site headroom assumed."

---

## 10. Per-car power cap and vehicle mix (§6)

**Real-world fact (OCPP 1.6J AC):** the charger cannot read the car's onboard charger rating or state of charge. But it *does* report `MeterValues` every few seconds once charging.

**Solution — declare, then observe, then trust the meter.**
1. Driver's vehicle form (`ROADMAP.md` §1b) gives `max_kw`; `api.car()` passes `min(connector.p_max, vehicle.max_kw)`.
2. **Observation guard:** after 5 minutes at a limit of `L` kW, if metered kW `< 0.8 × L`, set `p_max_kw = metered × 1.05` for the rest of the session. This catches wrong forms, PHEVs, cold batteries and tapering, with no driver input. `sim.Connector.kw` and `meter_history()` already carry the data; ~8 lines in `api.step()`.
3. **Non-deferrable connectors.** `site.json: connectors_asap: ["c57", "c58", …]` for the loading-dock bays. `api.car()` sets `boost = True` for them; the LP then treats them as ASAP with no other change. Fleet vans and shuttles are out of the deferral pool by configuration, not by hoping.

**Cost:** step 2 means the first 5 minutes may plan too much for a slow car; the floor constraint absorbs it. One test: car with `max_kw 3.3` on a 7 kW bay meets its deadline.

---

## 11. How much energy the car really needs (break point #4)

**Solution — three sources, one confidence.**
`kwh_needed = (target_soc − soc_now) × battery_kwh` from the form; if no form, the driver's own median from history; if no history, the site median (10.6 kWh here). Carry `need_confidence ∈ {declared, history, site}` on the session; the receipt shows "estimate" in the last two cases. The observation guard in §10 corrects the power side; the taper model already in `solve_lp` (`TAPER_*`) corrects the energy side once the car passes 80 %.

**Code:** `SessionIn` gains optional `soc_now`, `target_soc`, `battery_kwh`; `api.car()` computes; ~15 lines. `ROADMAP.md` §2 already lists it.

---

## 12. Carbon credits (§8) — produce the record now, sell it when a market exists

**Real-world fact:** LCFS pays per kWh regardless of hour; hourly EACs (EnergyTag) have buyers (Google, Microsoft) but no market for a parking lot yet.

**Solution — the hourly record is the asset; we already write it.**
`db.save_meters()` stores per-minute kW per connector; `signal.json` stores per-slot MOER. One export (`GET /sites/{id}/impact.csv?from&to`) with columns `hour, kWh, gCO2/kWh, kgCO2, signal_kind, signal_source` is an audit-ready ledger. LCFS reporting today takes the kWh column; an hourly-EAC registry tomorrow takes the rest. No claim of a credit is made; the site's sustainability team gets a file instead of a slide.

**Code:** one endpoint, ~20 lines, reads existing rows.

---

## 13. Multi-tenant, auth, billing (break points #8, #9, #11) — the parts that make it a product, not a demo

| Gap | Real-world minimum | Code |
|---|---|---|
| Single site in memory (`S`) | Key state by `site_id`; one control loop per site | `S` → `SITES[site_id]`; `resolve()`/`step()` take a site; ~60 lines; the WS frames already carry `site_id` |
| Unauthenticated OCPP | OCPP 1.6 **security profile 1**: HTTP Basic auth on the websocket upgrade, over TLS at the reverse proxy (`nginx.conf` already exists for the front-end) | check `Authorization` in `ocpp_gateway.on_connect` against a per-charger password; ~10 lines |
| Unauthenticated `/demo/*` and ops endpoints | Bearer token from env | one FastAPI dependency; ~10 lines |
| Nobody can be billed | Driver identity = OCPP `idTag` (RFID/app) → account; price from §7b; **kWh from the charger's certified meter**, never from the sim | `on_start`/`on_stop` already receive `id_tag` and meter values; store on the session; ~15 lines |

**Assumption (metering law):** in California, selling electricity per kWh at a public charger requires a CTEP-certified meter *in the charger* (commercial EVSE ships with one). Noonshift sets the price schedule and reads the charger's meter; it does not meter. That keeps us outside the certification scope. **Not verified against the CTEP text**; one read of CCR Title 4 Div 9 §4002.11 would settle it. Same shape in the EU (Eichrecht: the charger's signed meter values).

---

## 14. Signal licence and COGS (break point #13)

**Real-world fact:** WattTime Basic is free, CAISO_NORTH only, no commercial use. Electricity Maps free tier is 1 zone. NESO is free.

**Solution — three-source ladder, already half-built.** `fetch_data.py` has `signal` (WattTime) and `caiso` (fuel-mix average). The runtime ladder in `pick_mode()` is live → cached → tariff-only. Insert **"average signal"** between cached and tariff-only: if the marginal source is unavailable, use the CAISO/Electricity Maps average with `kind = "average"` (the receipt already labels it). The product degrades from *marginal* to *average* to *tariff-only* to *deadline-only* to *static share* — five rungs, every one of them measured somewhere in this repo.

**Assumption:** WattTime Pro pricing is quote-based and unknown. Until we have a quote, COGS per site is hosting only; the slide says "marginal signal: WattTime (commercial licence TBD) or Electricity Maps; average signal: free."

---

## 15. Dev setup: `[vite] http proxy error … ECONNREFUSED` and the UI

**What the error is.** `web/vite.config.js` proxies `/api/*` and `/ws` to `http://localhost:8000`. `ECONNREFUSED` means nothing is listening there — the FastAPI backend is not running. Verified today: `Get-NetTCPConnection -LocalPort 8000` → 0 listeners. Vite logs one line per failed poll (the dashboard polls `/impact` and `/status` every 5 s and the WebSocket reconnects), hence the wall of text. Nothing is broken in the front-end; it already shows `systemStatus = "Offline"` in this state.

**Fix — start the backend first, in its own terminal:**
```powershell
# from the repo root, venv active
python -m uvicorn noonshift.api:app --port 8000 --reload
# then, in web/
npm run dev
```
or everything at once: `docker compose up -d --build` (backend on 8000, ops on 3000, driver app on 3001).

**Two small hardening items (optional):**
- The "Offline" state in the ops dashboard should say *what to run* (`uvicorn noonshift.api:app --port 8000`) instead of just "Offline" — one string in `web/src/context/GlobalStateContext.jsx:213`. A judge who opens the dashboard without the backend should see instructions, not a dead screen.
- `web/README.md` is still the Vite template text. Replace with the two commands above and the `VITE_API_URL` note (~10 lines).

**UI quality.** I have not looked at either app by eye in this session (no browser pass), so I will not invent findings. What is already recorded: `ROADMAP.md` §1a lists the WattWise screens to cut (simulator block, fixed-copy marketing cards, VIN/firmware fields, narrative timeline) and §1d flags the 400 px mobile check as not yet done. The rule for the pass: **every element on screen must be fed by a backend field** (`docs/ws-frames.json`, `docs/openapi.json`); anything with fixed copy goes. One person, one hour, both apps, with the backend running — then the findings are real.

---

## 16. Order (what I would actually do this week)

| Day | Do | Why first |
|---|---|---|
| 1 | §6 forecast-vs-actual in `prove.py` | Turns the headline from ceiling to product number; everything else is credibility-neutral until this is done |
| 1 | Fact 1 on a slide; `scripts/fit.py` (§4) | Free evidence from data we already have |
| 2 | §5 static profile underneath + `pick_mode("full")` = static share + kill-the-loop test | The fail-safe that an inspector and an installer both understand; also closes edge H |
| 2 | §10 observation guard + `connectors_asap` | Closes the "we promise energy the car can't take" hole with 8 lines |
| 3 | §13 OCPP basic auth + bearer on ops endpoints | Cheapest thing that stops "uninsurable" |
| 3 | §1 invoice = `β × Σ saved_usd`; §12 impact CSV | Revenue model and ledger, both from rows we already store |
| later | §2 day boundary + adapters, §3 queue, §9 building meter, §13 multi-tenant | Each is a pilot-site conversation, not a hackathon deliverable |

**Docs to reconcile:** `ROADMAP.md` §3.1 and §3.5 still say the Emergency Boost is "free, once per 30 days"; the team decision (`business.md` §4b) is that every emergency band is priced at today's rate, no quota. One edit.
