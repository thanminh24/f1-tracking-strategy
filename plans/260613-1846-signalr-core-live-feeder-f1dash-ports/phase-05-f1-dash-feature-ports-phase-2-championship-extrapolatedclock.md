---
phase: 5
title: "f1-dash Feature Ports Phase 2 (Championship + ExtrapolatedClock + Qualifying UI)"
status: pending
priority: P2
effort: "3h"
dependencies: [4]
---

# Phase 5: f1-dash Feature Ports Phase 2 — Championship, Clock, Qualifying UI

## Overview

Three complementary live features that improve session context and qualifying UX. All data arrives via SignalR Core (Phase 1). Lower urgency than Phases 1–4 but high user value during championship-critical sessions.

## Features

### 1. ExtrapolatedClock — Session Remaining Timer

`ExtrapolatedClock.Remaining` is a string like `"0:43:27"` (HH:MM:SS or MM:SS). `Extrapolating: boolean` indicates whether the clock is being extrapolated (session paused/under SC — clock freezes or estimates).

Replace the current "session time remaining" display (if any) with this data. Show extrapolation state as a subtle dimmed style or "(est.)" suffix.

### 2. ChampionshipPrediction Panel

`ChampionshipPrediction.Drivers` and `.Teams` provide live predicted standings as the session unfolds:
```ts
Drivers: {
  [racingNumber: string]: {
    RacingNumber: string,
    CurrentPosition: number,   // before this session
    PredictedPosition: number, // if session result stands
    CurrentPoints: number,
    PredictedPoints: number,
  }
}
```
Show as a compact panel in the Race Stats tab or sidebar: driver name + team color dot, current points, predicted points delta (`+N` or `-N`), position change arrow (↑↓). Sort by predicted position.

### 3. Qualifying UI — Knockout Zone + Session Part

`TimingData.SessionPart` (1=Q1, 2=Q2, 3=Q3) — only present during Qualifying.
`TimingData.Lines[nr].KnockedOut: boolean` — driver eliminated.
`TimingData.Lines[nr].Cutoff: boolean` — driver on the elimination bubble.

Display in timing tower during Qualifying:
- P16+ in Q1, P11+ in Q2: highlight row with red tint (danger zone)
- `KnockedOut: true`: dim row to 50% opacity
- `Cutoff: true`: amber pulsing border
- Show session part badge: `Q1 / Q2 / Q3` next to session name in header
- `TimingData.CutOffTime` / `CutOffPercentage`: show cutoff time if present

Also port speed trap values from `TimingStats.Lines[nr].BestSpeeds`:
- `I1`, `I2`, `Fl` (finish line), `St` (speed trap) — show fastest-highlighted in driver row

## Related Code Files

- Modify: `frontend/components/shell/header.tsx` (session part badge Q1/Q2/Q3 + ExtrapolatedClock)
- Modify: `frontend/components/timing-tower.tsx` (KnockedOut, Cutoff, danger zone, speed traps)
- Create: `frontend/components/stats/championship-prediction-panel.tsx`
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (mount championship panel in stats tab)
- Modify: `frontend/lib/types.ts` (ensure all fields typed)

## Implementation Steps

1. **ExtrapolatedClock in header** (`header.tsx`):
   - Parse `Remaining` string to display as `MM:SS` countdown
   - Tick locally using `setInterval(1000)` when `Extrapolating: true` (decrement client-side)
   - When `Extrapolating: false`: use server value directly, no client tick
   - Style: monospace font, dim when extrapolating, show `(est.)` suffix

2. **Session part badge** (`header.tsx`):
   - When `TimingData.SessionPart` is 1/2/3: show `Q1`/`Q2`/`Q3` badge next to session name
   - Color: Q1=zinc, Q2=amber, Q3=green (escalating significance)

3. **Qualifying danger zone** (`timing-tower.tsx`):
   - Add `sessionPart` prop; compute danger threshold: P16+ (Q1), P11+ (Q2), none (Q3)
   - Row classes: `KnockedOut` → `opacity-50`, `Cutoff` → `ring-1 ring-amber-400 animate-pulse`, danger position → `bg-red-900/20`
   - Priority: KnockedOut > Cutoff > danger zone (don't double-apply)

4. **Speed trap display** (`timing-tower.tsx`):
   - Add optional column for `TimingStats.Lines[nr].BestSpeeds.St.Value` (speed trap)
   - Highlight in purple if `BestSpeeds.St.Position === 1` (overall fastest)
   - Show only when `TimingStats` available (hide column otherwise)

5. **`championship-prediction-panel.tsx`**:
   - Props: `prediction: ChampionshipPrediction | null`
   - Render two tabs: Drivers / Constructors
   - Per entry: team color dot, name, current points, predicted points, delta `+N`/`-N` colored green/red, position change `↑N`/`↓N`
   - Sort by `PredictedPosition`
   - Show "No championship data" placeholder when null
   - Mount in Race Stats tab alongside existing RL summary panel

## Success Criteria

- [ ] Session remaining timer shows and counts down correctly in header during live Qualifying
- [ ] `Q1`/`Q2`/`Q3` badge appears in header when `SessionPart` is set
- [ ] Drivers in elimination zone (P16+/P11+) have red-tinted rows in timing tower
- [ ] Knocked-out drivers are 50% opacity; cutoff drivers pulse amber
- [ ] Championship prediction panel renders in Race Stats tab with correct delta colors
- [ ] All features absent/hidden during archive replay (no undefined errors)

## Risk Assessment

- **`ChampionshipPrediction` availability**: only sent during races, not practice/qualifying. Render panel with empty state for non-race sessions.
- **`SessionPart` absence**: not present during race or practice — qualifying danger zone logic must check `sessionPart !== undefined` before applying
- **ExtrapolatedClock format**: verify actual string format from live data before assuming `HH:MM:SS` — may be `MM:SS` for sub-1-hour sessions
