# Noonshift documentation

Everything written by humans lives here. Generated API contracts live in [`../docs/`](../docs/) (`openapi.json`, `ws-frames.json`). The project README is at the [repo root](../README.md).

## Start here

| Read | If you want to |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | understand the control loop, the LP, the fail-safe ladder, OCPP, data — with diagrams |
| [ROADMAP.md](ROADMAP.md) | know what exists, what is missing, and in what order it gets built |
| [solutions.md](solutions.md) | see the real-world fix for each open problem, mapped to a file and a size |

## Business and evidence

| Read | Contents |
|---|---|
| [business.md](business.md) | what the repo proves and doesn't; break points; the 12 edge cases where a dumb charger wins; the emergency scale (§4b); the shared-savings pricing formula (§7b); site-owner value stack; revenue model; 4-tier benefits; hard questions |
| [metrics.md](metrics.md) | every number we report, its formula, and what the code needs to compute it — carbon, renewable share, air quality, grid friendliness, driver guarantees, money |
| [noonshift-proposal.md](noonshift-proposal.md) | the full proposal: problem, solution, five case studies, market research, limitations — every figure cited |
| [pitch/](pitch/) | [deck.md](pitch/deck.md) · [demo-script.md](pitch/demo-script.md) (4 minutes, 7 beats) · [hard-questions.md](pitch/hard-questions.md) |

## Operating

| Read | Contents |
|---|---|
| [HOSTING.md](HOSTING.md) | Render (backend) + Vercel (front-ends) on free tiers; sleep/keep-alive rules |
| [frontend_summary.md](frontend_summary.md) | what the two front-ends show and which backend field feeds each element |

## Team history (kept for the record)

[team-plan.md](team-plan.md) (the 48-hour lane split) · [neal-plan.md](neal-plan.md) and [neal-work.md](neal-work.md) (scheduler lane: status vs gates, LP deviations, edge-case→test matrix) · [README.backup.md](README.backup.md) (the pre-rewrite README).

## Conventions for writing here

- A number cites a reference that was actually opened, or a script in this repo that produces it. Secondary or abstract-only sources are marked.
- Impact figures are *estimates*, never certificates. A signal of `kind: "average"` is labelled as such.
- "We found no product doing X", never "none exists".
- Diagrams are Mermaid fenced blocks (` ```mermaid `) so GitHub renders them; validate with `mermaid@11` + jsdom if in doubt.
- Unverified claims are tagged **Assumption:** with the lookup that would settle them.
