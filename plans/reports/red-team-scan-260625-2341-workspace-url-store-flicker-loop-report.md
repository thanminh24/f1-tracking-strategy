# Flickering Bug — Red-Team / Code Review Scan

Date: 2026-06-25
Branch: main
Scope: frontend live/replay session view + supporting stores/feeders

## Symptom
"System keeps flickering" on the session dashboard.

## Root cause (fixed)
`frontend/app/session/[key]/session-dashboard.tsx` — two `useEffect`s introduced in
this overhaul bidirectionally sync workspace mode between the persisted Zustand
store (`useWorkspaceStore`, default `broadcast`, persisted to `localStorage`) and
the URL `?workspace=` param.

Each effect wrote *its own* current value to the other side whenever the two
differed:
- Effect A (URL→store): on any `searchParams` change, copies URL param into store.
- Effect B (store→URL): on any `workspaceMode` change, `router.replace`s URL.

When store and URL disagree on mount, they swap values every render forever:

```
render0: store=pit-wall, url=broadcast → A sets store=broadcast; B sets url=pit-wall
render1: store=broadcast, url=pit-wall → A sets store=pit-wall;  B sets url=broadcast
render2: store=pit-wall, url=broadcast  (== render0) → infinite loop
```

Each cycle remounts `BroadcastRaceView` ⇄ `PitWallRaceView` → visible flicker.

### Trigger (reproducible)
Persisted store = `pit-wall` (user previously switched), then open any link that
hardcodes `?workspace=broadcast` — e.g. the DEV FIXTURE link
(`/session/fixture?source=fixture&workspace=broadcast`) or a shared broadcast deep
link. Store and URL disagree → permanent flicker.

## Fix
Make the URL→store seed run **once** on mount (ref guard); keep the store as the
single source of truth that the URL mirrors one-directionally. Converges in ≤2
renders; no remount loop. Deep links still seed the correct workspace; header
workspace toggle still updates the URL.

File: `frontend/app/session/[key]/session-dashboard.tsx`
- Added `useRef` import.
- `didSeedWorkspace` ref guards the URL→store effect.
- store→URL effect unchanged.

## Verification
- `npx tsc --noEmit` → exit 0.
- Logic trace confirms convergence for all four (store × url) combinations.

## Other areas scanned (no flicker found)
- `router.replace/push` usages: only this file does bidirectional URL/store sync.
- Zustand selectors (race-state/prediction/telemetry stores): no new-object
  snapshots that would trip `useSyncExternalStore` re-render loops.
- WS frame batching (`ws-frame-batcher`, `feeder-client`): rAF-coalesced, fine.
- `useTrackGeo` / `track-map`: skeleton→map is a one-time transition, not a loop.
- `use-resizable-panels`, `live-schedule` clock: bounded/interval-driven, fine.
- Backend feeders all stamp `race_state.session_key` with the route key, so
  `isWaitingForCurrentSession` does not false-toggle the loading state.

## Unresolved questions
- None. If flicker persists after this fix, capture the exact route/URL and the
  persisted `f1-pw:workspace-mode` value to confirm a different path.
