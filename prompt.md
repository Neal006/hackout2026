# Handoff prompt for Neal → Claude Code

Paste everything below this line into Claude Code, from the repo root, on a fresh branch.

---

You are working in the Noonshift repo (`Neal006/hackout2026`). Before writing any code, read these in order — they are the spec, and every decision below points back to them:

1. `AGENTS.md` (conventions, frozen contracts, gotchas — non-negotiable)
2. `README.md`, `.docs/ARCHITECTURE.md` (what exists; the control loop, the LP, the ladder, OCPP)
3. `.docs/business.md` §0b, §4, §4b, §7b, §9b (the customer, the emergency model, the pricing formula, the corporate deal)
4. `.docs/solutions.md` (each fix with its file and size — this is the implementation map)
5. `.docs/metrics.md` §3, §4, §6, §6b (what the dashboard and receipts must be able to show)
6. `.docs/ROADMAP.md` §1–§3 (driver inputs, emergency rules)
7. `web/src/context/GlobalStateContext.jsx` and `web/src/components/AppShell.jsx` (how the ops dashboard gets its data)

Run `python -m pytest` and `python scripts/prove.py` first and keep both green throughout. CI (`.github/workflows/ci.yml`) must pass on every PR: pytest, prove gate, smoke, contract-file diff, both front-end builds.

## Ground rules

- **Frozen contract:** `solve(cars, site, signal, tariff, now)`, `impact(...)`, `price(...)` keep their signatures and dict shapes. Extras are keyword-only with defaults. New per-car fields are optional keys with defaults.
- **Additive API only:** new optional fields and new endpoints. Never rename or remove a REST field or a WS frame field — both front-ends consume them. After changing any model, start the server once and commit the regenerated `docs/openapi.json` / `docs/ws-frames.json`.
- **Every logic change ships with a test that fails on the old code.** Scheduler → `tests/test_scheduler.py`; day behaviour → `tests/test_day.py`; API → extend `scripts/smoke.py`.
- **Never pause a car** (`MIN_KW = 1.4`), **never exceed a hardware limit**, **scipy stays 1.14.x**.
- One PR per work package below, in this order. Paste the `prove.py` table before/after in every PR that touches the scheduler.
- Numbers in docs cite a source or a script. Impact figures are estimates. Label `kind: "average"` signals as such.
- Where this prompt says **Assumption**, confirm with the team in the PR description; do not silently decide.

## The customer, in one paragraph (drives every UI word)

A company that owns its office building and the chargers in its lot, pays the building's electricity bill, and lets employees charge — usually free (`R = $0`), sometimes at a flat employee rate. The operator using the dashboard is the **facilities manager**; the co-signer is the **sustainability lead**. They care about: no new building peak, more ports on the same feed, every employee leaving charged, port fairness, and an hourly CO₂ record for Scope 2 / Scope 3 cat 7. They do not care about $/kWh tiers. (`business.md` §0b.)

---

## WP1 — Pricing and emergency (scheduler + API)

**1.1 `price()` → shared-savings formula** (`business.md` §7b). Keep the signature `price(slack_hours)` working for old callers; add `price(slack_hours, *, r=None, saving_usd=0.0, kwh=0.0, alpha=0.5, urgent=False)`. Returns `{tier, usd_per_kwh}` where `usd_per_kwh = R − alpha × max(saving_usd, 0) / max(kwh, ε)`, clamped to `[0, R]`; `urgent=True` or `slack < 1 h` → exactly `R`. `R` comes from `site.json: employee_rate_usd_per_kwh` (**Assumption:** default `0.0` = free workplace charging; confirm). Tier label stays `boost | standard | green` by slack for the UI. Remove the hardcoded `0.40 / 0.25 / 0.18`.
`api.session_out()` passes the session's `saved_usd` and `kwh_delivered` from `S["impact"]`.
Tests: price never exceeds R; urgent = R; zero saving → R; Caltech-day numbers reproduce `metrics.md` §6b (0.3 ¢/kWh at α = 0.5).

