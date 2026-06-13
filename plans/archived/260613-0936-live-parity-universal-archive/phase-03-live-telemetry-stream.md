---
phase: 3
title: "Live Telemetry Stream"
status: pending
priority: P1
effort: "5h"
dependencies: [2]
---

# Phase 3: Live Telemetry Stream

## Overview

The `CarData.z` SignalR topic streams per-car Speed, Throttle, Brake, Gear, RPM, and DRS at ~4Hz but is zlib+base64-compressed. Decode it in `LiveF1Feeder`, buffer the last N samples per driver, expose them via a new `live_telemetry` WS message type, and make `TelemetryView` display live traces instead of requiring archived lap data.

**Depends on Phase 2** (shares `_decompress_z()` helper implemented there).

## Requirements

- **Functional:**
  - Subscribe to `CarData.z` in `LiveF1Feeder`
  - Decode each frame → per-driver channels: `Speed`, `Throttle`, `Brake`, `Gear`, `RPM`, `DRS`
  - Ring buffer last 300 samples per driver (≈75s at 4Hz) — enough for a full recent lap trace
  - New WS message type `"telemetry"` sent after every tick containing full buffer for all drivers
  - `TelemetryView` in live mode reads from `telemetry` WS messages instead of archive API
  - Driver selector in TelemetryView works the same way; trace chart renders Speed/Throttle/Brake as before

- **Non-functional:**
  - Ring buffer is a fixed-size deque (`collections.deque(maxlen=300)`) per driver — O(1) append
  - WS message for telemetry is sent separately from the race state message (independent tick)
  - Decode failures → debug log, skip frame
  - No archive telemetry calls made in live mode

## Architecture

### CarData.z payload structure
```
base64(zlib-deflate-raw(JSON)):
{
  "Entries": [
    {"Utc": "...", "Cars": {
      "1":  {"Channels": {"0": 285, "2": 100, "45": 0, "3": 7, "4": 12500, "5": 0}},
      "44": {"Channels": {"0": 312, "2":  98, "45": 0, "3": 8, "4": 13200, "5": 1}}
    }}
  ]
}
```
Channel mapping: `0`=Speed(km/h), `2`=Throttle(%), `45`=Brake(%), `3`=Gear, `4`=RPM, `5`=DRS(0/1).

### Ring buffer structure
```python
self._telemetry: dict[str, deque[dict]] = defaultdict(lambda: deque(maxlen=300))

# Each sample:
{"t": float, "speed": int, "throttle": int, "brake": int,
 "gear": int, "rpm": int, "drs": int}
```

### WS message type
```json
{
  "type": "telemetry",
  "data": {
    "1":  [{"t": 0.0, "speed": 285, "throttle": 100, "brake": 0, ...}, ...],
    "44": [...]
  }
}
```
Sent as a separate message in `ws_feeder.py` after the state message, once telemetry data is non-empty.

### TelemetryView live mode
```
source=live → skip archive API calls
  → subscribe to "telemetry" WS messages via feeder-client
  → store latest telemetry buffer in zustand-style local state
  → pass to TracesChart as lap data substitute
```

## Related Code Files

- Modify: `backend/src/f1_strategy/feeder/livef1_feeder.py`
  - Add `"CarData.z"` to `_TOPICS`
  - Add `self._telemetry: dict[str, deque]` (defaultdict)
  - Add `_apply_cardata_z(rec: dict)` handler
  - Update `_apply()` dispatcher for `"CarData.z"`
  - Add `get_telemetry() -> dict[str, list[dict]]` method for ws_feeder
- Modify: `backend/src/f1_strategy/api/ws_feeder.py` — send `{"type": "telemetry", "data": ...}` message after state tick
- Modify: `frontend/lib/feeder-client.ts` — handle `type === "telemetry"` message, store in `useTelemetryStore`
- Create: `frontend/lib/telemetry-store.ts` — zustand store holding `Record<string, TelemetrySample[]>` (or extend existing prediction-store)
- Modify: `frontend/components/telemetry/telemetry-view.tsx` — live mode: use telemetry store instead of `api.telemetry()` call
- Modify: `frontend/components/telemetry/traces-chart.tsx` — accept live samples as prop (same shape as archive)

