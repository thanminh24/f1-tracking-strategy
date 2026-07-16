---
phase: 3
title: Multiviewer Track Map API
status: completed
priority: P0
effort: 2h
dependencies:
  - 1
---

# Phase 3: Multiviewer Track Map API

## Overview

Replace FastF1-based circuit outline fetching (which fails for future races and requires local cache) with `api.multiviewer.app/api/v1/circuits/{circuitKey}/{year}`. Free, no auth, CORS open. Returns full circuit outline (x/y arrays), rotation, corners with angles, and marshal sectors. The `circuitKey` comes from `SessionInfo.Meeting.Circuit.Key` in the live stream (e.g. 15 = Catalunya). Works during live sessions.

## Architecture

```
GET https://api.multiviewer.app/api/v1/circuits/{circuitKey}/{year}
→ {
    x: number[],           // track outline X coords (same space as Position.z)
    y: number[],           // track outline Y coords
    rotation: number,      // optimal display rotation (degrees)
    corners: [{
      number: int,
      trackPosition: {x, y},
      angle: number,       // for label offset: pos + 540*cos/sin(angle)
      length: number
    }],
    marshalSectors: [{
      trackPosition: {x, y},
      number: int
    }]
  }
```

## Related Code Files

- Modify: `backend/src/f1_strategy/archive/telemetry_service.py` → add `get_circuit_outline_multiviewer(circuit_key, year)` fallback
- Modify: `backend/src/f1_strategy/api/routes_archive.py` → expose `GET /api/map/{circuit_key}` endpoint
- Modify: `frontend/lib/use-track-geo.ts` → use multiviewer API for live sessions
- Modify: `frontend/components/track-map.tsx` → consume corners + marshalSectors for enhanced rendering

## Implementation Steps

1. **Backend: add `/api/map/{circuit_key}` endpoint** in `routes_archive.py`:
   - Proxy `api.multiviewer.app/api/v1/circuits/{circuit_key}/{year}` with 2h cache (in-memory or simple file cache)
   - Fall back to current FastF1-based outline if multiviewer returns non-200
   - Return unified shape: `{ x[], y[], rotation, corners[], marshalSectors[] }`
   - `circuit_key` available from `SessionInfo.Meeting.Circuit.Key` (int, e.g. 15)

   Alternatively: call directly from frontend (multiviewer has open CORS) — avoids backend proxy overhead. Prefer direct frontend call for simplicity (YAGNI).

2. **Frontend: `use-track-geo.ts`**:
   - When live session: get `circuitKey` from `race-state-store` `sessionInfo.Meeting.Circuit.Key`
   - Fetch `https://api.multiviewer.app/api/v1/circuits/{circuitKey}/{new Date().getFullYear()}`
   - Cache result in module-level Map keyed by `circuitKey` (avoid re-fetch on re-render)
   - Expose `{ points, rotation, corners, marshalSectors }` to components
   - When archive session: keep current FastF1-based flow (no change)

3. **Track map rendering** (`track-map.tsx`):
   - Apply `rotation` from API (add 90° fix same as f1-dash: `fixedRotation = rotation + 90`)
   - Rotate all points using `rotate(x, y, fixedRotation, centerX, centerY)` (port from f1-dash `lib/map.ts`)
   - Draw circuit outline SVG path from rotated `x`/`y` arrays
   - **Corner numbers**: render `<text>` at `labelPos` = trackPosition offset by `540 * cos/sin(angle_rad)`, rotated same as track
   - **Marshal sector lines**: store `marshalSectors` in state for Phase 4 yellow zone rendering

4. **Rotation helper** (port from f1-dash `lib/map.ts`):
   ```ts
   const rad = (deg: number) => deg * (Math.PI / 180);
   const rotate = (x: number, y: number, a: number, px: number, py: number) => {
     const c = Math.cos(rad(a)), s = Math.sin(rad(a));
     x -= px; y -= py;
     return { x: y * s + x * c + px, y: y * c - x * s + py };
   };
   ```
   Note: f1-dash swaps x/y in return — verify visually and adjust if needed.

5. **Verify coordinate space**: `Position.z` X/Y from SignalR Core and multiviewer x/y arrays share the same coordinate space (both sourced from F1's internal map data). Confirm by plotting a known driver position against the outline during Qualifying.

## Success Criteria

- [ ] `api.multiviewer.app/api/v1/circuits/15/2026` (Catalunya) renders correct track outline in SVG
- [ ] Track map displays corner numbers at correct positions
- [ ] Live driver dots (from `Position.z` in Phase 2) visually align with the track outline
- [ ] Archive sessions unaffected — still use FastF1 outline path
- [ ] No 404/CORS errors in browser console when fetching multiviewer API

## Risk Assessment

- **Multiviewer API availability**: unofficial API, no SLA. If it goes down: fall back to FastF1 outline (no corners/sectors but track shape preserved). Add `try/catch` with fallback.
- **Year mismatch**: for a 2026 session, use `2026`; for archive sessions from 2024, pass `2024`. Always use the session's year, not `new Date().getFullYear()`.
- **Coordinate flip**: f1-dash's `rotate()` swaps newX/newY in a non-obvious way — test visually rather than assuming
