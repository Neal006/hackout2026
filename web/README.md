# Noonshift ops dashboard (`web/`)

React + Vite. Shows what the site operator sees: Gantt of every connector's plan, live site kW vs feed vs tariff block, sessions, alerts, impact (kWh, $, kg CO₂ vs charge-now), the fail-safe ladder banner, and the four demo buttons.

## Run

```bash
# backend first, from the repo root (otherwise every request logs ECONNREFUSED)
python -m uvicorn noonshift.api:app --port 8000 --reload

cd web
npm ci
npm run dev        # http://localhost:5173
```

Dev proxies `/api/*` → `http://localhost:8000` and `/ws` → `ws://localhost:8000/ws` (see `vite.config.js`), so the app is same-origin. For a production build set `VITE_API_URL` to the backend's public URL (`src/context/GlobalStateContext.jsx`).

## Data contract

Every element on screen is fed by a backend field. REST models and WebSocket frames: [`../docs/openapi.json`](../docs/openapi.json), [`../docs/ws-frames.json`](../docs/ws-frames.json). Frames: `PlanMsg` (plan), `MeterMsg` (live), `EventMsg` (plug_in / unplug / done / boost / day_reset). The WebSocket reconnects on close; `systemStatus` reads `Offline` until the backend is up.

## Checks

```bash
npm run lint       # oxlint
npm run build      # CI runs both
```

Ports: this app `5173`, the driver app (`../wattwise`) `5174`, Docker `3000` / `3001`.