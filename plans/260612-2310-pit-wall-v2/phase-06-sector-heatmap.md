---
phase: 6
title: "Sector Heatmap"
status: pending
priority: P2
effort: "3d"
dependencies: [2]
---

# Phase 06: Sector Heatmap

## Overview

2D grid visualisation: rows = laps, columns = S1/S2/S3, cells = color-coded sector time.
Purple = overall session best, green = personal best, yellow = normal, red = slow.
Inspired by PITWALL and Harmitx7/F1-TELEMETRY-DASHBOARD.
Placed as a new sub-tab within the Telemetry view.

## Requirements

### Functional
- Driver selector: one driver at a time (extend to multi-driver in a future phase)
- Rows: all laps for selected driver; columns: S1, S2, S3
- Cell color: purple (session-best sector), green (personal best), yellow (within 2%), red (>5% off best)
- Hover tooltip: exact sector time + gap to personal best + gap to session best
- Requires `sector_1_ms`, `sector_2_ms`, `sector_3_ms` columns in `LapRow` (added in phase 02)

### Non-functional
- Canvas2D or plain `<div>` grid — no extra chart library
- Max 78 rows (race laps) × 3 cols = 234 cells; div grid is fine at this size
- Add as second sub-tab ("Sectors") inside telemetry view, next to existing "Traces" sub-tab

## Architecture

### Frontend
```
components/telemetry/sector-heatmap.tsx
  Props: laps: LapRow[], initialDriver?: string
  ← groups laps by driver → filters to selectedDriver
  → renders CSS grid (3 cols, N rows) with color logic
  → tooltip via CSS :hover + `title` or custom overlay
```

Color logic:
```
sessionBest[s] = min of all sector times for that sector across all drivers
personalBest[s] = min for selected driver only
if time == sessionBest  → purple
elif time == personalBest → green
elif time < personalBest * 1.02 → yellow
else → red / grey
```

### Routing change in telemetry view
- `TelemetryCompare` becomes one sub-tab ("Traces")
- `SectorHeatmap` becomes second sub-tab ("Sectors")
- Add tab bar at top of telemetry view; state local to telemetry view

## Related Code Files

- Create: `frontend/components/telemetry/sector-heatmap.tsx`
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (telemetry tab now hosts sub-tabs)
- Requires: phase 02 sector columns in `LapRow`

## Implementation Steps

1. Ensure `laps` already has sector columns from phase 02
2. Build `sector-heatmap.tsx`: driver selector, CSS grid, color logic, hover title tooltip
3. Add sub-tab bar to telemetry view (Traces | Sectors)
4. Wire `SectorHeatmap` into Sectors sub-tab with `laps` prop

## Success Criteria

- [ ] Heatmap renders for a selected driver with correct colors
- [ ] Hover shows sector time + gap to best
- [ ] Purple cell correctly identifies session-best sector across all drivers
- [ ] Sub-tab bar switches between Traces and Sectors without remounting

## Risk Assessment

- Sector data absent for older FastF1 sessions — show "no sector data" empty state
- Very long races (70+ laps) = tall grid; wrap in scrollable container
