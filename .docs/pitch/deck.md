# Noonshift — pitch deck (slide list)

Every claim below is pulled from `noonshift-proposal.md` (section in brackets) or from `scripts/prove.py` run on 2026-09-13. Nothing new is asserted here. Numbers labelled *estimate* are estimates.

---

## 1. Slide 1 — the number (from `prove.py`, real data)

**36 real workplace sessions (ACN Caltech, 2019-04-09) replayed on a real California grid day (WattTime CAISO_NORTH marginal, 2026-04-14), PG&E Business EV tariff, 150 kW feed, 100 kW block.**

| | kWh | $ bill | kg CO₂ | peak kW |
|---|---|---|---|---|
| Charge immediately | 378.9 | 67.42 | 23.0 | 101.0 |
| Noonshift | 378.9 | 65.22 | 7.1 | 100.0 |
| **Saving** | same energy | **−3.3 %** | **−69.3 %** | −1.0 % |

530 re-solves, max 59 ms, 0 fail-safe fallbacks. Say it exactly: *"2019 sessions, 2026 grid signal"*, and quote the range, not the point: −1.8 % on a January gas day, −64.5 % July, −69.3 % April; same-year 2019 × 2019 average-intensity check −54.2 %.

One-line claim: **Same energy, same deadlines, a third of the carbon — on a real day, with no driver doing anything.**

## 2. The problem in one picture [§2.1–2.2]
You cannot choose your electrons, but you can choose your hour. The clean hours (midday solar) and the charging hours (plug-in at arrival, or overnight at home) do not overlap.

## 3. Four numbers [§2.3]
72 % of home sessions start the moment the plug goes in · < 26 % of drivers ever schedule, even on time-of-use tariffs · 3.4 TWh of mostly-solar power curtailed in California in 2024 (+29 %) · 85 % of workplace plug-in time is idle flexibility nobody uses.

## 4. "When do you leave?" [§4.3]
One question at plug-in, pre-filled with the usual answer, or nothing at all. One Boost button. That is the whole driver interface. Deadline sets the price: three tiers by slack (≥ 4 h green $0.18, 1–4 h standard $0.25, < 1 h Boost $0.40 per kWh in the demo).

## 5. The six parts [§4.1]
Signal adapters → deadline capture → per-site elastic LP (5-min slots, re-solved every 5 min and on every event) → OCPP charging profiles → fail-safe ladder (live → cached → tariff → deadline → full power) → counterfactual receipt.

## 6. Who pays [§4.5]
The site owner, because under PG&E's Business EV tariff (super-off-peak 09–14, peak 16–21, subscribed kW blocks) carbon and cost pull the same way and staying inside the block is a real dollar. Utility managed-charging payments are a second income where they exist (Ava Community Energy: $75 at enrolment + up to $25/yr via Optiwatt). Drivers pay nothing extra by default; Boost is the only premium.

## 7. The empty square [§5.3, §8.3]
Utility home programmes: right signal, wrong site. Operator cost-optimisers: right site, wrong objective. Data providers: right data, no control. Daytime multi-connector site, optimised for carbon and the owner's bill: the empty square.

## 8. Comparison table [§8.1]
Reproduce the §8.1 table verbatim (Noonshift vs ev.energy, Optiwatt, WeaveGrid, Octopus IOG, Monta, Driivz/Ampcontrol, Tesla Charge on Solar). Cells reflect public product pages on 11 September 2026. Say "we found no product doing X", never "none exists".

## 9. Cost-savings slide — **TODO, source needed**
The team plan asks for "the worked 40-charger example (~$20k unmanaged vs ~$13k, ~30 %), with a published 10–40 % range and the peer-reviewed 28 % peak / 9 % cost case as the floor". **None of those numbers are in `noonshift-proposal.md` or the repo.** Do not show them until a reference is opened and added to §10. What *is* sourced today: the real-day −3.3 % bill / −1.0 % peak above (Caltech arrivals were already inside super-off-peak and the peak already sat at the block, so the dollar and peak savings on that day are small — say so).

## 10. Herding — why we never broadcast [§3.3 root cause 4, §5.3, §7.4]
Martin, Powell and Rajagopal (Nature Communications, Dec 2025) show one broadcast marginal signal turns net negative at scale. Noonshift optimises per site under the site's own limit and broadcasts nothing to drivers; the committed-load term is the multi-site hook; the full cascading method is roadmap and needs aggregators and grid operators.

## 11. What we do not claim [§8.4, §9]
Not 100 % renewable charging (electrons are not attributable). Not grid-scale herding solved alone. Not certificates (receipts are estimates from a third-party marginal model). Not DC fast charging. Attribution is temporal, not physical. Savings depend on the tariff: where off-peak is overnight, cost and carbon conflict at a workplace.

## 12. Hard questions
See `pitch/hard-questions.md`.

## 13. Demo
See `pitch/demo-script.md` — 4 minutes, 7 beats, two screens.

## 14. 48-hour plan and what is real today
Backend, scheduler, simulator, OCPP gateway, both front-ends wired live, 53 tests, `scripts/smoke.py` green. Real charger hardware not yet touched; adoption at a real site unproven (§9).
