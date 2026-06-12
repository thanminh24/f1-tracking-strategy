---
phase: 9
title: "What-If Explorer v2"
status: pending
priority: P2
effort: "2-3h"
dependencies: [8]
---

# Phase 9: What-If Explorer v2

## Overview

Redesign the what-if panel into a proper scenario comparison tool. The existing panel
(`what-if-panel.tsx`) has basic controls but no side-by-side scenario output and no
compound selector. v2 adds: driver picker, compound selector, pit-now vs pit-on-lap-N
delta table, and a "run scenario" button that fires the backend what-if endpoint and
renders a results card.

## Requirements

**Functional:**
- **Driver selector**: dropdown of all running drivers; pre-selects the driver whose
  PPO card was clicked (pass `car_id` from strategy overlay as initial state)
- **Scenario controls**:
  - "Pit Now" button — runs what-if with current lap as pit lap
  - "Pit on Lap N" input — numeric input 1..total_laps
  - Compound selector — three buttons: SOFT / MEDIUM / HARD with compound colors
- **Scenario results card**: shows for the selected driver:
  - Expected finish position (before vs after pit)
  - Position gain/loss delta (`Δ {+2}` in green, `{-1}` in red)
  - Estimated time to race end with this strategy vs current trajectory
  - Win/Podium/Points probability bars (same MC outcome format as phase 8)
- **Comparison mode**: run two scenarios side-by-side; "Add scenario" button adds a
  second column; max 2 columns
- **Auto-scenario**: when PPO recommends PIT_SOFT/MEDIUM/HARD, auto-populate the
  what-if panel with that suggestion and show "PPO suggests" badge

**Non-functional:**
- What-if calls are debounced (300ms after input change); not fired on every keystroke
- Results card shows loading spinner during backend call
- Panel state persists across WS reconnects (stored in component state, not Zustand)

## Architecture

```
WhatIfPanel (redesigned)
  ├── DriverSelector          dropdown (running drivers from RaceState)
  ├── ScenarioBuilder
  │     ├── CompoundSelector  3 pill buttons (SOFT/MEDIUM/HARD)
  │     ├── PitLapInput       number input + "Pit Now" shortcut
  │     └── RunButton         calls POST /api/whatif/{session_key}
  ├── ScenarioResultCard      outcome + delta display
  │     ├── PositionDelta     Δ position (before vs after)
  │     ├── OutcomeBars       win/podium/points probability
  │     └── PPOBadge          "PPO suggests this" when action matches rec
  └── CompareColumn           optional second scenario column

Backend: existing POST /api/whatif/{session_key}
  body: {car_id, pit_lap, compound}
  returns: {before: OutcomeProbs, after: OutcomeProbs, delta_position: float}
  (extend response to include delta_position if not already present)
```

**Compound selector colors:**
```
SOFT:   background #FFD700 (yellow), text #000
MEDIUM: background #F0F0F0 (white),  text #000
HARD:   background #BEBEBE (gray),   text #000
selected: border-2 border-f1-red + scale-105
```

**PPO auto-population:**
```
When strategy store receives new PredictionSet:
  for selected car_id:
    rec = prediction.cars[car_id].recommended_action
    if rec != "STAY":
      compound = rec.replace("PIT_", "")  // "SOFT" | "MEDIUM" | "HARD"
      auto-set CompoundSelector to compound
      auto-set PitLapInput to current_lap + 1
      show PPOBadge
```

## Related Code Files

- Modify: `frontend/components/what-if-panel/what-if-panel.tsx` — full redesign
- Create: `frontend/components/what-if-panel/compound-selector.tsx`
- Create: `frontend/components/what-if-panel/scenario-result-card.tsx`
- Create: `frontend/components/what-if-panel/driver-selector.tsx`
- Modify: `frontend/lib/api-client.ts` — ensure `whatIf()` call signature matches new response
- Modify: `backend/src/f1_strategy/api/routes_whatif.py` — add `delta_position` to response
- Modify: `frontend/app/session/[key]/replay-dashboard.tsx` — pass `car_id` click event from
  strategy overlay to what-if panel via shared state or callback

## Implementation Steps

1. **Inspect existing `routes_whatif.py`** — confirm request/response shape; add
   `delta_position: float` field (= `after.expected_position - before.expected_position`)
   if missing
2. **Create `compound-selector.tsx`** — three pill buttons with compound colors;
   `value: "SOFT"|"MEDIUM"|"HARD"`, `onChange` callback
3. **Create `driver-selector.tsx`** — `<select>` populated from `useRaceStateStore` running
   cars; sorted by position; each option shows `P{n} {driver_code}` with team color dot
4. **Create `scenario-result-card.tsx`** — renders `{before, after, delta_position}` response:
   - `Δ {delta_position:+.1f}` in green (gain) or red (loss)
   - Three outcome bars: win/podium/points before→after side by side
   - PPO badge: check if `compound + "PIT_"` matches `recommended_action` for this car
5. **Redesign `what-if-panel.tsx`** — wire all sub-components; add "Add comparison" toggle
   for second scenario column; loading spinner on `isLoading`; debounce auto-run 300ms
6. **Auto-populate from PPO** — `useEffect` watching `prediction` store; when selected car's
   recommendation is a pit action, update compound + lap inputs; show PPO badge
7. **Connect click-through from strategy overlay** — add `onCardClick(car_id)` prop to
   `PPODriverCards`; pass through to `replay-dashboard.tsx`; lift `selectedCarId` state
   up to `ReplayDashboard`; pass as `initialCarId` to `WhatIfPanel`

## Success Criteria

- [ ] Driver selector shows all running drivers sorted by position
- [ ] Compound selector buttons use correct compound colors; selected state visible
- [ ] "Pit Now" button pre-fills current lap; "Run" fires POST request
- [ ] Results card shows `Δ position` in correct color (green/red)
- [ ] Win/podium/points bars show before vs after scenario comparison
- [ ] PPO badge appears when compound matches PPO recommendation
- [ ] Comparison mode shows two result cards side-by-side
- [ ] Clicking a PPO driver card in strategy overlay pre-selects that driver in what-if panel
- [ ] Loading spinner shows during backend call; error state shows on failure

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| What-if backend too slow for interactive use (<2s target) | Existing MC budget env var `F1_MC_ROLLOUTS=200` for what-if; speed vs accuracy |
| `delta_position` can be misleading without uncertainty range | Show std from MC rollouts alongside mean delta (phase 10 nice-to-have) |
| PPO auto-populate fights user intent when user is manually exploring | Add "lock" toggle to disable auto-populate |
| Two-column compare layout overflows at 1280px | Use modal/drawer for compare mode below 1440px |
