# Contributing to Noonshift

Thanks for looking. This is a small codebase with a few hard rules; read this once and you will not get surprised in review.

## Setup

```bash
python -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
python -m pytest                                 # must be green before you start
```

Front-ends: `cd web && npm ci` (ops dashboard), `cd wattwise && npm ci` (driver app). Node 22.

## What CI checks on every PR

| Check | Command |
|---|---|
| Unit + full-day replay tests | `python -m pytest` |
| The headline number still holds | `python scripts/prove.py` (gate: CO₂ saving ≥ 15 %, 0 solver fallbacks) |
| End-to-end flow | `uvicorn noonshift.api:app --port 8000 &` then `python scripts/smoke.py` |
| API contract is committed | `git diff --exit-code -- docs/openapi.json docs/ws-frames.json` — the API regenerates both on start; run the server once and commit the diff if you changed a model |
| Front-ends lint and build | `npm run lint && npm run build` in `web/` and `wattwise/` |

Run what you touched locally before pushing. `prove.py` and the day replay take ~1 minute each.

## Rules that matter here

1. **The scheduler contract is frozen.** `solve(cars, site, signal, tariff, now)`, `impact(...)`, `price(...)` keep their signatures and their dict shapes. Add keyword-only arguments with defaults, or new functions. Never change what an existing caller receives.
2. **Every regression gets a test that fails on the old code.** If the day replay found it, `tests/test_day.py` gets a case; if the LP found it, `tests/test_scheduler.py` does.
3. **Never pause a car.** IEC 61851 minimum is 6 A ≈ 1.4 kW (`MIN_KW`). Allocations round *up*, never to zero. Some EVs never resume after a pause.
4. **Software lowers power, never raises it above hardware.** The charger's own max current is the ceiling; nothing in this repo may set a limit above `p_max_kw`.
5. **scipy stays 1.14.x.** 1.15's HiGHS bindings took 66 s per solve on Windows. `tests/test_perf.py` trips if the pin is lifted.
6. **Numbers cite sources.** A figure in a doc points at a reference that was actually opened, or at a script in this repo that produces it. Impact numbers are *estimates*, never certificates. Say "we found no product doing X", never "none exists".
7. **Signal and sessions must be from the same grid.** California sessions ↔ CAISO signals. A signal of `kind: "average"` is labelled as such everywhere it is shown.
8. **Additive API changes only** while the front-ends are being built. New optional fields, new endpoints — not renamed or removed ones.

## Style

Match the file you are in. Python: comments explain *why*, constants carry their unit and the reason for the value (see the top of `noonshift/scheduler.py`). No new dependencies for what ten lines can do. If you cut a corner deliberately, mark it `# ponytail: <ceiling>, <upgrade path>` so it can be found later.

## Pull requests

- One topic per PR. Title in the imperative: `feat: per-car power cap from vehicle form`.
- Say what you measured. If you touched the scheduler, paste the `prove.py` table before and after.
- If you changed a WebSocket frame or a REST model, say so in the PR body — both front-ends consume them.
- Fill in the template; delete sections that do not apply.

## Where things are

| | |
|---|---|
| `noonshift/scheduler.py` | the LP; module-level constants with their reasons at the top |
| `noonshift/api.py` | FastAPI app, control loop (`step`, `resolve`), fail-safe ladder (`pick_mode`), demo endpoints |
| `noonshift/sim.py` | simulated day: 1-minute clock, connectors, battery taper |
| `noonshift/ocpp_gateway.py` | OCPP 1.6J CSMS side and a fake charge point for tests |
| `noonshift/models.py` | pydantic REST bodies and WS frames — the contract with the front-ends |
| `scripts/` | `prove.py`, `fetch_data.py`, `smoke.py` |
| `.docs/` | architecture, roadmap, business, metrics, pitch |

Questions: open an issue. Security: see [SECURITY.md](SECURITY.md).
