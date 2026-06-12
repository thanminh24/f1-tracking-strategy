---
phase: 4
title: "Driver Head-to-Head Card"
status: pending
priority: P2
effort: "2d"
dependencies: [2]
---

# Phase 04: Driver Head-to-Head Card

## Overview

Side-by-side comparison card for two user-selected drivers. Shows gap, tire state,
last lap, stint age, pit count, and RL predicted action — at a glance without
scrolling the timing tower. Inspired by F1ReplayTiming + F1 Dashboard (f1dashboard.com).

## Requirements

### Functional
- Two driver selectors (dropdowns, populated from `state.cars`)
- Per-driver column: position, gap, last lap time, tire compound+age, pit count, RL action
- Delta row between the two drivers: gap between them (not to leader), lap time diff, tire age diff
- Updates live with each `race_state` tick
- Collapsible — toggle via button in strategy panel header

### Non-functional
- Data sourced entirely from existing Zustand stores (`useRaceStateStore` + `usePredictionStore`)
- No backend changes needed
- Keep under 150 LOC

## Architecture

Pure frontend component:
```
components/strategy/head-to-head-card.tsx
  ← useRaceStateStore (car states)
  ← usePredictionStore (RL actions)
  → renders 2-column comparison table
```

State: two `useState` hooks for selected car IDs; defaults to P1 vs P2.

## Related Code Files

- Create: `frontend/components/strategy/head-to-head-card.tsx`
- Modify: `frontend/components/strategy/strategy-panel.tsx` (mount between model-card and sc-gauge)

## Implementation Steps

1. Create `head-to-head-card.tsx`:
   - Two driver selectors (reuse same `<select>` pattern from strategy panel)
   - 3-row layout: left driver | metric label | right driver
   - Metrics: P, gap-to-leader, interval, last lap, tire (compound+age), pits, RL action
   - Delta row: interval between the two, lap time diff (color: green if A faster)
2. Mount in `strategy-panel.tsx` between `ModelCard` and `ScGauge`
3. Default selections: P1 and P2 from sorted car list

## Success Criteria

- [ ] Card renders with two driver columns and delta row
- [ ] Selectors correctly update both columns
- [ ] RL action shown for each driver (or "—" if not in predictions)
- [ ] Gap between selected pair correctly computed (not gap-to-leader)
- [ ] Updates smoothly without flicker on each state tick

## Risk Assessment

- Predictions may not include all drivers (only top N processed by RL model) — show "—" for action
- If both selectors choose the same driver, delta row shows all zeros — acceptable
