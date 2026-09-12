# Noonshift — Business Model, Break Points, and the 4-Tier Benefit System

Grounded in the repo as of 2026-09-13: `data/tariff.json` (PG&E BEV-2-S approx: $0.16 super-off-peak 09–14, $0.20 off-peak, $0.36 peak 16–21; 100 kW block at $12.41/kW/mo, 2× overage), `data/site.json` (60 × 7 kW connectors, 150 kW feed, 20–40 kW building load), `data/sessions.json` (36 real Caltech sessions, 1.2–50.1 kWh, mean 10.6 kWh, 378.9 kWh/day), `scheduler.price()` (green $0.18 / standard $0.25 / boost $0.40), and `scripts/prove.py` (CO₂ −69.3 %, bill −3.3 % = $2.20/day, peak −1 %).

Every $ figure below that is not from `prove.py` is marked **[est]** and should be checked before it goes on a slide.

---

## 0. TL;DR

1. **The carbon story is real but the tariff already does most of the work.** On the Caltech day the site saves $2.20. That funds nothing. Do not build the business on energy arbitrage.
2. **The money is in capacity**: demand charges, avoided service upgrades, and the permit/rebate rule that lets a site install more ports than its feed supports *if* software governs them. We have not measured a site like that yet.
3. **Boost must equal today's price, never exceed it.** `price()` currently makes Boost a 60 % surcharge over standard. That breaks the "never worse than today" promise.
4. **Emergency is the one edge case where Noonshift is strictly worse than a dumb charger** — a car that plugged in 30 min ago may hold 0.3 kWh instead of 3.5 kWh. Fix it with a first-hour floor and a free Emergency Boost, and say so in the pitch before someone asks.
5. **The global story is a grid-type story**, not a California story. Solar-heavy grids with daytime dwell (CA, Australia, India, Spain) fit workplaces. Wind-heavy grids (Texas, UK, Denmark, Germany) fit overnight depots. Hydro/nuclear grids (France, Quebec, Norway) have no carbon lever at all — only capacity.

---

## 1. What the repo actually proves (and what it doesn't)

| Claim | Status | Evidence |
|---|---|---|
| Scheduler meets every deadline, never pauses a car, never exceeds site limit | **Proven** | 53 tests, 530 solves, 0 fallbacks |
| Carbon −69 % on a solar day | **Proven for one day** | prove.py; July −64 %, January −1.8 % |
| Bill −3.3 % | **Proven, and it's small** | $2.20/day on 379 kWh |
| Peak −1 % | **Proven, at an unconstrained site** | 101 → 100 kW; site was already sized right |
| Beats a dumb "full power 09–14" timer | **Not measured** | Judge's kill question |
| Works at a constrained site (block < demand) | **Not measured** | This is where the money is |
| Drivers accept it | **Not measured** | Caltech ACN data shows they answer the question; not that they accept slower charging |
| Works on real charger firmware | **Not measured** | OCPP gateway exists, never touched hardware |
| Day-to-day variance | **Not measured** | n = 1 day |

---

## 2. Break points in the project (technical → business)

