    # Noonshift — Metrics beyond money

    Formulas we can put on a slide, with the Caltech day plugged in (36 cars, 378.9 kWh, CO₂ 23.0 → 7.1 kg, peak 101 → 100 kW, MOER 0–574 g/kWh, 122 of 288 five-minute slots at 0 g/kWh = 10.2 h of "solar is the marginal plant").

    Conversion factors marked **[EPA]** are from the EPA Greenhouse Gas Equivalencies Calculator; **[est]** means a published range we haven't pinned to one source yet. Label every derived number "estimate" on the slide — the repo convention.

    Legend: `E_t` = kWh delivered in slot t, `M_t` = marginal CO₂ intensity in slot t (g/kWh), `base` = charge-immediately replay, `ns` = Noonshift replay.

    ---

    ## 1. Carbon (what we already measure)

    | Metric | Formula | Caltech day | Slide wording |
    |---|---|---|---|
    | CO₂ per policy | `CO₂ = Σ_t E_t × M_t / 1000` (kg) | base 23.0, ns 7.1 | — |
    | **CO₂ saved** | `ΔCO₂ = CO₂_base − CO₂_ns` | **15.9 kg/day** | "15.9 kg CO₂ avoided, same kWh delivered" |
    | CO₂ saving % | `ΔCO₂ / CO₂_base` | **69.3 %** | — |
    | **Carbon intensity of charging** | `I = CO₂ / Σ E` (g/kWh) | 60.7 → **18.7 g/kWh** | "our charging is 3× cleaner than plugging in" |
    | vs grid average | `I_ns / I_grid_avg` (CA avg ≈ 200–250 g/kWh [est]) | 18.7 / 225 ≈ **8 %** | "cleaner than 92 % of California's average electricity" |
    | Per driver | `ΔCO₂ / n_cars` | 0.44 kg/session | show as km, not kg (below) |
    | Per site per year | `ΔCO₂ × 250 working days` | ≈ **4.0 t/yr** [est — one solar day × 250; blended seasons ≈ 2 t] | quote the range |

    ---

    ## 2. Carbon → things people can picture

    | Equivalent | Factor | Formula | Caltech day | Per site per year (4.0 t) |
    |---|---|---|---|---|
    | **Km not driven** (avg petrol car) | 0.25 kg CO₂/km [EPA: 400 g/mile] | `ΔCO₂ / 0.25` | **64 km/day**; 1.8 km per driver | ≈ 16,000 km |
    | **Cars taken off the road** | 4.6 t CO₂/car/yr [EPA] | `ΔCO₂_yr / 4.6` | — | **≈ 0.9 cars** per 36-port site |
    | **Petrol not burned** | 2.31 kg CO₂/L | `ΔCO₂ / 2.31` | 6.9 L/day | ≈ 1,700 L |
    | **Tree seedlings grown 10 yrs** | 60 kg CO₂ each [EPA] | `ΔCO₂_yr / 60` | — | ≈ 66 trees |
    | **Smartphone charges** | 8.2 g CO₂ each [EPA] | `ΔCO₂ / 0.0082` | ≈ 1,900/day | — |

    **Driver receipt line:** "Today your charge was ~1.8 km cleaner than plugging in." Lead with this; the $ number ($0.06) reads as failure.

    **Scaling formula for the vision slide:**
    `ΔCO₂_fleet = n_ports × sessions/yr × kWh/session × (I_base − I_ns) / 1000`
    = 1,000,000 ports × 250 × 10.6 kWh × 42 g/kWh ≈ **110,000 t/yr** ≈ 24,000 cars off the road [est, solar-day intensity; halve for seasons].

    ---

    ## 3. Renewable share (the theme's headline metric)

    The grid signal is marginal: `M_t = 0` means "the next kWh comes from a renewable plant that would otherwise be curtailed."

    | Metric | Formula | Notes |
    |---|---|---|
    | **Renewable-hour share of charging** | `R = Σ_{t: M_t = 0} E_t / Σ_t E_t` | Needs per-slot kWh from the replay — `meter_history()` has it; one line in prove.py. Expect ~70–80 % for Noonshift vs ~30 % for charge-now on this day [est]. |
    | Curtailment absorbed (upper bound) | `C = Σ_{t: M_t = 0} E_t` (kWh) | Label "at most" — MOER = 0 says the marginal plant is renewable, not that every kWh was curtailed. |
    | Clean-hour utilisation | `U = Σ_{t: M_t = 0} E_t / (10.2 h × site headroom kW)` | How much of the available clean window the site actually used. |
    | **Grid-average comparison** | `G = 1 − I_ns / I_grid_avg` | "cleaner than the grid average by X %" — use when `signal.kind == "average"` (CAISO fallback) because that signal *is* an average. |
    | California scale | CA curtails ~3.4 TWh/yr, mostly solar | `1M ports × 2,650 kWh × R ≈ 1.6–2.1 TWh` → "workplace EVs could soak up half of California's curtailed solar" [est]. |

    ---

    ## 4. Air quality and health (local, not global)

    CO₂ is global; NOx, SO₂ and PM2.5 are local. Gas plants (the marginal plant in the dirty hours) emit them; solar emits none. The benefit lands near the power plants, which in California are disproportionately in disadvantaged communities (CalEnviroScreen).

    | Metric | Formula | Caltech day [est] | Notes |
    |---|---|---|---|
    | kWh moved out of gas hours | `E_gas = ΔCO₂ / M_gas` with `M_gas ≈ 450 g/kWh` | 15.9 / 0.45 ≈ **35 kWh-equivalent** | rough; exact = Σ over slots with M_t > 0 |
    | **NOx avoided** | `NOx = E_gas × f_NOx`, `f_NOx` ≈ 0.05 g/kWh (combined-cycle) to 0.25 g/kWh (peaker) [est, EPA eGRID ranges] | 2–9 g/day; 0.5–2 kg/site/yr | small per site; scales linearly with ports |
    | SO₂ avoided | `f_SO₂` ≈ 0.003 g/kWh for gas [est] | negligible | say so; gas is low-SO₂ |
    | PM2.5 avoided | `f_PM` ≈ 0.01–0.03 g/kWh [est] | < 1 g/day | negligible per site; matters at scale near peakers |
    | **Health damage avoided ($)** | `H = Σ_t E_t × HD_t / 1000` where `HD_t` = WattTime `health_damage` index ($/MWh, from EPA COBRA-style models) | **not computed yet** — WattTime Basic already gives `health_damage` for CAISO_NORTH; `fetch_data.py` doesn't store it | **One field to add.** Turns "air quality" from a hand-wave into a dollar figure from a public model. |
    | Evening-ramp note | workplace cars leave before 17–21 peaker hours | — | Don't claim peaker relief for workplaces; claim it for the home-charging comparison only if you model it |

    **Slide wording:** "Every kWh we move off a gas hour also avoids NOx and fine particulates near the plant — a local health benefit that CO₂ accounting ignores. WattTime publishes a health-damage index; we can put a $ on it with one more field."

    ---

    ## 5. Grid friendliness (what a grid operator cares about)

    | Metric | Formula | Caltech day | Better is |
    |---|---|---|---|
    | **Peak demand** | `P = max_t (Σ_cars kW_t)` | 101 → 100 kW | lower |
    | Peak within block | `max(0, P − block_kw)` | 1 → 0 kW | 0 |
    | **Load factor** | `LF = mean kW / peak kW` over the charging day | ≈ 0.27 both [est] | higher (flatter) |
    | **Ramp rate** | `max_t |kW_t − kW_{t−1}|` per 5 min | compute from `meter_history()` | lower |
    | Peak-hour energy share | `Σ_{t ∈ 16–21} E_t / Σ E` | ≈ 0 both (cars gone) | lower |
    | **Flexibility offered** | `F = Σ_cars (deadline − arrival − E_need / p_max)` × E_need (kWh·h) | from sessions: slack hours × kWh | the "shiftable load" number a utility program pays for |
    | Flexibility used | `Σ_cars E_need × |t̄_ns − t̄_base|` where `t̄` = energy-weighted mean charging time | — | shows the scheduler actually moved load |
    | Demand-response capacity | `DR_t = Σ_cars min(kW_t, remaining slack)` | expose via `/grid/flex-forecast` (exists) | what we could shed on a grid emergency |
    | Herding risk | 0 by construction (per-site solver, no broadcast) | — | — |

    ---

    ## 6. Driver-side guarantees (the trust metrics)

    | Metric | Formula | Target | Caltech day |
    |---|---|---|---|
    | **Deadline hit rate** | `cars with E_delivered ≥ E_need by stated departure / n` | 100 % | 36/36 |
    | Shortfall | `Σ max(0, E_need − E_delivered)` | 0 kWh | 0 (energy-matched) |
    | **First-hour guarantee** | `min over cars of E_delivered at 60 min` | ≥ min(need, 3.5 kWh) | **not enforced yet** — ~0.3 kWh worst case; see business.md §4 |
    | Never-paused | `min_t kW_t > 0` for every plugged car | true | true (MIN_KW = 1.4) |
    | Boost rate | `boosts / sessions` | < 5 % | demo only |
    | Deadline accuracy | `|stated − actual departure| ` median | < 30 min | from ACN: stated vs actual available |
    | Fairness (worst car) | `z = max_i s_i / E_need_i` (the LP's own variable) | 0 | 0 |
    | Fairness (spread) | Gini of `E_delivered / E_need` | 0 | 0 |
    | **Battery gentleness** | `mean C-rate = mean kW / battery kWh`; `hours at SoC > 80 %` | lower | ~0.1 C vs 0.12 C [est]; slower is kinder |
    | **Emergency rate** | `sessions marked urgent (any band) / n` | < 10 % | demo only |
    | Emergency band mix | share of urgent sessions at now / soon / prioritise | mostly "prioritise" | — |
    | **Price parity check** | `max_i price_i ≤ R` over all sessions, urgent or not | always true | test-enforced once `price()` is rewritten |

    ---

    ## 6b. Money metrics from the shared-savings formula (business.md §7b)

    One measured number per session, `S_i`, split three ways. Every metric below is derived from it.

    | Metric | Formula | Caltech day | Notes |
    |---|---|---|---|
    | **Session saving** | `S_i = Σ_t (E_t^base − E_t^ns) × c_t + slice of ΔD + slice of G`, floored at 0 | site total $2.20; ≈ $0.06/car | `impact_detail()` already has the two cost numbers |
    | Saving rate | `s = Σ S_i / Σ E_i` ($/kWh) | **0.6 ¢/kWh** | the number that decides whether cash discounts make sense at this site |
    | **Driver discount** | `d_i = α × S_i / E_i`; urgent sessions → `d_i = 0` | α = 0.5 → 0.3 ¢/kWh | show estimated at plug-in, actual on receipt |
    | Driver price | `price_i = R − d_i` | R = $0.25 → $0.247 | never above R, by construction |
    | **Site extra profit** | `Δπ_site = (1 − α − β) × Σ S_i` | α 0.5, β 0.2 → **+$0.66/day** | always ≥ 0 — the "profit every session" claim |
    | Noonshift revenue | `π_noon = β × Σ S_i` | $0.44/day | paid on results |
    | Driver pool | `α × Σ S_i` | $1.10/day | — |
    | Discount funding ratio | `Σ d_i E_i / Σ S_i` | = α = 0.5 | must be ≤ 1 − β; a hardcoded 7 ¢ tier gives **11.9** at this site → unfunded |
    | Discount lost to urgency | `Σ_{urgent} α × S_i^would-have` | 0 (no urgent sessions in replay) | what the honesty mechanism costs drivers who press the button |
    | **Shifted energy** | `E^shifted = ½ Σ_t \|E_t^base − E_t^ns\|` (kWh) | from `meter_history()` | the base for allocating ΔD and G per car |
    | Site-type check | `s ≥ 4 ¢/kWh` → cash tiers; else non-price perks | Caltech: perks | one line on the ops dashboard |

    Same formulas at an evening-arrival site [est]: `s ≈ 12 ¢/kWh`, driver 4.8 ¢/kWh, site +$18/day. At a power-limited site [est]: `s ≈ 22 ¢/kWh`, driver 8.7 ¢/kWh, site +$33/day.

    ---

    ## 7. Reliability (why an operator would trust it)

    | Metric | Caltech day |
    |---|---|
    | Solves | 530 |
    | Solve time max / p99 | 59 ms / — |
    | Fallbacks to full power | **0** |
    | Ladder rungs used | live only |
    | Deadlines missed | 0 |
    | Hardware limit exceeded | 0 (impossible by design — limit lives on the charger) |

    ---

    ## 8. Two composite scores (one number for the app, one for the site)

    **Session Green Score (0–100)** — driver app, receipt header:
    `GS = 100 × (1 − CO₂_session / CO₂_session_if_charged_now)`, clamped to [0, 100].
    Caltech day, site-wide: `100 × (1 − 7.1 / 23.0) = 69`. Show as a ring. Never show it below 0 (a session moved into a dirtier hour by a wrong forecast shows 0, and the receipt says why).

    **Site Impact Index** — operator dashboard, monthly:
    `SII = 0.4 × CO₂_saving% + 0.3 × peak_reduction% + 0.2 × renewable_share + 0.1 × deadline_hit_rate`
    Caltech day: `0.4×69 + 0.3×1 + 0.2×~75 + 0.1×100 ≈ 53`. Weights are ours; say so. Its job is to let two sites be compared.

    ---

    ## 9. What each metric needs from the code

    | Metric | Available now | Needs |
    |---|---|---|
    | CO₂, $, peak, saving % | ✅ `prove.py` | — |
    | Km / trees / cars equivalents | ✅ arithmetic on ΔCO₂ | 5 constants |
    | Carbon intensity g/kWh | ✅ | 1 division |
    | Renewable-hour share, curtailment absorbed | per-slot kWh exists in `meter_history()` | ~5 lines in `prove.py` |
    | Ramp rate, load factor | same | ~5 lines |
    | Flexibility offered | ✅ sessions.json | ~5 lines |
    | **Health damage $** | ❌ | store WattTime `health_damage` in `fetch_data.py signal`; sum in `impact()` |
    | NOx / PM | ❌ | 2 constants × kWh moved off gas hours; label [est] |
    | First-hour guarantee | ❌ | LP constraint + test (business.md §4) |
    | Emergency bands, price parity | ❌ | `/sessions/{id}/urgency`, `floor_alpha` / `priority` extras, `urgent` flag (business.md §4b) |
    | `S_i`, discount, site profit | cost numbers exist in `impact_detail()` | `price(R, S_i, E_i, alpha)`; ~10 lines |
    | Green Score / SII | ❌ | 2 formulas in `api.py` receipt |

    ---

    ## 10. Suggested slide

    > **Same 379 kWh. Three times cleaner.**
    > 15.9 kg CO₂ avoided today — 64 km of driving, 1.8 km per driver.
    > ~75 % of charging done while solar was the marginal plant [est].
    > 0 deadlines missed, 0 fallbacks, peak inside the block.
    > One site, one year: ~4 t CO₂ ≈ one car off the road ≈ 66 trees [est; solar-day rate].
    > A million workplace ports: half of California's curtailed solar, put into cars.
    > *All figures estimates from a marginal-emissions signal; method one tap away.*
