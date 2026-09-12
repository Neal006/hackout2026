# Demo script — 4 minutes, 7 beats, two screens

Left screen: **WattWise** (driver, http://localhost:5174). Right screen: **Noonshift Ops** (http://localhost:5173/ops/sites, "Live charging" tab). Backend: `SIM_SPEED=60 uvicorn noonshift.api:app --port 8000` so one sim-minute passes per real second (the default 480 plays the day in 3 minutes, too fast to narrate). Start the backend ~2 minutes before you talk so the sim is around 08:00 and the Gantt already has replayed cars on it.

Pre-flight (60 s, before the audience): `python scripts/smoke.py` prints `SMOKE OK`. Both browser tabs show "System Optimal · mode live · sim HH:MM" (ops sidebar) and "Local Sim: Tue …" (driver header). If either says offline, restart the backend.

| # | Beat | Do | Say | Audience sees (≤ 2 s) |
|---|---|---|---|---|
| 0 | 0:00 | Point at the ops Gantt | "This is a real Caltech workplace lot on a real California grid day. Every bar is a real car with a real departure time. Watch the solid part: charging is being held for the clean hours." | Gantt with ~30 planned (light) vs actual (solid) bars, deadline diamonds |
| 1 | 0:30 | Driver: **Connect Vehicle** → leave the pre-filled ready-by → **Find Optimal Charging** | "One question. Ready by when. That's the whole interface. The price is set by the slack you give us — the tier lights up as you move the time." | Modal: three price tiers, the earned one highlighted; then plan window + "charging HH:MM–HH:MM" |
| 2 | 1:00 | Ops: click the new row (highest `cNN`) | "Same second, the site sees it: energy needed, ready-by, deadline risk, and where the solver put it." | Side panel: Driver #, kWh, Scheduled HH:MM–HH:MM, Ready by, risk Low |
| 3 | 1:30 | Driver: **Charge** → **Charge Immediately** | "Boost. Jumps the queue, pays the premium. Nothing else changes for anyone." | Ops: red boost marker on that row; Alerts: "Boost requested (session N)" |
| 4 | 2:00 | Ops: **Driver leaves early** | "Tom said 17:00 and leaves now. The progress floor means he still leaves with a usable charge, and the plan re-solves without him." | Alert "Left early, X kWh short of stated need"; Gantt loses a row |
| 5 | 2:30 | Ops: **20 late arrivals** | "Twenty cars, two-hour deadlines, one 150 kW feed. Nobody is refused; the shortfall is shared fairly and the site never crosses its limit." | 20 new rows; Overview EV load rises but stays under the dashed limit |
| 6 | 3:00 | Ops: **Grid signal unavailable** → then **Restore grid signal** | "Kill the carbon feed. The ladder drops to the cached forecast and keeps every deadline; restore, and it comes back. It falls all the way to full power if we die entirely." | Amber banner "Fail-safe mode: cached" at the top; sidebar "System Degraded"; banner disappears on restore |
| 7 | 3:30 | Driver: **History** (or wait for the ready-by to pass) | "The receipt: kWh, dollars, kilograms, against the same car charged at plug-in. Labelled an estimate, method one tap away, and if a shortfall happened it says so." | History row: kWh, $, kg, "estimate · method"; ops Impact page shows the site totals |

Close (3:50): ops **Overview** — energy today, estimated savings, CO₂ avoided, peak avoided (est.) vs the charge-now baseline. "Same energy. Same deadlines. A third of the carbon. No driver did anything."

## If something breaks
- Driver "Could not plug in": the ready-by is behind the sim clock — pick a later time or just re-open the modal (it re-defaults to sim + 4 h).
- Ops shows "Not connected": backend down; `uvicorn` again, both pages reconnect on their own.
- A demo button 409s: nobody is charging yet (very early in the sim day) — plug the driver in first (beat 1), then retry.
- Everything else: `docker compose up` serves the built apps on :3000 / :3001 against the same API.