| # | Break point | Where | Business consequence |
|---|---|---|---|
| 1 | Boost tier ($0.40) > peak tariff ($0.36) > standard ($0.25). Boost is a **surcharge**, not "today's price" | `scheduler.price()` | Contradicts the core fairness promise. First driver who compares to the old charger walks. |
| 2 | Discount pool is unfunded. Site saves 0.6 ¢/kWh; tiers spread 7 ¢/kWh | `price()` vs `prove.py` | Every Green session **loses the site 6 ¢/kWh** at a Caltech-like site. |
| 3 | `p_max_kw` is per connector (7 kW), not per car. PHEVs and older EVs have 3.3 kW onboard chargers | `sim.py`, `sessions.json` | Scheduler plans 7 kW for a car that can take 3.3 → promised energy not delivered → broken deadline → the one thing we swore never happens. ~30 % of a commercial lot [est]. |
| 4 | `kwh_needed` = historical `kWhDelivered`. In production nobody knows it at plug-in (OCPP 1.6J AC has no SoC) | `fetch_data.py`, `api.py` | Receipt over- or under-claims. Flexibility < the 85 % claimed. |
| 5 | Ladder fallback → **all deferred cars go to full power at once** | `api.py pick_mode()` | Deferred load is a liability. One backend outage at 14:00 can create a 2× demand-charge overage the dumb charger would never have caused. |
| 6 | Progress floor ALPHA = 0.5 of pro-rata, anchored to arrival | `scheduler.py` | In the first hour a car can hold almost nothing. See §4 (emergency). |
| 7 | When block binds against deadlines, elastic LP spreads shortfall — but `pick_mode` "full" bursts the block | `scheduler.py`, `api.py` | At the constrained site (the only site that pays), the failure mode is the product. Must be a site setting: hard cap vs priced overage. |
| 8 | Single site, single process, in-memory `S` dict; DB optional | `api.py`, `db.py` | No multi-tenant → no SaaS. Receipts not auditable. |
| 9 | Unauthenticated OCPP websocket | `ocpp_gateway.py` | Anyone can set charge limits. Uninsurable. |
| 10 | Building load is a fixed 20–40 kW curve | `site.json` | Real HVAC peaks 13:00–16:00 — exactly the solar window. Headroom assumption may be wrong by 2×. |
| 11 | No driver identity / billing hook (OCPP idTag → account → invoice) | — | Cannot charge anyone anything. Tiers are theoretical. |
| 12 | Per-kWh billing with time-varying prices is regulated (CA CTEP, EU Eichrecht/AFIR) | — | A "green $0.18" price display has legal requirements we haven't read. |
| 13 | WattTime commercial licence not priced; Basic tier is CAISO_NORTH only | — | COGS unknown; product doesn't work outside one grid region without a paid feed. |

---

## 3. Where Noonshift is **worse** than a traditional charger

Be honest about these on the "hard questions" slide. Each row: who is hurt, by how much, and the fix.

| # | Edge case | Who loses | How much | Fix / mitigation |
|---|---|---|---|---|
| A | **Emergency early leave** (plugged in 30 min ago, stated 17:30, must go now) | Driver | Holds ~0.3 kWh instead of 3.5 kWh (≈ 3 km vs 15 km) | First-hour floor + free Emergency Boost (§4) |
| B | **Winter / gas-marginal day** (MOER flat ~450 g all day) | Site | Carbon −1.8 %, $ ≈ 0, but still paying SaaS + signal licence → **net negative** | Price SaaS on capacity, not carbon; tell the site the seasonal range |
| C | **Overnight-off-peak tariff** (UK, Germany, India, most of the world) at a daytime site | Site | Cost says night, carbon says day, cars are gone at night → both levers ≈ 0 | Wrong site type. Sell depots there, not workplaces |
| D | **Cars > chargers** (queue for plugs) | Site throughput, waiting drivers | Slow charging holds the plug; a car that could be done in 2 h sits 8 h; queue grows | "Move-by" deadline + port-turnover penalty; without it, don't sell to oversubscribed lots |
| E | **Short-dwell sites** (retail, restaurants, gyms, < 1.5 h) | Everyone | No slack → LP degenerates to charge-now, plus overhead | Not a customer. Say so |
| F | **Forecast wrong** (clean afternoon forecast; cloud rolls in) | Driver's receipt, site's carbon claim | Charging deferred *into* a dirtier hour than charge-now would have used | 72 h forecast + re-solve every 5 min limits damage; publish the receipt as an estimate with a range |
| G | **Driver lies to get Green tier** (says 18:00, leaves 12:00) | Driver (shortfall) then site (goodwill) | Driver gets ≥ 50 % pro-rata, not full charge; if everyone learns to lie, the system collapses to charge-now-with-a-discount → site loses money | Deadline sets price *and* accuracy is learned per driver; Green requires a track record; worst case = today's rate |
| H | **Backend dies at 14:00 with 40 deferred cars** | Site | All 40 → full power → 280 kW on a 100 kW block → 2× overage the dumb charger never triggered | Fallback must be "full power *within the block*" (hardware-level static load management as the last rung), not unlimited |
| I | **On-site solar + battery already installed** | Site | Daytime charging is already optimal; scheduler adds nothing | Not a customer, or sell only the demand-charge layer |
| J | **Flat-rate tariff, no demand charge** | Site | $ lever = 0; only carbon, which nobody pays for | Not a customer unless ESG budget exists |
| K | **Afternoon HVAC peak eats the solar window** | Scheduler | Site headroom lowest exactly when grid is cleanest → cars pushed to 15:00–17:00 (dirtier, pricier) | Live building meter, not a fixed curve; this is a data-integration sale |
| L | **Curtailment / negative price hours** | Site (missed upside) | Grid would pay to consume; retail tariff doesn't pass it through | Only unlockable via utility program or wholesale-indexed tariff; a future revenue line, not today's |

