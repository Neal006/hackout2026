 # ☀️ Noonshift

**A deadline-based EV charging scheduler that moves charging into the hours the grid is clean and cheap.**

Built for HACKOUT'26· 12 September 2026

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/python-3.12-blue.svg)](https://www.python.org/)
[![OCPP 1.6 / 2.0.1](https://img.shields.io/badge/OCPP-1.6%20%7C%202.0.1-green.svg)](https://openchargealliance.org/)

---

## The problem in one picture

EVs charge the moment a driver plugs in — usually the evening, right when the grid leans hardest on gas. Meanwhile, California curtails **3.4 TWh of mostly solar power a year** because nobody draws it at noon. The cars are already parked where the clean hours are (workplace lots, 8am–5pm). Nobody uses that fact.

```
Hour     00:00   06:00   09:00          14:00   17:00        21:00   24:00
Grid     |-gas---|-gas---|==== solar ====|-mixed-|=== gas ramp ===|-gas-|
Cars     |-home--|-drive-|======== parked at work ========|-drive-|-home-|
Default  |charge |       |                                |charge-|charge|
```

**72%** of home charging sessions start the instant the plug goes in, and fewer than **26%** of drivers ever schedule — even on tariffs designed to reward it. Any solution that depends on drivers changing behavior is dead on arrival.

## What Noonshift does

Noonshift is a scheduling layer that sits between the charging management system and the chargers at daytime, multi-connector sites (workplaces, campuses). It:

1. **Asks one pre-filled question at plug-in** — "When do you leave?" — and does nothing if the driver ignores it.
2. **Solves a linear program every 5 minutes** across every connector at the site, minimizing forecast marginal CO₂ and tariff cost, subject to the site's power limit and every driver's deadline.
3. **Never broadcasts a signal.** Each site is one decision-maker, so it can't fall into the herding failure mode that plagues fleet-wide carbon signals at scale.
4. **Shows an honest receipt** — money and CO₂ saved vs. charging immediately — instead of a vague "% renewable" badge.
5. **Fails safe.** If the backend goes down, chargers fall back to full power. A software bug can delay charging, never exceed a hardware limit.

The site owner pays for it — because it pays for itself. Tariffs like PG&E's Business EV rate already price 9am–2pm as the cheapest window, so cutting the bill and cutting carbon point the same direction.

## Why this, why now

- **The mechanism is proven.** Caltech's Adaptive Charging Network has been asking drivers this exact question at plug-in since 2018, across 30,000+ real sessions (ACN-Data).
- **The zero-effort default is the only design that reaches drivers.** Rivian telematics data shows 72% charge instantly regardless of incentives — so the product has to work through the default, not around it.
- **Daytime workplace charging is where grid modeling says flexibility should go.** Nature Energy research on the Western US grid shows daytime charging beats home-overnight on storage, curtailment, ramping, and emissions.
- **Broadcast carbon signals break at scale.** New (Dec 2025) research shows fleet-wide marginal signals turn *net negative* past ~1.5M EVs. Noonshift's per-site, non-broadcast design sidesteps this by construction.
- **Someone already pays for exactly this.** Ava Community Energy pays drivers for shiftable charging today; PG&E's commercial EV tariff already rewards the 9am–2pm window.

No existing product combines deadline-aware, marginal-carbon-optimized, site-constrained scheduling at a daytime multi-connector site. That's the gap Noonshift fills.

## How it works

```
Driver plugs in
      │
      ▼
"Leaving at 17:30?" (pre-filled, one tap or ignore)
      │
      ▼
Site scheduler re-solves LP for all connectors
(marginal CO₂ + tariff cost, under site power limit,
 guaranteed energy by deadline)
      │
      ▼
OCPP SetChargingProfile pushed to each charger
      │
      ▼
Re-solve every 5 min + on any event (plug-in, Boost, deadline edit)
      │
      ▼
Driver unplugs → receipt: "saved $X and Y kg CO₂ vs. charging at plug-in"
```

The optimizer is a linear program (~11,500 variables for a 40-connector site, 288 five-minute slots) solved in under a second with `scipy`/HiGHS. Key constraints:

- **Energy by deadline** (elastic — never fails, degrades gracefully with an explicit shortfall penalty instead of crashing)
- **Progress floor** — every car gets at least half its pro-rata share at all times, so early-leavers aren't stranded
- **Final sprint** — full power for the last 30 minutes before deadline if energy is still owed
- **Site limit** — total connector draw never exceeds the site's feed minus live building load

## Architecture

```
┌─────────────┐   ┌───────────────┐   ┌──────────────┐
│ Grid signals │   │ Tariff table  │   │   Sessions    │
│ (WattTime,   │   │ (PG&E BEV)    │   │ (plug-in app, │
│  gridstatus) │   │               │   │  ISO 15118)   │
└──────┬───────┘   └───────┬───────┘   └──────┬───────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                            ▼
                  ┌───────────────────┐
                  │  Scheduler (LP)    │
                  │  scipy + HiGHS     │
                  │  re-solves every   │
                  │  5 min / on event  │
                  └─────────┬──────────┘
                            ▼
                  ┌───────────────────┐
                  │  OCPP gateway      │
                  │  (1.6J / 2.0.1)    │
                  └─────────┬──────────┘
                            ▼
              ┌─────────────┴─────────────┐
              ▼                           ▼
      ┌───────────────┐          ┌────────────────┐
      │ Driver PWA     │          │ Operator        │
      │ (plan, live    │          │ dashboard       │
      │  savings bar,  │          │ (kW vs. limit,  │
      │  receipt)      │          │  Gantt, alerts) │
      └───────────────┘          └────────────────┘
```

**Fail-safe ladder:** live forecast → cached forecast (≤6h) → tariff-only → earliest-deadline-first → charger default (full power). Hardware max current is always set on the charger itself; the optimizer can only choose within it.

## Tech stack

| Layer | Choice |
|---|---|
| API | Python 3.12, FastAPI, WebSockets |
| Optimizer | `scipy.optimize.linprog` (HiGHS backend) |
| Charger protocol | [`mobilityhouse/ocpp`](https://github.com/mobilityhouse/ocpp) — OCPP 1.6 & 2.0.1 |
| Grid data | WattTime API (marginal emissions), gridstatus (CAISO), adapters for Electricity Maps / NESO |
| Session data | [ACN-Data](https://ev.caltech.edu/dataset) via `acnportal` (real workplace charging sessions) |
| Storage | PostgreSQL, Redis (pub/sub for live dashboards) |
| Frontend | React + Vite, PWA (driver app) |
| Ops | Docker Compose |

### Key API endpoints

```
POST /sessions                    {connector_id, departure_at, kwh_needed?}
POST /sessions/{id}/boost         → re-solve now at a premium
GET  /sessions/{id}/live          → live kW, grid cleanliness percentile, $/CO₂ saved
GET  /sites/{id}/plan             → per-connector 5-min kW profile, 24–48h
GET  /sites/{id}/impact?from&to   → kWh, $, kg CO₂ vs. charge-immediately baseline
```

## Demo script

1. **Normal day** — 40 simulated cars plug in over an hour; watch the scheduler spread charging into the solar window without ever exceeding the site's power limit.
2. **Boost** — a driver taps "need it sooner," jumps the queue, pays the premium.
3. **Early unplug** — a driver leaves before their stated deadline; the progress floor means they still leave with a usable charge.
4. **Oversubscribed lot** — more cars than the feed can serve at once; the scheduler degrades gracefully instead of failing.
5. **Signal outage** — grid data API goes down mid-demo; the fail-safe ladder kicks in, cached data → tariff-only → full power, never stranding a driver.

## License

MIT — see [LICENSE](LICENSE).

---

*Built in 48 hours. Every figure in the full proposal is cited to a public source (grid data, peer-reviewed research, tariff filings, and real deployment data from Caltech's ACN, Rivian, ev.energy, and Ava Community Energy).*

