# Live Switch, Telemetry Compare, Stats Fixes

## Context

- Frontend: Next.js 16, React 19, TypeScript, Tailwind.
- Backend live feed: `/ws/feed/live` with `source/auto` selecting livef1/OpenF1.
- Existing live route: `/session/live?source=live`.
- Existing archive telemetry API supports any `sessionKey/carId/lap`.

## Requirements

1. Switching from an archive race to live must not display stale archive cars, map, weather, or telemetry while live data loads.
2. Live route must use the latest live/current session metadata and feed, not the archive session key.
3. Telemetry compare must support up to five independent driver/lap traces, e.g. Hamilton lap 2 vs Verstappen lap 1.
4. Telemetry traces must use distinct colors and readable legends.
5. Stats screen must explain useful race intelligence in one coherent screen with clear sections and empty states.
6. Existing archive replay and live WebSocket contracts must remain compatible.

## Scope

- Modify frontend session, telemetry, stats, and store/client code.
- Add focused frontend tests for pure helper logic.
- Do not add new backend endpoints or change API response shapes.
- Do not redesign the whole app shell.

## Touchpoints

- `frontend/lib/race-state-store.ts`
- `frontend/lib/feeder-client.ts`
- `frontend/components/shell/header.tsx`
- `frontend/app/session/[key]/session-dashboard.tsx`
- `frontend/components/telemetry/*`
- `frontend/components/stats/*`

## Implementation Steps

1. Add a store method to clear session-specific live/archive data while preserving selected source.
2. On entering live mode, reset race state, predictions, and live telemetry before connecting `/ws/feed/live`; hide archive-only weather for `sessionKey === "live"`.
3. Replace primary/secondary telemetry selection with comparison slots capped at five.
4. Fetch telemetry for selected slot keys only; render color-coded trace lines and slot controls.
5. Rework Stats tab as a scan-friendly dashboard with top summary cards, pace ranking, stint strategy, and model/risk panels.
6. Add tests for telemetry slot key generation and pace/summary helpers.
7. Run targeted lint, tests, and frontend build.

## Success Criteria

- Live switch from Monaco/archive lands on `/session/live?source=live` and immediately clears Monaco state.
- Live screen shows live session label or a neutral waiting state until live feed arrives.
- Telemetry can compare five arbitrary driver/lap pairs with distinct colors.
- Stats screen states what each section means and works with empty live/archive data.
- `npm run build` passes; targeted lint/tests pass for changed files.

## Unresolved Questions

None.
