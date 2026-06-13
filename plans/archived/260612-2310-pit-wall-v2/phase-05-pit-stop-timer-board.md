---
phase: 5
title: "Pit-Stop Timer Board"
status: pending
priority: P2
effort: "1.5d"
dependencies: []
---

# Phase 05: Pit-Stop Timer Board

## Overview

A small panel showing which cars are currently in the pit lane and how long they've been
there. Inspired by F1ReplayTiming. Adds real-time race drama — pit stops are decisive
strategy moments and the current UI has no special treatment for them.

## Requirements

### Functional
- List of cars currently with `status == "pitting" | "in_pit"` from `RaceState`
- Per-entry: driver code (team color), elapsed stop duration in seconds, estimated total stop (based on compound change heuristic)
- On exit (status reverts to "running"): flash the row green briefly, then remove
- Empty state: "No active pit stops"
- Placed at bottom of timing tower panel (below the standings table)

### Non-functional
- Duration tracked client-side using `t_session_s` delta from when status changed
- No backend changes needed
- Smooth elapsed counter via `requestAnimationFrame` or 250ms `setInterval`

## Architecture

```
components/pit-stop-timer-board.tsx
  ← useRaceStateStore (car statuses + t_session_s)
  → tracks per-car pit entry time via useRef map
  → renders active pit list with live elapsed time
```

Entry time tracking:
- On each state tick: if `car.status` flipped to `pitting`/`in_pit`, record `t_session_s` as entry time
- Elapsed = `current t_session_s - entry t_session_s`
- On exit: schedule brief highlight animation, then remove from map

## Related Code Files

- Create: `frontend/components/pit-stop-timer-board.tsx`
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (add below TimingTower in middle column)

## Implementation Steps

1. Create `pit-stop-timer-board.tsx`:
   - `useRef<Map<string, number>>` for pit entry times
   - `useEffect` on `state.cars` to detect status transitions
   - Render active pit list with elapsed seconds (update every 250ms with `setInterval`)
   - Flash animation on exit using CSS transition
2. Mount below `TimingTower` in middle column of `RaceView`

## Success Criteria

- [ ] Cars entering pit lane appear in board within one state tick
- [ ] Elapsed timer counts up correctly during pit stop
- [ ] Cars leaving pit lane disappear from board (with flash)
- [ ] Empty state shows correctly when no active pit stops

## Risk Assessment

- `t_session_s` steps discretely (once per replay tick); elapsed will quantize but remain readable
- Status may briefly flicker `in_pit` → `running` → `in_pit` — debounce removal with 2s delay
