---
phase: 7
title: "DRS Activation Zones on Track Map"
status: pending
priority: P2
effort: "2d"
dependencies: []
---

# Phase 07: DRS Activation Zones on Track Map

## Overview

Overlay DRS detection and activation zone arcs on the Canvas2D track map.
Each zone shows as a highlighted segment of the track outline — green when DRS is
available, grey when inactive (yellow flag / SC). Improves strategic awareness of
when drivers can open the wing to attack or defend.

## Requirements

### Functional
- DRS zones drawn as colored arc segments on the track outline
- Zone active state: green; inactive (SC/VSC/red flag): grey
- Zone data: detection point + activation point + end point, expressed as `lap_fraction` values
- Data source: hardcoded JSON for the ~15 circuits in the archive (GIS data entry, one-time per circuit)
- Toggle button in track map header to show/hide DRS overlay

### Non-functional
- Canvas2D only — no SVG; DRS segments drawn in same `drawFrame()` loop as driver dots
- Zone data file: `frontend/lib/drs-zones.ts` — map of circuit slug → zone array
- Circuit slug derived from `session.circuit` value passed to `TrackMap`

## Architecture

### DRS zone data format
```ts
// frontend/lib/drs-zones.ts
interface DrsZone {
  detection: number;   // lap_fraction where detection loop is
  activation: number;  // lap_fraction where DRS opens
  end: number;         // lap_fraction where zone ends
}
export const DRS_ZONES: Record<string, DrsZone[]> = {
  "Monza": [...],
  "Silverstone": [...],
  // ...
};
```

### Canvas rendering
In `track-map.tsx` `drawFrame()`, after drawing the track outline:
1. Look up `DRS_ZONES[circuit]` 
2. For each zone: extract `at(activation)` → `at(end)` arc points from `TrackGeo.norm`
3. Draw as thick colored line segment over track outline
4. Color: `#22C55E` if track_status == "green"; `#707070` otherwise

### Props change
`TrackMap` receives new optional `circuit?: string` and `showDrs?: boolean` props.

## Related Code Files

- Create: `frontend/lib/drs-zones.ts`
- Modify: `frontend/components/track-map.tsx` (add DRS layer in drawFrame)
- Modify: `frontend/app/session/[key]/session-dashboard.tsx` (pass circuit prop)
- Modify: `backend/src/f1_strategy/api/routes_archive.py` (expose circuit name in session meta if not already)

## Implementation Steps

1. Collect DRS zone lap fractions for top 10 circuits from official F1 circuit guides
2. Create `drs-zones.ts` with typed zone data
3. Modify `drawFrame()` in `track-map.tsx`: draw zone segments between `at(activation)` and `at(end)` points
4. Add toggle button (small pill in top-right of track map container)
5. Pass `circuit` from session data down to `TrackMap`
6. Test: load Monza 2024, verify DRS zones appear in correct corners

## Success Criteria

- [ ] DRS zones visible as colored segments on at least 3 circuits
- [ ] Toggle correctly shows/hides the overlay
- [ ] Zone color correctly reflects track status (green vs. grey on SC laps)
- [ ] No FPS drop from DRS layer (segments drawn in same Canvas pass)

## Risk Assessment

- `lap_fraction` values for DRS zones require manual calibration per circuit — budget 15–20 min per circuit
- Circuit name from backend may not exactly match DRS_ZONES keys — normalise to lowercase, strip spaces
