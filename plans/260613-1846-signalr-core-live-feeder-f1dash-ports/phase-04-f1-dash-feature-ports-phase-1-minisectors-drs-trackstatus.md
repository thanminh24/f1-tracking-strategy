---
phase: 4
title: f1-dash Feature Ports Phase 1 (MiniSectors DRS TrackStatus)
status: completed
priority: P1
effort: 3h
dependencies:
  - 2
  - 3
---

# Phase 4: f1-dash Feature Ports Phase 1 — MiniSectors, DRS, TrackStatus

## Overview

Port three high-value real-time visual features from f1-dash into the timing tower and track map. All data arrives via the SignalR Core stream (Phase 1+2). No new backend endpoints needed.

## Features

### 1. Mini-Sector Segment Colors

`TimingData.Lines[nr].Sectors[].Segments[].Status` encodes per-mini-sector color:
- `0` → not yet reached (grey/dim)
- `2048` → yellow (sector flag)
- `2049` → green (personal best)
- `2051` → purple (overall fastest)

Display as small colored boxes in the timing tower row, one per segment. Each sector has ~3 segments (varies by track). This gives real-time "where on track is each driver" granularity.

### 2. DRS Status Indicator

`CarData.z` channel `"45"` per driver:
- `0`–`7` → DRS off
- `8` → DRS eligible (possible — show as dim green)
- `10`–`14` → DRS active (on — show as bright green)

Show per driver in timing tower as a small `DRS` badge with color state. In pit or pit-out: show "PIT"/"OUT" instead.

### 3. TrackStatus Map Coloring

`TrackStatus.Status` (string of int):
- `"1"` → Clear — white track outline
- `"2"` → Yellow Flag — amber, `bySector: true` (color by marshal sector)
- `"3"` → Flag — amber by sector
- `"4"` → Safety Car — amber full track
- `"5"` → Red Flag — red full track
- `"6"` → VSC Deployed — amber full track
- `"7"` → VSC Ending — amber full track

For sector-level yellow: use `RaceControlMessages` to find which marshal sectors have active yellow flags (Flag=YELLOW/DOUBLE YELLOW, not yet CLEAR'd for that sector). Color those `marshalSectors` path segments amber on the track map.

## Related Code Files

- Modify: `frontend/components/timing-tower.tsx` (add mini-sector chips + DRS badge per driver row)
- Create: `frontend/components/race/mini-sector-chips.tsx` (segment status → colored chips)
- Create: `frontend/components/race/drs-badge.tsx` (DRS/PIT/OUT indicator)
- Modify: `frontend/components/track-map.tsx` (TrackStatus colors + marshal sector yellows)
- Modify: `frontend/lib/types.ts` (Sector, Segment, TrackStatus types already added in Phase 2)

## Implementation Steps

1. **`mini-sector-chips.tsx`**: takes `sectors: Sector[]` prop. For each sector, render its `Segments` as small `4×4px` squares with color determined by `Status`:
   ```ts
   const segmentColor = (status: number) => {
     if (status === 2051) return "bg-purple-500";   // overall fastest
     if (status === 2049) return "bg-green-400";    // personal best
     if (status === 2048) return "bg-yellow-400";   // yellow
     return "bg-zinc-700";                           // not reached
   };
   ```
   Group segments by sector with a small gap between sectors.

2. **`drs-badge.tsx`**: takes `drsChannel: number`, `inPit: boolean`, `pitOut: boolean`:
   ```ts
   if (inPit)    → <span class="text-zinc-400">PIT</span>
   if (pitOut)   → <span class="text-blue-400">OUT</span>
   if (drs > 9)  → <span class="text-green-400 font-bold">DRS</span>  // active
   if (drs === 8) → <span class="text-green-700">DRS</span>            // possible
   else          → <span class="text-zinc-600">DRS</span>              // off
   ```

3. **Timing tower integration**: add mini-sector chips and DRS badge to each driver row. Source `carTelemetry[nr].Channels["45"]` for DRS, `timingData.Lines[nr].Sectors` for mini-sectors. Both gated on live mode only (archive doesn't have real-time segment data).

4. **`getTrackStatusMessage()` helper** (port from f1-dash):
   ```ts
   const TRACK_STATUS: Record<string, {color: string, trackColor: string, bySector?: boolean, pulse?: number}> = {
     "1": { color: "text-green-400",  trackColor: "stroke-white" },
     "2": { color: "text-amber-400",  trackColor: "stroke-amber-400", bySector: true },
     "3": { color: "text-amber-400",  trackColor: "stroke-amber-400", bySector: true },
     "4": { color: "text-amber-400",  trackColor: "stroke-amber-400" },
     "5": { color: "text-red-500",    trackColor: "stroke-red-500" },
     "6": { color: "text-amber-400",  trackColor: "stroke-amber-400", pulse: 5 },
     "7": { color: "text-amber-400",  trackColor: "stroke-amber-400", pulse: 5 },
   };
   ```

5. **Track map TrackStatus coloring**: use `trackColor` for the main SVG path stroke. For `bySector: true`, find yellow marshal sectors from `RaceControlMessages.Messages`:
   - Filter for `Flag === "YELLOW" | "DOUBLE YELLOW"` and `Scope === "Sector"`, sort by Utc
   - Track which sectors have been CLEAR'd (remove from yellow set)
   - Color matching `marshalSectors` path segments amber; rest use `trackColor`

6. **TrackStatus banner**: show a small status banner at top of session view when status ≠ Clear: e.g. `🟡 Safety Car`, `🔴 Red Flag`. Use `TrackStatus.Message` text.

## Success Criteria

- [ ] Timing tower shows colored mini-sector chips per driver in live mode
- [ ] DRS badge correctly shows "DRS" (green), "possible" (dim green), "PIT", "OUT", or off per driver
- [ ] Track map turns red during Red Flag (Status "5"), amber during SC/VSC (Status "4"/"6")
- [ ] Individual marshal sectors highlight amber when yellow flag reported for that sector
- [ ] All features invisible/hidden in archive mode (not `undefined` error)

## Risk Assessment

- **Segment count varies by track**: some tracks have 2 segments per sector, others have 4. Render dynamically based on actual `Segments.length` — don't hardcode.
- **Status code gaps**: F1 occasionally sends undocumented status values. Default to dim/grey for unknown values.
- **Yellow sector debounce**: `RaceControlMessages` can have rapid flag→clear→flag sequences. Process in chronological Utc order to get correct final state.
