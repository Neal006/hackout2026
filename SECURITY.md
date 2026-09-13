# Security

## Reporting

Open a GitHub issue titled `security:` with **no exploit details**, and a maintainer will reply with a private channel. Do not post working exploits publicly. We aim to acknowledge within 72 hours.

## What this software controls

Noonshift sets per-connector power limits on EV chargers over OCPP. A bug or a compromise can **delay charging**; by design it cannot raise a charger above its own hardware maximum (`p_max_kw` is a ceiling the software only lowers). Treat any path that would let software exceed a hardware limit as a critical bug.

## Known gaps (pre-pilot)

These are documented, not hidden. Do not run this against real chargers on an open network until they are closed.

| Gap | Status | Fix |
|---|---|---|
| OCPP websocket accepts any charge point without authentication | open | OCPP 1.6 security profile 1: HTTP Basic auth on the upgrade, TLS at the reverse proxy — see `.docs/solutions.md` §13 |
| `/demo/*` and site endpoints have no auth | open | bearer token dependency in FastAPI |
| A backend outage falls back to full power on every connector | open | static "safe share" charging profile underneath the dynamic one — `.docs/solutions.md` §5 |
| No rate limiting on REST | open | reverse-proxy limits |

## Supported versions

`main` only. This is a hackathon-stage project; there are no releases yet.