## Implementation Steps

1. **Add `"CarData.z"` to `_TOPICS`** and `self._telemetry: dict[str, deque] = defaultdict(lambda: deque(maxlen=300))` in `__init__`.

2. **Add `_apply_cardata_z(rec: dict)`**:
   ```python
   from collections import defaultdict
   from collections import deque

   def _apply_cardata_z(self, rec: dict) -> None:
       now = time.monotonic() - self._t_start
       for frame in (rec.get("Entries") or []):
           for dn, car in (frame.get("Cars") or {}).items():
               ch = (car.get("Channels") or {})
               sample = {
                   "t": now,
                   "speed":    int(ch.get("0", 0)),
                   "throttle": int(ch.get("2", 0)),
                   "brake":    int(ch.get("45", 0)),
                   "gear":     int(ch.get("3", 0)),
                   "rpm":      int(ch.get("4", 0)),
                   "drs":      int(ch.get("5", 0)),
               }
               self._telemetry[str(dn)].append(sample)
   ```

3. **Wire `"CarData.z"` into `_apply()` dispatcher** (same pattern as `Position.z`):
   ```python
   elif topic == "CarData.z":
       for blob in data_list:
           try:
               self._apply_cardata_z(self._decompress_z(blob))
           except Exception as exc:
               log.debug("CarData.z decode: %s", exc)
   ```

4. **Add `get_telemetry()` on `LiveF1Feeder`**:
   ```python
   def get_telemetry(self) -> dict[str, list[dict]]:
       return {dn: list(buf) for dn, buf in self._telemetry.items() if buf}
   ```

5. **Update `ws_feeder.py`** to send telemetry after state message:
   ```python
   feeder = session_registry.get_feeder(session_key)
   if hasattr(feeder, "get_telemetry") and feeder._telemetry:
       telem = feeder.get_telemetry()
       await websocket.send_json({"type": "telemetry", "data": telem})
   ```

6. **Create `telemetry-store.ts`** (Zustand):
   ```typescript
   interface TelemetrySample { t: number; speed: number; throttle: number;
     brake: number; gear: number; rpm: number; drs: number; }
   interface TelemetryStore {
     data: Record<string, TelemetrySample[]>;
     setDriverData: (driverNo: string, samples: TelemetrySample[]) => void;
     setAll: (data: Record<string, TelemetrySample[]>) => void;
   }
   ```

7. **Update `feeder-client.ts`**: on `type === "telemetry"` message, call `useTelemetryStore.getState().setAll(msg.data)`.

8. **Update `telemetry-view.tsx`**: detect live session (`sessionKey === "live"` or from session meta `is_live`). In live mode, skip `api.getLapTelemetry()` call; subscribe to `useTelemetryStore`. Pass driver's sample buffer to `TracesChart` as `data` prop (same shape as archive laps, just without lap boundaries — one continuous trace).

9. **Update `traces-chart.tsx`**: accept both archive-style `LapData[]` and live-style `TelemetrySample[]`. When live, render as a single continuous scrolling trace (no lap-over-lap comparison needed initially).

## Success Criteria

- [ ] `CarData.z` subscribed and decoded without crashing feeder
- [ ] Ring buffer accumulates samples within 5s of session start
- [ ] WS `{"type": "telemetry"}` message sent each tick when buffer non-empty
- [ ] `TelemetryView` in live session shows Speed/Throttle/Brake traces updating in real time
- [ ] Driver selector in TelemetryView works in live mode
- [ ] Archive telemetry unchanged

## Risk Assessment

- **Channel IDs may shift**: `"0"`, `"2"`, `"45"`, `"3"`, `"4"`, `"5"` are F1 standard telemetry channel IDs — stable since 2019. Log raw channels on first decode to verify.
- **Message size**: 20 drivers × 300 samples × 7 fields ≈ 42k items per WS message. At 1Hz this is acceptable; if too large, switch to delta updates (only new samples since last tick).
- **Trace rendering without laps**: live mode has no lap boundaries for the x-axis — use `t` (seconds since session start) as x-axis; add a lap marker overlay when `CarState.lap` changes.