**1.2 Emergency endpoint with three bands** (`business.md` §4b). `POST /sessions/{id}/urgency {level: "now" | "soon" | "priority", leave_at?: datetime}`.
- `now` → `departure = now`, session `boost = True` (existing ASAP path).
- `soon` → `departure = leave_at` (must be ≥ now + 15 min, else treat as `now`).
- `priority` → departure unchanged; per-car `floor_alpha = 0.9`, `priority = 2.0`.
All three set `session["urgent"] = True` so `price()` returns R. Keep `/sessions/{id}/boost` as an alias for `now`. Emit `EventMsg name="urgency"` with `{session_id, level}` so the ops dashboard can alert.
Scheduler: add keyword-only per-car keys `floor_alpha` (default `ALPHA`) and `priority` (default 1.0) in `solve_lp`: `floor_alpha` replaces `ALPHA` in the rule-2 rows for that car; `priority` multiplies that car's shortfall cost `M_SHORT` and its `Z` coupling so it gives way last.
Tests: `now` → full power next slot; `priority` car holds ≥ 90 % pro-rata at every checkpoint; oversubscribed lot with one priority car → its shortfall is 0 while others share.

**1.3 First-hour floor** (`business.md` §4). New constraint: energy delivered by 60 min after arrival ≥ `min(kwh_needed, FIRST_HOUR_KWH)` with `FIRST_HOUR_KWH = 3.5`, elastic through the existing `F(i)` slack. Then run `python scripts/prove.py` and put the CO₂ cost of the floor in the PR (expected 2–3 %; it must stay under the 15 % gate).
Test: a car that plugged in at 08:30 with departure 17:30 has ≥ 3.5 kWh at 09:30 on the real day.

**1.4 Never-worse-than-dumb-charger over any 60-min window** as a test in `tests/test_day.py` (compare kWh delivered per car in each rolling hour after plug-in against `min(need, p_max × 1 h)` — with the first-hour floor this only needs to hold for the first hour; assert exactly that and document why).

## WP2 — Fail-safe that an inspector accepts (`solutions.md` §5)

- `site.json` gains `safe_share_kw` (default computed: `min(p_max_kw, (feed_kw − max(building_load_kw)) / n_connectors)`).
- `pick_mode("full")` and `scheduler._full_power()` return `safe_share_kw` per connector, not `p_max_kw`. `apply_limits()` likewise when no plan exists.
- `ocpp_gateway.OcppConnector`: on boot send a `TxDefaultProfile` at `stack_level 0` with `safe_share_kw` and no expiry; `set_limit()` sends the dynamic profile at `stack_level 1` with `valid_to = now + 15 min`. Self-check (`python -m noonshift.ocpp_gateway`) asserts both profiles are on the fake charge point and that dropping the CSMS leaves the static one.
- Test: kill the control loop mid-day in `tests/test_day.py` (stop calling `step()`, advance connectors with the last limits) and assert site EV kW ≤ `feed − building` for the rest of the day and ≤ `n × safe_share_kw`.
- `/sites/{id}/status` gains `safe_share_kw`.

## WP3 — Cars, needs, queues (`solutions.md` §3, §10, §11)

