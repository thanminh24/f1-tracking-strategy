---
phase: 2
title: "Fastest Lap + Sector Highlights"
status: pending
priority: P1
effort: "1d"
dependencies: []
---

# Phase 02: Fastest Lap + Sector Highlights

## Overview

Enhance the timing tower with visual highlights that broadcast-quality F1 screens always show:
- **Purple row** for the current fastest-lap holder
- **Fastest lap indicator chip** showing the lap number + time
- **Sector time chips** (S1/S2/S3) colored per driver row — purple (overall best), green (personal best), yellow (other)

## Requirements

### Functional
- Fastest lap: highlight the driver row with a left border or background tint in purple (`#A855F7`)
- Show "FL" chip on that driver's row in timing tower
- Sector chips per driver: color based on comparison to the session's current best sectors
- Sector data sourced from `LapRow.sector_1_ms / sector_2_ms / sector_3_ms` (add these fields to DB query if not present)

### Non-functional
- No new npm packages
- Colors: purple = `#A855F7`, green = `#22C55E`, yellow = `#F59E0B` (already in design system)

## Architecture

### Data Flow
`LapRow` already has `lap_time_ms`. Need `sector_1_ms`, `sector_2_ms`, `sector_3_ms` added:
- Backend: extend `queries.py` session laps query to include sector columns from Parquet
- Type: add optional `sector_1_ms`, `sector_2_ms`, `sector_3_ms` to `LapRow` in `types.ts`

### Frontend
- `components/timing-tower.tsx` — compute fastest lap + sector bests in component from `state.cars` + `laps` prop
- Add `FastestLapChip` inline component
- Add `SectorChips` row below each driver row (collapsible or always shown)

## Related Code Files

- Modify: `backend/src/f1_strategy/api/routes_archive.py` (extend laps query with sector times)
- Modify: `frontend/lib/types.ts` (extend `LapRow`)
- Modify: `frontend/components/timing-tower.tsx`
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (pass `laps` into TimingTower)

## Implementation Steps

1. Extend `laps` SQL query in backend to include `sector_1_ms`, `sector_2_ms`, `sector_3_ms`
2. Add optional sector fields to `LapRow` type
3. Pass `laps` prop down from `SessionDashboard` → `RaceView` → `TimingTower`
4. In `TimingTower`: compute fastest-lap holder and per-sector bests from `laps`
5. Add purple border/chip to fastest-lap driver row
6. Add S1/S2/S3 chips colored by sector comparison (purple/green/yellow/grey)
7. Test: load a race session, verify correct driver highlighted

## Success Criteria

- [ ] Fastest lap driver row has visible purple indicator
- [ ] "FL" chip appears on fastest-lap driver with time shown
- [ ] Sector chips display for each driver using correct color coding
- [ ] No regression to timing tower performance (<16ms render per frame)

## Risk Assessment

- Sector columns may not exist for older archived sessions or scratch-tier sessions — render `—` chips gracefully
