## What

## Why

## Measured
<!-- If the scheduler changed: paste the `python scripts/prove.py` table before and after. -->

## Checklist
- [ ] `python -m pytest` green
- [ ] `python scripts/prove.py` gate PASS (if scheduler / data touched)
- [ ] `docs/openapi.json` / `docs/ws-frames.json` regenerated and committed (if a model changed)
- [ ] front-end `npm run lint && npm run build` green (if `web/` or `wattwise/` touched)
- [ ] no change to the frozen signatures (`solve`, `impact`, `price`); additive REST/WS only
- [ ] any regression found has a test that fails on the old code