**Upside edge cases worth stating (Noonshift is better and nobody expects it):**
- Slower AC charging is gentler on the battery (lower average C-rate, less time at high SoC). Real, small, driver-facing.
- Cars parked overnight at a depot can be scheduled across two days using the 72 h forecast.
- Demand-response events (`/openadr/events` already exists): the site has pre-computed shiftable load and can sell it.

---

## 4. The emergency case, in full

**Scenario:** Priya plugs in at 08:30, accepts "leaving 17:30", needs 12 kWh. At 09:00 she gets a call: child sick, must leave now.

| | Traditional charger | Noonshift today | Noonshift with fix |
|---|---|---|---|
| Energy at 09:00 | 30 min × 7 kW = **3.5 kWh** (~15 km) | Floor = 0.5 × pro-rata(12 kWh, 30 min of 9 h) ≈ **0.33 kWh** (~1.5 km) | First-hour floor: min(need, 3.5 kWh) in first 60 min → **3.5 kWh** |
| What she can do | Drive to the clinic | Cannot | Drive to the clinic |
| Cost to her | $0.25 × 3.5 | — | $0 premium (Emergency Boost is free, 1/month) |
| Cost to the site | — | — | ~0.3 kWh/car moved into a slightly dirtier hour ≈ 2–3 % of the carbon saving [est] |

**Rules to adopt:**
1. **First-hour floor.** Every car gets `min(kwh_needed, 3.5 kWh)` within 60 min of plug-in regardless of signal. Cheap insurance; buys trust; costs ~2–3 % of carbon saving [est — one prove.py run with the floor added will give the real number].
2. **Emergency Boost is free.** One per driver per 30 days, no premium, instant re-solve as ASAP with priority. After that, Boost = today's rate (not a surcharge).
3. **Never below the dumb charger over any 60-min window** as a hard promise. Encode it as a test.
4. **Fleet vehicles** (delivery vans, shuttles) get a higher floor or are excluded from deferral — a van that can't leave is lost revenue for the customer, not an inconvenience.

---

## 5. Dirty → clean: where the lever actually exists

The lever is `MOER(arrival hour) − MOER(cleanest reachable hour before deadline)`. Where that difference is large, we win. Where it's flat, we don't.

| Grid / region | Dirty hours | Clean hours | Lever size | Fits which site? |
|---|---|---|---|---|
| **California (CAISO)** — validated | 06–09 gas ramp (300–450 g), 17–21 gas peak (400–500 g) | 10–15 solar, MOER = 0 on spring/fall days | **Large** Mar–Oct, **~0** Dec–Feb | Workplace, campus, destination (validated: −69 % / −1.8 %) |
| Australia (NEM) | Evening coal/gas | Midday solar, negative prices common | Large; also $ upside via negative prices | Workplace; strong |
| India (Gujarat, Maharashtra, Karnataka "solar hours" TOD tariffs 2024–25) | Evening/night coal | 10–16 solar | Large carbon; tariff now aligned in some states | Workplace, malls, IT parks; coal-heavy so gCO₂ delta is bigger than CA |
| Spain, Italy, Greece | Evening gas | Midday solar | Large; EU AFIR + Eichrecht metering rules apply | Workplace |
| **Texas (ERCOT)** | Afternoon gas peak | **Night wind** + midday solar | Large but split; night wind favours depots | Fleet depots, apartments |
| UK, Denmark, N. Germany | Calm days (gas) | **Windy nights** — unpredictable | Medium; forecast-driven, not clock-driven | Overnight depots; workplace weak |
| France, Quebec, Norway, Sweden | — | Flat clean (nuclear/hydro) | **≈ 0 carbon lever** | Only the capacity/demand-charge product |
| Poland, South Africa, Indonesia (coal-heavy, growing solar) | Everything except midday | Midday solar, small share | Medium, growing fast | Workplace; biggest g/kWh delta per kWh shifted |

