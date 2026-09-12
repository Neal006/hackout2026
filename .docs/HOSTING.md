# Hosting

Backend on **Render** (free), front-end on **Vercel** (free). $0. The live judging demo still runs locally with `docker compose up` — do not put a 4-minute demo behind a cold start.

## Why this split

The API is a stateful always-on process (sim clock, control loop, WebSocket stream), so it needs a container, not serverless. Render's free web service runs our Dockerfile. The front-end is a static Vite build, which Vercel serves for free with no sleeping.

## Backend: Render

Repo root has `render.yaml` (Blueprint): one Docker web service + one free Postgres.

1. https://dashboard.render.com → **New → Blueprint** → connect `Neal006/hackout2026` → Apply. No card needed.
2. First build takes ~5 min (scipy). Service URL looks like `https://noonshift-api.onrender.com`.
3. Check: `https://noonshift-api.onrender.com/health` → `{"ok":true}`, `/docs` for OpenAPI.

What to expect on the free tier:

| | |
|---|---|
| Box | 512 MB RAM, 0.1 CPU. `SIM_SPEED=120` (12-min day) so the loop keeps up once the real LP lands. |
| Sleep | Spins down after 15 min with no HTTP request **and no incoming WebSocket message**. Wake-up ≈ 1 min; the sim restarts at 06:00. |
| Keep-alive | The front-end must send any text on `/ws` every ~30 s (`ws.send("ping")`). The server ignores it; Render counts it as activity. |
| Postgres | Free DB expires **30 days** after creation, then 14 days grace, then deleted. The API runs without a DB (`DATABASE_URL` unset → writes are no-ops), so an expired DB does not break the demo. Recreate via Blueprint if needed. |
| Filesystem | Ephemeral. `docs/openapi.json` is regenerated on every start; nothing else is written. |
| OCPP | Off (`OCPP=0`). 60 in-process charge points on 0.1 CPU is not worth it. |

Env vars are set in `render.yaml`; override in the dashboard under Environment if needed.

## Front-end: Vercel

`web/` is a Vite app (Nandini). Vercel auto-detects it.

1. https://vercel.com/new → import `Neal006/hackout2026` → **Root Directory: `web`** → Framework: Vite.
2. Environment variables (Production + Preview):
   ```
   VITE_API_URL=https://noonshift-api.onrender.com
   VITE_WS_URL=wss://noonshift-api.onrender.com/ws
   ```
3. Deploy. Every push to `main` redeploys.

Front-end code must read those two vars instead of hard-coding `localhost:8000`; locally they default to `http://localhost:8000` and `ws://localhost:8000/ws`. Use `wss://` (not `ws://`) against Render or the browser blocks the mixed-content connection.

The API sends `Access-Control-Allow-Origin: *`, so any Vercel preview URL works without config.

## Submission link

Give judges the Vercel URL. Open it yourself ~2 min before they do so Render is awake.

## If Render's free box is too slow

Set `SIM_SPEED=60` (24-min day) in the Render dashboard, or move the API to Railway Hobby ($5/mo, no sleep, full CPU): New Project → Deploy from GitHub → add Postgres plugin → set `SIM_SPEED=480`. Nothing else changes.
