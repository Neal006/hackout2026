# WattWise driver app (`wattwise/`)

React + TypeScript + Vite + Tailwind. What the driver sees: "Ready by when?" at plug-in → the planned charging window and ETA → live kW → the receipt ($ and kg CO₂ vs charging at plug-in, labelled estimate). Boost ("charge now") is one button.

## Run

```bash
# backend first, from the repo root
python -m uvicorn noonshift.api:app --port 8000 --reload

cd wattwise
npm ci
npm run dev        # http://localhost:5174
```

Dev proxies REST and `/ws` to `localhost:8000` (`vite.config.ts`). Production build: set `VITE_API_URL`.

## Backend calls

| Action | Call |
|---|---|
| plug in | `POST /sessions {connector_id, departure_at, kwh_needed?}` |
| charge now | `POST /sessions/{id}/boost` |
| live view | `GET /sessions/{id}/live` + `/ws` frames |
| "why this hour" graph | `GET /grid/signal` |

Models: [`../docs/openapi.json`](../docs/openapi.json). Planned inputs (vehicle form, current %, emergency bands): [`../.docs/ROADMAP.md`](../.docs/ROADMAP.md) §1.

## Checks

```bash
npm run lint
npm run build      # runs tsc -b first, so this is also the type check
```