- `POST /sessions` accepts optional `vehicle: {model?, battery_kwh?, max_kw?}`, `soc_now?`, `target_soc?` (default 1.0). `api.car()` uses `p_max_kw = min(connector.p_max_kw, vehicle.max_kw)`; `kwh_needed = (target_soc − soc_now) × battery_kwh` when given; carry `need_confidence: "declared" | "history" | "site"` on the session (history = that connector's median; site = 10.6).
- **Observation guard** in `api.step()`: after 5 sim-minutes at limit `L`, if metered kW `< 0.8 L`, set the connector's `p_max_kw = metered × 1.05` for the rest of the session and emit `EventMsg name="cap_observed"`.
- `site.json: connectors_asap: [...]` — those connectors get `boost = True` in `api.car()` (fleet bays never deferred).
- **Done + move-by:** when a session reaches `kwh_needed`, emit `EventMsg name="done"` (already flips status; make the event explicit) and set `idle_since`. Add `Sim.waiting` (arrivals with no free connector queue instead of being dropped) and, in `resolve()`, if `waiting` is non-empty, set the departure of the plugged car with the most slack to `now + e_rem / p_max` (never a car with < 1 h slack, never an urgent car). `MeterMsg` connectors gain `idle_min`.
- Tests: 3.3 kW car on a 7 kW bay meets its deadline; observation guard trips on a simulated slow car; queue of 3 → the slackest car is tightened and a bay frees.

## WP4 — Evidence (`solutions.md` §0, §6; `ROADMAP.md` §5) — scripts only

- `prove.py --policy timer`: third policy, full power 09:00–14:00 else `MIN_KW`; print LP delta over it.
- `prove.py --block 50 --feed 80`: overrides; print $ overage, kWh shortfall, and what mode `full` would have done.
- `fetch_data.py signal --forecast`: store WattTime's forecast for the day in `data/signal_forecast.json`; `prove.py --forecast` plans on it and scores on `data/signal.json`. Print both. If WattTime Basic cannot return a historical forecast, say so in the PR and leave the flag wired for a live day.
- `fetch_data.py signal` also stores `health_damage` ($/MWh) when present; `impact()` gains `health_usd` (keyword-only extra; `metrics.md` §4).
- `prove.py` prints renewable-hour share `Σ_{MOER=0} E / Σ E` for both policies (`metrics.md` §3) and the stated-vs-actual departure stats (`solutions.md` Fact 1).
- `scripts/fit.py <sessions.csv|json>` → `cash tiers | perks only | not a fit` (`solutions.md` §4).
- `scripts/replay_days.py --days 2026-04-14,2026-07-15,2026-01-20,...` → min/median/max table for CO₂, $, peak.

## WP5 — Ops dashboard (`web/`) for the facilities manager

**Rule for every element:** it is fed by a backend field (`docs/ws-frames.json`, `docs/openapi.json`) or it goes. No fixed marketing copy. Keep the current routes; change what they say.

- **Overview:** top row = *Building + EV load vs contracted peak* (new: `status.contracted_peak_kw` from `site.json`, **Assumption:** default = `feed_kw`), *Ports on this feed* (`n_connectors` vs `feed_kw / 7`), *Employees charged today / at risk*, *kg CO₂ avoided today* (first), *$ saved* (second, small). Renewable-hour share as a ring (`impact.renewable_share`, add to `ImpactOut`). Mode badge from the ladder; when mode ≠ live show which rung and why.
- **Offline state:** when `!connected`, the banner says exactly: *"Backend offline — run `python -m uvicorn noonshift.api:app --port 8000` from the repo root, then reload."* (`GlobalStateContext.jsx:213`).
- **Sessions:** add columns `urgency` (band), `need_confidence`, `idle_min`; row highlight for `risk === 'High'`; a **Urgency** action per row that calls `POST /sessions/{id}/urgency` (three buttons, confirm dialog — do not use `window.confirm`; use an inline confirm).
- **Chargers:** show `safe_share_kw` next to `p_max`; observed cap when `cap_observed` fired.
- **Alerts:** `urgency`, `done`, `cap_observed`, ladder changes, `waiting` queue length > 0. Resolve stays client-side.
- **Energy & Impact:** hourly bar of kWh coloured by MOER bucket (0 / < 200 / ≥ 200 g/kWh) from `GET /grid/signal` + `meter_ticks`; the CO₂ equivalents from `metrics.md` §2 (km, trees) computed client-side from `saved_kgco2` with the constants in that file, labelled *estimate*; **Export ledger (CSV)** button → new `GET /sites/{id}/impact.csv?from&to` (`solutions.md` §12).
- **Tariffs:** show `R` (employee rate), the package the site is on (`site.json: package: "capacity" | "clean-hours" | "pilot"`, **Assumption:** default `pilot`), and this month's `β × Σ saved_usd` line so the fee is visible next to the saving.
- **Schedules (Gantt):** mark urgent cars and `connectors_asap` bays; draw the contracted-peak line on the site chart.
- **Mobile:** 400 px pass by eye on every page; no horizontal scroll except tables in their own `overflow-x: auto`.
- Delete anything with hardcoded numbers or copy that no backend field feeds. `npm run lint && npm run build` must pass.

## WP6 — Operator assistant (chatbot in the ops dashboard)

Goal: a facilities manager types *"why is bay c07 only getting 1.4 kW?"* or *"what happens if the grid API dies?"* and gets a short, correct answer grounded in **live site state + repo docs**, with a link to the page that shows it. It **explains and suggests; it never executes** an action — the operator clicks.

### Backend: `POST /assist`

Body `{question: str, history?: [{role, content}], page?: str}`. Response `{answer: str, sources: [str], suggested_actions: [{label, path}]}`. Also `GET /assist/suggestions` → 6 starter questions built from current state (e.g. "3 sessions are at risk — why?").

**Snapshot builder** `noonshift/assist.py: snapshot()` — a plain dict from `S`, no I/O: `sim_time`, `mode` + ladder flags, `site` (feed, block, contracted peak, safe share, n connectors, package, R), `impact` (all `ImpactOut` fields + renewable share + health_usd), `status`, per-connector rows (id, session id, kW now, plan kW next 6 slots, kWh delivered/needed, departure, slack h, urgency, risk, idle_min, cap observed), `waiting` count, last 20 events, today's signal summary (min/max/mean MOER, hours at 0, signal kind + source), tariff summary (price bands, block). Cap it at ~6 k tokens; truncate connector rows to the 15 most relevant (at risk, urgent, charging, idle) plus counts.

**Knowledge** `noonshift/assist_knowledge.md` — one static file, assembled by hand from: README "What it does" + "Demo", `ARCHITECTURE.md` §2–§5, `business.md` §0b + §4b + §7b (formulas only), `metrics.md` §2 constants + §3 + §6, `.docs/pitch/hard-questions.md`. ~4 k tokens. This is the cached system prefix; never put anything time-varying in it.

**Model call** — Anthropic Python SDK (`pip install anthropic`; add to `requirements.txt`). Follow this exactly:

```python
import anthropic, os
client = anthropic.Anthropic()   # reads ANTHROPIC_API_KEY

SYSTEM = [
    {"type": "text", "text": ASSISTANT_RULES, "cache_control": {"type": "ephemeral"}},   # frozen: role + rules
    {"type": "text", "text": KNOWLEDGE,       "cache_control": {"type": "ephemeral"}},   # frozen: assist_knowledge.md
]
# volatile content goes AFTER the cached prefix, in the user turn:
messages = history + [{"role": "user", "content": f"<site_state>{json.dumps(snapshot, sort_keys=True)}</site_state>\n<page>{page}</page>\n{question}"}]

resp = client.messages.create(
    model="claude-opus-5",
    max_tokens=1024,
    thinking={"type": "adaptive"},
    output_config={"effort": "low"},          # chat over a snapshot: low is enough; raise if answers get shallow
    system=SYSTEM,
    messages=messages,
)
answer = "".join(b.text for b in resp.content if b.type == "text")
```

`ASSISTANT_RULES` (write it, ~300 words): you are the Noonshift operator assistant for a facilities manager; answer only from `<site_state>` and the knowledge text; if the state does not contain the answer, say what page or endpoint would; every number that is an estimate is called an estimate; never claim a certificate; never say an action was taken — end with at most two *suggested actions* as `label → /ops/<page>`; keep answers under 120 words unless asked for detail; when asked "what if X fails", walk the ladder; when asked about money, use §7b and the site's R and package; do not speculate about other sites or the grid outside today's signal. Include the one-line instruction: *"If no tool or state can answer what was asked, say so instead of guessing. Do not include internal XML tags in your response."*

Parse `suggested_actions` from the answer's trailing `label → /ops/...` lines (regex); strip them from `answer`. `sources` = the knowledge section headers the answer used (ask the model to end with `[sources: …]`; strip it).

**Error handling:** most-specific first — `anthropic.AuthenticationError` and missing key → fallback (below); `anthropic.RateLimitError` → 429 to the client with `retry-after`; `anthropic.APIStatusError` ≥ 500 and `anthropic.APIConnectionError` → fallback with `"degraded": true`. Log `resp._request_id` on failures. Server-side rate limit: 10 requests/min per client IP. Same bearer-token dependency as the ops endpoints (add one in this WP if not yet present: `OPS_TOKEN` env; when unset, allow — it is a demo).

**Deterministic fallback** `assist.fallback(question, snapshot)` — no network, so the demo never depends on a key or the internet. Keyword-route the ~12 questions in `/assist/suggestions` and `.docs/pitch/hard-questions.md` to template answers filled from the snapshot (site load vs limit, at-risk sessions and why, mode/ladder explanation, what Boost/urgency does, kg and km today, why a bay is at 1.4 kW, what happens on outage, what the safe share is). Unknown question → "I can answer about today's site state and how Noonshift works; try one of: …" with the suggestions. Response carries `"fallback": true` so the UI can label it.

**Prompt caching check:** in a test with the key present (skip if absent), two consecutive calls must show `usage.cache_read_input_tokens > 0` on the second. If not, something volatile crept into `SYSTEM`.

**Tests:** `tests/test_assist.py` — `snapshot()` size cap and required keys; fallback answers for each suggestion; the `label → path` parser; the endpoint via `scripts/smoke.py` (POST a question with no key → `fallback: true`, 200).

### Frontend: chat drawer in `web/`

- A floating button (bottom-right, `?` / "Ask") in `AppShell.jsx` opens a right-side drawer (360 px; full-width under 640 px). Not a route — it overlays every page and keeps its history in React state (persist to `sessionStorage` in try/catch).
- Message list; input with Enter to send; six suggestion chips from `GET /assist/suggestions` refreshed when the drawer opens; each answer shows `sources` as small tags and `suggested_actions` as buttons that `navigate(path)`; a `fallback` / `degraded` answer shows a muted "offline answer" tag.
- Send `page: location.pathname` and the last 6 turns as `history`.
- Loading state; error state with retry; never `window.alert`/`confirm`.
- Style: match the existing dashboard tokens; theme-aware; no new dependencies (fetch + React state).
- `npm run lint && npm run build` green.

### Cost note for the PR

Each question ≈ 10 k cached input + 1–2 k uncached + ≤ 1 k output on `claude-opus-5` ≈ $0.03–0.05 with cache hits. Put the observed `usage` from one real call in the PR.

## WP7 — Docs and memory

- `README.md`: add the new endpoints to the API block; one paragraph on the assistant under Demo.
- `.docs/ARCHITECTURE.md`: §7 contracts updated; a short §9 "Operator assistant" (snapshot → cached knowledge → model → fallback; a 6-line Mermaid sequence; validate the block with `mermaid@11` + jsdom as `AGENTS.md` says).
- `CHANGELOG.md` Unreleased; `AGENTS.md` File Map + Changelog rows; `.docs/ROADMAP.md` §0 status table flipped to "Exists" where done.
- Regenerate and commit `docs/openapi.json`, `docs/ws-frames.json`.

## Definition of done

`python -m pytest` green (new tests included) · `python scripts/prove.py` PASS with the first-hour floor in · `scripts/smoke.py` prints `SMOKE OK` including `/assist` · both front-ends lint + build · CI green on the PR · every **Assumption** above answered in a PR description · no hardcoded prices anywhere · `git grep -n "0.40" noonshift/` returns nothing.

## What not to do

No new frontend dependencies for the chat (no UI kits, no markdown renderers — plain text with line breaks is fine). No ChargePoint/closed-network integrations. No bookings-ahead-of-arrival (post-pilot). No V2G. No separate "chatbot service" — `/assist` lives in `api.py` with the rest. Do not change `SPEED`/`SIM_SPEED` semantics. Do not touch `wattwise/` in these PRs except to keep it building.

Work through WP1 → WP7 in order. Start by printing the current `prove.py` table so the "before" is on record.
