---
phase: 8
title: "Position Bump Chart (Race Evolution)"
status: pending
priority: P3
effort: "4d"
dependencies: [2]
---

# Phase 08: Position Bump Chart

## Overview

Lap-by-lap position evolution chart — Y axis = position (1 at top), X axis = lap,
each driver = a colored line. Lines intersect at overtakes. Makes race strategy
narrative instantly readable. Inspired by F1THEDATA and TracingInsights.

Placed as a third sub-tab ("Evolution") in the telemetry view.

## Requirements

### Functional
- All active drivers plotted; toggle individual drivers by clicking legend items
- Y axis: positions 1–20 (inverted — P1 at top)
- X axis: laps 1 → `max(lap_number)` from `laps` prop
- Line color = `teamColor(driver.team)`
- Driver label at the rightmost point of each line
- Hover: crosshair with driver name + position at that lap
- Update in real-time when `laps` prop refreshes (live session)

### Non-functional
- Pure SVG rendering (no Recharts — avoids 40KB bundle addition for one chart)
- Downsample to points-only (no smooth curves) above 30 laps for performance
- Max 20 drivers × 78 laps = 1560 points; target ≤2ms render

## Architecture

```
components/telemetry/position-bump-chart.tsx
  Props: laps: LapRow[]
  → group laps by driver, sort by lap_number
  → build per-driver position series
  → render as SVG polylines
  → hover state via SVG pointer events + useState
```

Data reshaping:
```ts
// { [carId]: { lap: number, position: number }[] }
const series = groupBy(laps, l => l.car_id)
  .map(rows => rows.map(r => ({ lap: r.lap_number, pos: r.position ?? 0 }))
                   .sort((a, b) => a.lap - b.lap));
```

`position` column must exist in `LapRow` — already present in archive schema.

SVG layout:
- Viewbox: 800×400, 60px left pad (position labels), 40px right pad (driver labels), 20px top/bottom
- Y scale: `position / 20 * H` (P1 at y=0)
- X scale: `lap / maxLap * W`

## Related Code Files

- Create: `frontend/components/telemetry/position-bump-chart.tsx`
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (add Evolution sub-tab)
- Modify: `frontend/components/telemetry/sector-heatmap.tsx` (extend sub-tab bar to 3 tabs)

## Implementation Steps

1. Create `position-bump-chart.tsx`:
   - Reshape `laps` into per-driver position series
   - Render SVG with Y axis (positions 1-20), X axis (lap numbers), polylines
   - Add driver labels at right edge
   - Hover state: nearest-driver detection on `mousemove`
2. Add "Evolution" tab to telemetry sub-tab bar
3. Wire chart with `laps` prop

## Success Criteria

- [ ] Chart renders correctly for a 50-lap race with 20 drivers
- [ ] Overtakes visible as crossing lines
- [ ] Driver legend toggle works (click to hide/show individual driver)
- [ ] Hover shows driver + position at cursor lap
- [ ] Render time <5ms for 78-lap 20-driver dataset (measure with `performance.now()`)

## Risk Assessment

- `position` may be null in `LapRow` for laps where driver retired — filter out null positions before rendering
- Very close lap times result in many line crossings — intentional and desirable
- Real-time update on live session may cause SVG re-renders; use `useMemo` for series calculation
