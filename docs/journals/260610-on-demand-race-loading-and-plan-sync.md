# On-Demand Race Loading + Plan Sync

## Summary
- Added archive-first session ensure path for `/api/sessions/{session_key}/ensure`.
- Direct replay pages now auto-load missing race sessions from FastF1 before WS replay starts.
- Home page now supports loading a race by year/round without requiring archive browsing.
- Added `f1-build-archive-db`, `make build-archive-db`, and shell wrappers for backfill/db build.
- Fixed phase 6 simulator parameter mismatch by adding backward-compatible `lap1_extra_ms`.
- Updated plan todos: phase 6 remains blocked on validation-gate report.

## Verification
- `cd backend && uv run pytest -q` → 38 passed.
- `cd backend && uv run ruff check .` → passed.
- `cd frontend && npm run lint` → passed.
- `cd frontend && npm run build` → passed.

## Unresolved Questions
- Confirm backfill job `bvx43hahr` final status.
- Generate and review phase 6 validation-gate report before phase 7 starts.