**Consequences for the pitch:**
- "Global user base, validated on California" is honest only if you say **the mechanism is global, the calibration is local**: the LP is grid-agnostic, the signal source and tariff table are per-region plugins.
- Signal availability outside CA: WattTime (US, paid), Electricity Maps (global, average not marginal on free tier), NESO (GB, free). The receipt must say `average` vs `marginal` — the repo already enforces this.
- Where the clean hours are at night, the workplace product is the wrong product. Don't stretch it; build the depot variant.

---

## 6. Vehicle mix in a commercial building

All chargers at the site are 7 kW AC. The **onboard charger** of the car is the real cap, and it varies. Figures approximate, public spec sheets [est].

| Vehicle type | Example | Battery kWh | Onboard AC kW | Typical top-up need | Hours at min(7, onboard) | Full charge at 7 kW | Slack in 8 h dwell | Natural tier |
|---|---|---|---|---|---|---|---|---|
| Commuter sedan | Tesla Model 3, Ioniq 6 | 57–77 | 11 | 10–15 kWh | 1.5–2 h | 8–11 h | 6 h | Green |
| Compact / older EV | Nissan Leaf (2018), Bolt | 40–65 | **3.3–7.2** | 8–12 kWh | 1.5–3.5 h (**3.3 kW cap**) | 12–20 h | 4–6 h | Green — but plan at 3.3 kW |
| SUV | Model Y, ID.4, Ioniq 5 | 75–82 | 11 | 12–20 kWh | 2–3 h | 11–12 h | 5 h | Green |
| Pickup | F-150 Lightning, R1T | 98–131 | 11–19 | 25–40 kWh | 4–6 h | 14–19 h | 2–4 h | Flex |
| PHEV | RAV4 Prime, Prius Prime | 13–18 | **3.3–6.6** | 8–13 kWh (full) | 2.5–4 h at 3.3 | 3–5 h | 4 h | Green, low kW, low value |
| Delivery van (fleet) | e-Transit, BrightDrop | 68–89 | 11 | 40–60 kWh | 6–9 h | 10–13 h | **≈ 0** | Boost / needs DC or overnight |
| Shuttle / minibus | e-Transit XL, Lightning eMotors | 100–150 | 11–19 | 60–100 kWh | 9–14 h | n/a on AC | none | **Not a 7 kW AC customer** — DC 50 kW |
| Motorcycle | Zero SR/F, LiveWire | 14–17 | 3–6 | 5–10 kWh | 1.5–3 h | 3–5 h | 5 h | Green |
| e-bike / scooter | — | 0.5–2 | 0.2–0.5 | < 1 kWh | negligible | — | — | Irrelevant to LP; counts as a plug |

**What this means:**
- Onboard-charger cap must be read per session (observe MeterValues after 5 min → set `p_max` for that car). Break point #3.
- Fleet vans and shuttles have no slack on 7 kW AC. If a commercial building has a loading dock with vans, those chargers should be **excluded from deferral** or moved to a DC/overnight schedule. Mixing them into the LP just produces shortfall.
- Pickups (25–40 kWh need) are the tier-2 "Flex" customers — they benefit from the schedule but need most of the day.
- Sedans/SUVs (10–20 kWh need, 5–6 h slack) are ~70 % of a workplace lot [est] and carry the whole carbon result.

---

## 7. Driver price-incentive model

**Principle: anchor at today, discount from flexibility, never surcharge.**

Let **R** = what the driver pays per kWh today at this site (often $0 at workplaces; $0.25–0.45 at destination lots).

