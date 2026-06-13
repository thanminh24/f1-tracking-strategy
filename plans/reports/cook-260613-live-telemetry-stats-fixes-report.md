# Live Switch, Telemetry Compare, Stats Fixes Report

## Summary

Implemented live-switch stale-state fix, five-slot telemetry comparison, and clearer Stats dashboard.

## Changes

- Live switch now routes to `/session/live?source=live`, clears stale archive state, predictions, and live telemetry before connecting.
- Session page remounts dashboard on session key change to prevent old telemetry slots leaking between races.
- Header hides archive-only weather widget for synthetic `live` session.
- Telemetry archive mode now supports up to five independent driver/lap traces with stable colors.
- Stats screen now presents one Race Intelligence dashboard: snapshot tiles, pace ranking, tyre plan, model outlook, safety-car risk.
- Added pure telemetry selection helper for slot creation and key generation.

## Adversarial Review

- Stale Monaco render: fixed by clearing global session stores and guarding mismatched `RaceState.session_key`.
- Live feed contract: unchanged; still uses `/ws/feed/live` and existing `/api/sessions/live/source/auto`.
- Archive telemetry contract: unchanged; still fetches `/api/sessions/{key}/telemetry/{car}/{lap}`.
- Multi-slot blast radius: contained to telemetry components and helper.
- Stats blast radius: contained to `StatsTab`; existing child stats components reused.

## Verification

- Targeted ESLint on touched files: passed.
- `npm run build`: passed.
- Extreme telemetry selection test: passed with 6 drivers, 3 laps each, 5 selected slots, unique colors.
- Full `npm run lint`: still fails on unrelated existing files outside this change.

## Unresolved Questions

None.
