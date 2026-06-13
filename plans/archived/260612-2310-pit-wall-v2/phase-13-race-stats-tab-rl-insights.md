---
phase: 13
title: "Race Stats Tab — Multi-Panel RL Insights Dashboard"
status: pending
priority: P1
effort: "2d"
dependencies: [11]
---

# Phase 13: Race Stats Tab — Multi-Panel RL Insights Dashboard

## Overview

Add a third top-level tab "Stats" to the session dashboard. This tab shows race-level
analytical views that don't fit the live race view: tyre strategy overview, RL recommendations
summary for all drivers, pace comparison, and SC probability history. Draws from both
archive `laps`/`stints` data and the live `prediction` store.

## Requirements

### Tab Layout

```
HEADER:  [ Race | Telemetry | Stats ]
                              ↑ new

STATS TAB
┌──────────────────────────────────────────────────────────┐
│ SUB-TABS: [Strategy] [Pace] [RL Model] [SC History]      │
├──────────────────────────────────────────────────────────┤
│  <sub-tab content>                                       │
└──────────────────────────────────────────────────────────┘
```

### Sub-tab: Strategy

Tyre strategy overview — horizontal stint bars for all drivers, sorted by current position:
- Each bar segment = one stint: colored by compound (soft=red, medium=yellow, hard=white,
  inter=green, wet=blue)
- X axis = lap number (0 → session max_lap)
- Current lap marker (vertical line) in live mode
- Hover: show compound + laps on set + avg lap time for that stint
- Based on `StintRow[]` data (already prefetched)

### Sub-tab: Pace

Race pace comparison table + chart:
- Table columns: Driver | Team | Avg Lap (all laps) | Avg Lap (last 5) | Best Lap | Std Dev
- Values from `LapRow[]` grouped by `car_id`
- Bar chart beside the table: horizontal bars showing avg pace relative to race leader
- Color = `teamColor(driver.team)`
- Sortable columns (click header)
- Highlight personal bests in green

### Sub-tab: RL Model

Full RL recommendation summary for all drivers at the current lap:
- One card per driver (grid layout, 4 per row)
- Each card shows: driver number + name + team color header bar, recommended action
  (pit_now / pit_soon / stay), action probabilities as a mini bar chart, expected pit
  window (laps), next compound probabilities, outcome delta (expected pos change)
- Cards sorted by current race position
- "Stale" badge on cards when `isStale()` from prediction store returns true
- Empty state: "No RL predictions available — model not running" when `prediction === null`

### Sub-tab: SC History

Safety Car probability timeline:
- Line chart: X = lap, Y = SC probability (0–1)
- Two lines: `sc_prob_1lap` (orange) and `sc_prob_5laps` (yellow)
- Drawn from `scHistory` (last 30 entries from `usePredictionStore`)
- Annotations: vertical markers where actual SC/VSC was deployed (from `raceControlMessages`)
- Reference bands: red zone (>0.7), amber zone (0.4–0.7), green zone (<0.4)

### Non-functional
- All sub-tabs are lazy-rendered (no computation until first activation)
- No new API endpoints — uses data already in `laps`, `stints`, and `usePredictionStore`
- Pure SVG for all charts (no Recharts)
- Sub-tab selection persisted in local state (resets on session change)

## Architecture

```
components/stats/
  stats-tab.tsx              — top-level sub-tab switcher
  strategy-overview.tsx      — tyre stint bars for all drivers
  pace-comparison.tsx        — table + bar chart
  rl-model-summary.tsx       — all-driver RL cards grid
  sc-probability-history.tsx — SC prob timeline chart
```

`stats-tab.tsx` receives `laps: LapRow[]`, `stints: StintRow[]` as props (already available
in `session-dashboard.tsx` from page prefetch). Prediction data read from `usePredictionStore`.

## Related Code Files

- Modify: `frontend/app/session/[key]/session-dashboard.tsx` — add "stats" tab option; render `StatsTab`
- Modify: `frontend/components/shell/header.tsx` — add "Stats" tab button
- Create: `frontend/components/stats/stats-tab.tsx`
- Create: `frontend/components/stats/strategy-overview.tsx`
- Create: `frontend/components/stats/pace-comparison.tsx`
- Create: `frontend/components/stats/rl-model-summary.tsx`
- Create: `frontend/components/stats/sc-probability-history.tsx`
- Modify: `frontend/lib/types.ts` — ensure `LapRow` has `lap_time_ms`, `sector1_ms`, `sector2_ms`, `sector3_ms`, `position` fields
- Reuse: existing `frontend/components/strategy/model-card.tsx` inside `rl-model-summary.tsx`

## Implementation Steps

1. Add `"stats"` to the tab union type in `session-dashboard.tsx`; render `<StatsTab>` when active
2. Add "Stats" button to header tab bar
3. Build `stats-tab.tsx` — sub-tab state, lazy render guard (renders content only after first activation)
4. Build `strategy-overview.tsx` — group `StintRow[]` by `car_id`, sort by current position, render horizontal compound bars with lap-axis alignment
5. Build `pace-comparison.tsx` — aggregate `LapRow[]` per driver: mean/best/stddev; render sortable table + horizontal bar chart
6. Build `rl-model-summary.tsx` — iterate `prediction.cars`, render driver cards in a 4-column grid; stale badge when `isStale()`
7. Build `sc-probability-history.tsx` — SVG line chart from `scHistory`; annotate with race control markers
8. Wire all four components into `stats-tab.tsx` sub-tab switch

## Success Criteria

- [ ] "Stats" tab appears in header and is selectable
- [ ] Strategy sub-tab: all driver stint bars render correctly aligned to lap axis; compound colors match F1 conventions
- [ ] Pace sub-tab: table shows avg/best lap per driver; column sort works; bar chart proportional to slowest driver
- [ ] RL Model sub-tab: cards grid shows all drivers from prediction; stale badge appears after 30s without update
- [ ] SC History sub-tab: line chart renders from `scHistory`; 1-lap and 5-lap lines are distinguishable
- [ ] All sub-tabs render empty-state cards gracefully when data is unavailable

## Risk Assessment

- `LapRow` schema may be missing `position`, `sector1_ms` — backend query must be audited and updated if needed; this is a prerequisite for pace comparison and sector data
- `scHistory` max 30 entries: for long races (70+ laps) this covers only recent laps — note this limitation in the UI (e.g., "Last 30 laps" label on SC chart)
- RL cards grid at 4-per-row may overflow on narrow viewports — use CSS grid `auto-fill minmax(220px, 1fr)` for responsive layout