| Tier | Condition | Price | Who funds the gap |
|---|---|---|---|
| **Now / Boost** | slack < 1 h, or Boost pressed | **R** (today's price, unchanged) | nobody — this *is* today |
| **Flex** | 1–4 h slack | R − d₁ | site's measured saving share |
| **Green** | ≥ 4 h slack and driver's stated-deadline accuracy ≥ 80 % over last 10 sessions | R − d₂ | site saving share + utility program + carbon revenue |
| **Emergency** | 1/month, free | R, no premium, ASAP priority | site (goodwill line item) |

**Funding rule (the one that keeps the site solvent):**
`Σ driver discounts per month ≤ 50 % × (measured site benefit that month)` where site benefit = energy arbitrage + demand-charge avoidance + utility/DR payments received, all metered. The other 50 % is split site / Noonshift.

**What d₁, d₂ can actually be, per site type [est]:**

| Site type | Site benefit /kWh | Driver discount pool /kWh | Realistic Green price if R = $0.25 |
|---|---|---|---|
| Caltech-like (unconstrained, arrivals already in cheap window) | 0.6 ¢ (measured) | 0.3 ¢ | **$0.247** — meaningless; drop the money pitch, use non-price incentives |
| Peak-arrival site (cars arrive 15:00–17:00, e.g. hospital shift change, evening campus) | 4–8 ¢ (0.36 → 0.16 shift) | 2–4 ¢ | $0.21–0.23 |
| **Constrained site** (60 ports on 100 kW block, unmanaged peak 200 kW) | 8–15 ¢ (demand charge; see §8) | 4–7 ¢ | **$0.18–0.21** — now the tier ladder is real |
| Constrained + utility program ($75/port/yr) + DR | 10–20 ¢ | 5–10 ¢ | $0.15–0.20 |

**Non-price incentives** (needed where the pool is small, and cheaper than cash anyway):
- Guaranteed parking spot / priority plug for Green-tier drivers.
- Monthly receipt: "Your charging was X % cleaner than the grid average — ≈ Y kg CO₂, ≈ Z km not driven." Lead with kg, not $.
- Employer ESG: aggregated into the company's Scope 2 report (estimate, method disclosed).
- Battery health note: "charged at a gentle rate."

**What NOT to do:** never show "you saved $0.06." Never make Boost cost more than R. Never price carbon to the driver — they didn't emit it, the grid did.

---

## 8. Clean-energy incentive model for the charger provider (site / CPO)

Value stack per port per year. Assumptions: 7 kW port, 1 session/day, 10.6 kWh, 250 days → **2,650 kWh/port/yr**; California; all non-prove.py figures [est].

| # | Value line | Mechanism | Unconstrained site (Caltech-like) | Constrained site (60 ports, 100 kW block, unmanaged peak ~200 kW) |
|---|---|---|---|---|
| 1 | **Energy arbitrage** | Shift kWh from $0.20/$0.36 into $0.16 window | $15 (measured 0.6 ¢) | $50–100 (peak arrivals) |
| 2 | **Demand-charge avoidance** | Each kW of peak avoided = $149/yr at block price, $298/yr at 2× overage | ~$2 (−1 kW) | **~$500** (100 kW overage × $298 ÷ 60 ports) |
| 3 | **Service / transformer upgrade avoided** | NEC 625.42: more ports than the service supports if an EMS governs them. One-time. | $0 | **$50k–150k one-time ÷ 60 ports = $800–2,500/port** — the actual reason to buy |
| 4 | **Rebate eligibility** | CALeVIP and utility make-ready programs increasingly require load-management-capable chargers | qualifies hardware rebate | same |
| 5 | **Utility managed-charging payments** | Ava/Optiwatt-style $75/vehicle/yr; PG&E/SCE programs | $50–75 | $50–75 |
| 6 | **Demand response** | `/openadr/events` exists; CAISO ELRP pays ~$2/kWh during grid emergencies; site has pre-computed shiftable load | $10–40 | $20–80 |
| 7 | **LCFS credits (CA)** | Per-kWh credit for EV charging; ~2–5 ¢/kWh at 2025 credit prices. **Not increased by hour-matching today** — only by contracting renewable supply (book-and-claim) | $50–130 (site gets this with or without Noonshift; we only make the reporting easier) | same |
| 8 | **Hourly clean-energy claims** (24/7 CFE, EnergyTag hourly EACs) | Nascent; Google/Microsoft buy it; no liquid market for a parking lot yet | $0 today; option value | $0 today |
| 9 | **Grid crowding / distribution flexibility** | UK Piclo, NL GOPACS, CA not yet; utility avoided-cost payments | $0 in CA today | $0 in CA today; $20–60 in UK/NL |
| 10 | **ESG / Scope 2 reporting** | Estimate, method disclosed | soft | soft |

**Totals per port/yr [est]:** unconstrained ≈ **$80–130** recurring (mostly lines 5–7, which the site could get without us); constrained ≈ **$600–750 recurring + $800–2,500 one-time**.

**Carbon credits — honest answer:** no compliance market today pays for *hour-shifting* EV charging. LCFS pays per kWh regardless of hour. Voluntary carbon markets don't accept it (no additionality baseline). Hourly EACs are the future path and are 2–4 years from mattering for a parking lot. Say "carbon is the receipt, capacity is the invoice."

---

## 9. Noonshift's own revenue model

| Option | Price | Pros | Cons |
|---|---|---|---|
| **A. Per-port SaaS** | $5–8/port/mo (benchmark: ChargePoint cloud plans ~$20–35/port/mo incl. network) | Predictable | At $6 × 60 = $4,320/yr; unconstrained site saves $80/port → **site says no**. Only constrained sites clear it. |
| **B. Share of measured savings** | 20–30 % of metered demand-charge + arbitrage savings | Aligned; no-lose for site | Revenue is $2.20/day at Caltech; needs constrained sites; metering disputes |
| **C. Installer / EMS bundle** | One-time $2–5k per site as the "energy management system" that unlocks NEC 625.42 + rebates, then $3/port/mo | **Bought for the permit, not ROI**; installer is the channel | Must pass a code inspection; liability |
| **D. License the LP to CSMS vendors** (Ampeco, Driivz, EV Connect) | $1–2/port/mo wholesale | They own the chargers and billing; we own the solver | Margin thin; they can build it |
| **E. Utility vendor list** | Utility pays per enrolled port | Real money exists (Ava) | Slow sales cycle |

**Recommendation:** C as the wedge (one installer, one constrained site), A+B as the recurring layer (`$3/port/mo + 20 % of metered capacity savings`), D only after two paying sites. Qualification rule for sales: **feed_kw < ports × 7 kW × 0.6, and the tariff has a demand charge.** If either is false, the site is a carbon-only customer and won't pay.

---

## 10. The 4-tier benefit system

### Tier 1 — Drivers: less price, same certainty

| Benefit | Concrete | Condition |
|---|---|---|
| Pay ≤ today | Boost = R, never a surcharge | always |
| Discount for flexibility | 2–7 ¢/kWh at constrained / peak-arrival sites; non-price perks elsewhere | stated deadline honoured |
| Never stranded | ≥ 3.5 kWh in the first hour; ≥ 50 % pro-rata always; full charge by stated time | always (test-enforced) |
| Emergency | Free Boost 1/month, instant priority | always |
| Receipt | kg CO₂ first, $ second, method one tap away, labelled estimate | every unplug |
| Battery | Gentler average charge rate | side effect |
| Zero effort | One pre-filled question; ignore = still works | always |

### Tier 2 — Charging station / site operator: cheaper power, no grid crowding, credit-ready

| Benefit | Concrete | Where it's real |
|---|---|---|
| Lower energy bill | 0.6 ¢/kWh (measured) to 8 ¢/kWh (peak-arrival) | all CA TOU sites; ≈ 0 on flat tariffs |
| Lower demand charge | up to $298/kW/yr avoided | **constrained sites only** |
| More ports on the same feed | NEC 625.42 EMS; avoid $50–150k upgrade | new installs / expansions |
| Rebate eligibility | CALeVIP / make-ready require load management | CA, similar in NY/MA |
| New revenue | DR events ($2/kWh ELRP), utility managed-charging ($75/port) | CA programs |
| Grid crowding | Site never exceeds feed; utility sees a flat load → good standing, future flexibility payments | all |
| Carbon credits | LCFS per kWh (existing); hourly EACs (future). Noonshift produces the auditable hourly record | CA; report-ready |
| Fail-safe | Software can only lower power, never exceed hardware limits; falls back to normal charging | all |

### Tier 3 — Environmental

| Benefit | Number | Honest caveat |
|---|---|---|
| Per site per day | 23.0 → 7.1 kg CO₂ (−69 %) on a spring solar day | −1.8 % on a winter gas day; quote the range |
| Per port per year | ~0.44 kg/session × 250 ≈ **110 kg/port/yr** on solar days [est]; ~60 kg/yr blended across seasons [est] | marginal signal, 2019 sessions × 2026 grid |
| Curtailment absorbed | CA curtails ~3.4 TWh/yr of mostly solar; every deferred kWh at noon is a kWh that would otherwise be thrown away | only when MOER = 0 — i.e. when the marginal plant is renewable |
| Evening ramp relief | Less gas peaker dispatch 17–21 | only if the car would otherwise have charged in the evening (home chargers, not workplace) — don't overclaim |
| No broadcast herding | Per-site solver can't cause the fleet-wide rebound that broadcast signals cause at >1.5 M EVs | structural |
| Coal-heavy grids | g/kWh delta 2–3× California's | India, Poland, Australia — unvalidated |

### Tier 4 — Future of EVs

| Benefit | Why it matters |
|---|---|
| **More chargers per building** without grid upgrades | The physical bottleneck to EV adoption in cities is the service entrance, not the car |
| **EVs become a grid asset, not a grid problem** | A managed lot is a flexible load the utility wants; an unmanaged lot is one it fears |
| **Path to V2G / OCPP 2.1** | Deadline + site-limit scheduling is the same LP with a negative lower bound; the contract is already in place |
| **Hourly clean-energy accounting** | When 24/7 CFE becomes standard (corporate buyers already ask), the site has the hourly record |
| **Driver habit** | "When do you leave?" becomes normal; the data trains better defaults; less asking over time |
| **Tariff evolution** | Utilities move toward dynamic/real-time pricing; a site that already schedules captures it on day one |
| **Fleet electrification** | Depots are the same problem with a bigger block; the solver scales |

---

## 11. Questions that make the pitch stronger (answer these before someone asks)

**Money**
1. What does the site save vs a dumb "full power 09–14" timer, not vs charge-now? *(Unmeasured. Run it.)*
2. What is the saving at a site where the block is 50 kW, not 100? *(Unmeasured. Run it.)*
3. Who signs the cheque — facilities manager, installer, CSMS vendor, or utility? Have we talked to one?
4. What is our COGS per port (WattTime commercial, hosting, support)?
5. At what discount does Green-tier pricing make the site lose money, and do we cap it?

**Drivers**
6. What happens in the first hour if the driver has to leave? *(3.5 kWh floor — §4.)*
7. What does Boost cost? *(Today's rate. Never more.)*
8. What if the driver lies about the deadline? *(≥ 50 % pro-rata; accuracy learned; worst case = today.)*
9. What if the car can only take 3.3 kW? *(Must read it; currently we don't.)*
10. Do we track when employees leave? *(Ask, don't infer; opt-in learning.)*

**Grid / carbon**
11. What's the saving on a January day? *(−1.8 %. Say it first.)*
12. Is this just PG&E's tariff doing the work? *(Partly. The −54 % same-year result and the January result show what the signal adds and doesn't.)*
13. Can anyone pay for the kg avoided? *(No compliance market today. Carbon is the receipt.)*
14. Where in the world does this not work? *(France, Quebec, Norway — flat clean grids. Overnight-off-peak regions need the depot variant.)*
15. What if the backend dies with 40 deferred cars? *(Must fall back to full-power-within-block, not unlimited.)*

**Defensibility**
16. Why can't ChargePoint ship this next quarter? *(They can. Our answer: closed networks won't expose profiles to open CSMS; we sell to the open half via installers and Ampeco/Driivz.)*
17. What have we touched that is real? *(Real signal, real sessions, real LP, real OCPP library. Zero real chargers. Say it.)*

---

## 12. What to measure next (in order, ~2 days)

1. **Dumb-timer baseline** in `prove.py`: full power 09–14, else off. Report LP delta over it. If ≈ 0 at 100 kW, the carbon product is a feature.
2. **Constrained replay**: same 36 sessions, `block_kw = 50`, then `feed_kw = 80`. Report $ overage, shortfall kWh, what `pick_mode("full")` does. This is the invoice.
3. **First-hour floor cost**: add `min(need, 3.5 kWh) by 60 min` to the LP; re-run; report the carbon cost. This is the emergency answer.
4. **Multi-day**: 5–10 days across seasons via `fetch_data.py --day`; report min/median/max for CO₂, $, peak.
5. **One phone call** to an EV installer: "Would you bundle an EMS that unlocks NEC 625.42 at $3k/site?" One yes changes the company.
