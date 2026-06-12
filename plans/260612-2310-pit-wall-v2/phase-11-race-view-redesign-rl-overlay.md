---
phase: 11
title: "Race View Redesign — Pit Wall Layout + RL Per-Driver Overlay"
status: pending
priority: P0
effort: "3d"
dependencies: [10]
---

# Phase 11: Race View Redesign — Pit Wall Layout + RL Per-Driver Overlay

## Overview

Rework the session race view from the current 3-column grid to a layout inspired by the
f1-race-replay reference project: track map as the centerpiece, timing tower on the right,
RL strategy + driver info on the left. RL model predictions are blended directly into the
timing tower rows (pit window badge + recommended action chip) so strategy data is
never hidden behind a separate panel.

## Requirements

### Layout

The new race layout has three columns:

```
┌─────────────────────────────────────────────────────────┐
│ HEADER: F1Logo | Session | Mode Badge | Tabs             │
├─────────────────┬───────────────────────┬───────────────┤
│ LEFT 280px      │ CENTER flex-1         │ RIGHT 300px   │
│─────────────────│───────────────────────│───────────────│
│ Driver Focus    │ Track Map (Canvas2D)  │ Timing Tower  │
│  card (selected │  — crystal clear      │  + RL badges  │
│  driver detail) │  — driver labels      │               │
│                 │  — SC overlay         │               │
│─────────────────│───────────────────────│               │
│ Playback        │ Gap Chart             │               │
│ Controls        │ (compact 120px)       │               │
│─────────────────│───────────────────────│               │
│ Stint Bars      │ Race Control          │               │
│ (compact)       │ messages strip        │               │
└─────────────────┴───────────────────────┴───────────────┘
```

### Timing Tower RL Integration

Each timing tower row gains two inline elements:
- **Pit Window chip**: shows `pit_soon` / `pit_now` / `stay` label from `CarPrediction.recommended_action`; colored red for `pit_now`, amber for `pit_soon`, dim for `stay`
- **Window% bar**: micro progress bar showing `pit_window_probs[currentLap]` as fill width

On row **click/tap**: expand the row to show a mini RL detail panel beneath it:
```
┌──────────────────────────────────────────┐
│ HAM  ●  Soft    +3.2s     PIT NOW  ██░░ │
│                                          │
│  Expected Pit Lap: 28-31                 │
│  Next Compound: Medium 62% / Hard 38%   │
│  Outcome: +0.4 pos  Podium 71%          │
└──────────────────────────────────────────┘
```

### Driver Focus Panel (Left)

Clicking a driver row in the timing tower OR clicking a driver dot on the track map sets a
"focused driver". The left panel then shows:
- Driver name + number + team color bar
- Tire compound + age (laps on current set)
- Sector times (S1/S2/S3) for last lap
- RL recommendation (recommended_action + next_compound_probs)
- Expected pit window laps
- SC probability gauge (1-lap + 5-lap)

When no driver is focused: left panel shows gap chart (full height, more space).

### Race Control Strip

A narrow (32px tall) horizontal strip below the track map showing the 3 most recent race
control messages (Safety Car, VSC, DRS, etc.) as scrolling chips. Source: `RaceState.race_control`
messages (already in backend schema — add to frontend type if missing).

### Non-functional
- Track map canvas must rerender at 60fps during live; freeze gracefully during replay pause
- Timing tower rows animate position-swap with a 200ms CSS transition
- RL badges only visible when `prediction` store has data (hide gracefully otherwise)
- Right panel (timing tower) is scrollable when >10 drivers

## Architecture

```
app/session/[key]/session-dashboard.tsx
  └─ AppShell
       └─ RaceView (new layout)
            ├─ LeftPanel
            │    ├─ DriverFocusCard (components/race/driver-focus-card.tsx)
            │    ├─ PlaybackControls
            │    └─ StintBars (compact variant)
            ├─ CenterPanel
            │    ├─ TrackMap (enhanced — see phase-14)
            │    ├─ GapChart (compact, 120px height)
            │    └─ RaceControlStrip (components/race/race-control-strip.tsx)
            └─ RightPanel
                 └─ TimingTower (enhanced — RL badges + expandable rows)
```

State: add `focusedCarId: string | null` + `setFocusedCarId()` to `useRaceStateStore`.
Both `TrackMap` (dot click) and `TimingTower` (row click) write to `focusedCarId`.
`DriverFocusCard` reads from both `focusedCarId` + `useRaceStateStore` + `usePredictionStore`.

## Related Code Files

- Modify: `frontend/app/session/[key]/session-dashboard.tsx` — new 3-panel layout
- Modify: `frontend/components/timing-tower.tsx` — add RL badges + expandable row + focusedCarId click
- Modify: `frontend/components/track-map.tsx` — dot click → setFocusedCarId
- Modify: `frontend/lib/race-state-store.ts` — add `focusedCarId`, `setFocusedCarId`, `raceControlMessages`
- Modify: `frontend/lib/types.ts` — add `RaceControlMessage` type
- Create: `frontend/components/race/driver-focus-card.tsx`
- Create: `frontend/components/race/race-control-strip.tsx`
- Modify: `frontend/components/strategy/sc-gauge.tsx` — used inside DriverFocusCard
- Modify: `frontend/lib/feeder-client.ts` — parse `race_control` messages from WS frames

## Implementation Steps

1. Add `focusedCarId` + `raceControlMessages` to `race-state-store.ts`
2. Add `RaceControlMessage` type to `types.ts`; update `feeder-client.ts` to parse race_control frames
3. Rewrite `session-dashboard.tsx` `RaceView` into 3-panel layout (left 280px / center flex / right 300px)
4. Build `DriverFocusCard` — reads focused driver from store, renders meta + sector times + RL rec; renders gap chart when `focusedCarId === null`
5. Update `TimingTower` — add RL chips to each row (`recommended_action`, `pit_window_probs` bar); expandable row on click; emit `setFocusedCarId`
6. Update `TrackMap` — register pointer click on driver dot → `setFocusedCarId`
7. Build `RaceControlStrip` — renders last 3 `raceControlMessages` as scrolling chips below track map
8. Wire `GapChart` into center panel at compact 120px height

## Success Criteria

- [ ] 3-column layout renders correctly at 1440px+ viewport; degrades to 2-column at <1024px (hide left panel)
- [ ] Clicking a timing tower row highlights it and populates DriverFocusCard on the left
- [ ] Clicking a driver dot on the track map also highlights the row and populates DriverFocusCard
- [ ] RL chips (pit_now/pit_soon/stay) appear on each timing tower row when prediction data exists
- [ ] RL chips hidden gracefully when no prediction data (no layout shift)
- [ ] Race control strip shows last 3 messages; scrolls in when new message arrives
- [ ] Timing tower rows animate position changes with 200ms transition

## Risk Assessment

- `race_control` field may not exist in current `RaceState` schema — check `backend/src/f1_strategy/sim/race_state.py` and add field if needed; backend WS must emit it
- Driver dot click on Canvas2D requires hit-testing against `[x, y]` coordinates of each driver dot — implement with pointer event listeners on canvas + nearest-driver logic
- RL data from `usePredictionStore` arrives async; all RL-dependent UI must handle `prediction === null` gracefully
