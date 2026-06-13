---
phase: 2
title: "Live Position Tracking"
status: pending
priority: P1
effort: "4h"
dependencies: [4]
---

# Phase 2: Live Position Tracking

## Overview

The `Position.z` SignalR topic carries real-time GPS coordinates for every car but the data is zlib+base64-compressed. Add decompression in `LiveF1Feeder`, extract raw x/y per car, propagate them through `CarState` and the WebSocket state message, and update `TrackMap` to render live cars at real positions instead of `lap_fraction=0.0`.

**Depends on Phase 4** (circuit track outline cache) — TrackMap needs the circuit polyline to derive the normalization bounds.

## Requirements

- **Functional:**
  - Subscribe to `Position.z` in `LiveF1Feeder`
  - Decode zlib+base64 payload → JSON with per-driver `{X, Y}` entries
  - Store latest `(x, y)` per driver in `_positions_xy`
  - Add `x: float | None`, `y: float | None` to `CarState`
  - WS state JSON serializes x/y alongside existing fields
  - `TrackMap` in live mode (session key = `"live"`) uses x/y instead of `lap_fraction`

- **Non-functional:**
  - Decode failures → debug log, skip frame, feeder stays alive
  - x/y are in F1 Cartesian (meters); TrackMap normalizes them to 1000×1000 viewbox using same bounds as the track outline

## Architecture

### Position.z payload structure
```
base64(zlib-deflate-raw(JSON)):
{
  "Position": [
    {"Timestamp": "...", "Entries": {
      "1":  {"Status": "OnTrack", "X": 1234.5, "Y": -567.8, "Z": 0.0},
      "44": {"Status": "OnTrack", "X": 2100.1, "Y":  345.6, "Z": 0.0}
    }}
  ]
}
```
Driver numbers are string keys. Take latest frame per batch.

### Normalization
Frontend `useTrackGeo` already normalizes outline x/y to [0,1000]. Apply same linear transform to live car positions:
```
norm_x = (raw_x - outline_min_x) / (outline_max_x - outline_min_x) * 1000
```
Backend sends raw F1 coordinates; frontend applies normalization identically to outline points.

### Data flow
```
SignalR "Position.z" → _decompress_z() → _apply_position_z()
  → _positions_xy[driver_no] = (x, y)

_build_state() → CarState(x=..., y=...) → WS JSON
  → TrackMap: source=live → use car.x/car.y → normalize against outline bounds
```

## Related Code Files

- Modify: `backend/src/f1_strategy/feeder/livef1_feeder.py`
  - Add `"Position.z"` to `_TOPICS`
  - Add `self._positions_xy: dict[str, tuple[float, float]] = {}`
  - Add `_decompress_z()` static helper (shared with Phase 3)
  - Add `_apply_position_z(rec)` handler
  - Update `_apply()` dispatcher for `"Position.z"`
  - Update `_build_state()` to include x/y in CarState
- Modify: `backend/src/f1_strategy/models/race_state.py` — add `x: float | None = None`, `y: float | None = None` to `CarState`
- Modify: `frontend/components/track-map.tsx` — use `car.x`/`car.y` when source=live and coords available

## Implementation Steps

1. **Add `_decompress_z()` static helper** (reused in Phase 3):
   ```python
   import base64, zlib, json

   @staticmethod
   def _decompress_z(raw: object) -> dict:
       if isinstance(raw, dict):
           return raw  # some livef1 versions pre-decode
       b = base64.b64decode(raw) if isinstance(raw, str) else bytes(raw)
       return json.loads(zlib.decompress(b, -15))  # -15 = raw deflate (no header)
   ```

2. **Add `"Position.z"` to `_TOPICS`** and `self._positions_xy: dict[str, tuple[float, float]] = {}` in `__init__`.

3. **Add `_apply_position_z(rec: dict)`**:
   ```python
   def _apply_position_z(self, rec: dict) -> None:
       for frame in (rec.get("Position") or []):
           for dn, data in (frame.get("Entries") or {}).items():
               if not isinstance(data, dict): continue
               x, y = data.get("X"), data.get("Y")
               if x is not None and y is not None:
                   try:
                       self._positions_xy[str(dn)] = (float(x), float(y))
                   except (TypeError, ValueError):
                       pass
   ```

4. **Wire `"Position.z"` into `_apply()` dispatcher** — note this topic arrives as a single blob (not a list of records), so decode at dispatch time:
   ```python
   elif topic == "Position.z":
       for blob in data_list:
           try:
               self._apply_position_z(self._decompress_z(blob))
           except Exception as exc:
               log.debug("Position.z decode: %s", exc)
   ```

5. **Add `x: float | None = None`, `y: float | None = None`** to `CarState` in `race_state.py`.

6. **Update `_build_state()`**: `xy = self._positions_xy.get(dn)` → `CarState(x=xy[0] if xy else None, y=xy[1] if xy else None, ...)`.

7. **Update `TrackMap`**: when `sessionKey === "live"` and `car.x != null && car.y != null`, compute normalized position using outline bounds from `useTrackGeo` geo data (`geo.norm` min/max x/y), then draw at that canvas position instead of the `lap_fraction` interpolation.

## Success Criteria

- [ ] `Position.z` subscribed and decoded without crashing feeder
- [ ] `CarState.x` / `CarState.y` populated within 2s of first position packet
- [ ] WS state JSON includes `x`, `y` for each car with valid coordinates
- [ ] Live TrackMap renders cars at real positions (not all at start/finish line)
- [ ] Decode failures are silent (debug log), feeder stays alive
- [ ] Archive sessions unaffected (x/y null → existing lap_fraction path unchanged)

## Risk Assessment

- **Raw deflate vs zlib header**: F1 uses raw deflate → `wbits=-15`. If livef1 pre-decodes, the `isinstance(raw, dict)` guard prevents double-decode.
- **Normalization bounds**: must match `useTrackGeo` exactly; verify by comparing a live car position to expected circuit layout.
- **Hot path**: zlib decompression <1ms per 20-car frame; negligible on 1s tick.
