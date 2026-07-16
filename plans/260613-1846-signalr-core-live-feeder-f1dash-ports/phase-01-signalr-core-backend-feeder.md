---
phase: 1
title: SignalR Core Backend Feeder
status: completed
priority: P0
effort: 3h
dependencies: []
---

# Phase 1: SignalR Core Backend Feeder

## Overview

Replace `livef1.RealF1Client` (wraps old `/signalr/` endpoint, broken during race weekends) with a native Python `websockets` client targeting `wss://livetiming.formula1.com/signalrcore`. No auth required — only AWSALBCORS cookie from OPTIONS pre-flight. Verified: negotiate returns HTTP 200 + connectionToken between FP3 and Qualifying (2026-06-13).

## Architecture

```
OPTIONS /signalrcore/negotiate → 405 but sets AWSALBCORS cookie
POST    /signalrcore/negotiate?negotiateVersion=1 + cookie → connectionToken
WSS     wss://livetiming.formula1.com/signalrcore?id=<token>
  send: {"protocol":"json","version":1}\x1E        (handshake)
  recv: {}\x1E                                     (ack)
  send: {type:1, invocationId, target:"Subscribe", arguments:[[...topics]]} \x1E
  recv: {type:3, invocationId, result:{full_snapshot}}   (initial state)
  recv: {type:1, target:"feed", arguments:[topic, delta, utc]}   (stream)
```

Record separator: `\x1E` (U+001E). Always split raw frames on `\x1E` before parsing JSON.

State merge rule (matches f1-dash `state_service.rs`):
- Object + Object → recursive key merge
- Array + Object(int-string keys) → patch entries by index
- Scalar → replace

## Related Code Files

- Create: `backend/src/f1_strategy/feeder/signalr_core_client.py`
- Modify: `backend/src/f1_strategy/feeder/livef1_feeder.py`
- Modify: `backend/src/f1_strategy/models/race_state.py`
- Modify: `backend/pyproject.toml` (remove `livef1` dep)

## Implementation Steps

1. **Create `signalr_core_client.py`** with:
   - `_negotiate() -> (token, cookie)` — OPTIONS then POST
   - `_inflate(b64: str) -> dict` — `base64.b64decode` → `zlib.decompress(raw, -zlib.MAX_WBITS)` → `json.loads`
   - `_merge(base, update)` — recursive merge in-place, return new value for scalar case
   - `async def listen(on_snapshot, on_update)` — full lifecycle coroutine

   WS connect headers: `User-Agent: BestHTTP`, `Accept-Encoding: gzip,identity`, `Cookie: <awsalbcors>`

2. **Define TOPICS (17)**:
   `Heartbeat, CarData.z, Position.z, ExtrapolatedClock, TimingStats, TimingAppData, WeatherData, TrackStatus, SessionStatus, DriverList, RaceControlMessages, SessionInfo, SessionData, LapCount, TimingData, TeamRadio, ChampionshipPrediction`

3. **Rewrite `livef1_feeder.py`**:
   - Remove all `livef1` imports
   - `start()` calls `signalr_core_client.listen(on_snapshot, on_update)` in asyncio task
   - On snapshot: store full state dict in `self._state`
   - On update: `_merge(self._state.setdefault(topic, {}), delta)`, then broadcast via existing WebSocket
   - On `SessionInfo` name change in update: cancel task → outer retry loop restarts it (matches f1-dash restart pattern)
   - Keep identical public interface (`LiveF1Feeder`, `start()`, `stop()`, callbacks)

4. **CarData.z decode structure**:
   ```
   {"Entries":[{"Utc":"...","Cars":{"1":{"Channels":{"0":rpm,"2":speed,"3":gear,"4":throttle,"5":brake,"45":drs}}}}]}
   ```
   Take `Entries[-1].Cars` as latest snapshot per update.

5. **Position.z decode structure**:
   ```
   {"Position":[{"Timestamp":"...","Entries":{"1":{"Status":"OnTrack","X":f,"Y":f,"Z":f}}}]}
   ```
   Take `Position[-1].Entries` as latest.

6. **Extend `race_state.py`** — add optional fields to live broadcast:
   `car_telemetry`, `car_positions`, `driver_list`, `track_status`, `weather`, `race_control_messages`, `team_radio`, `championship_prediction`, `extrapolated_clock`, `lap_count`, `session_data`, `timing_stats`, `timing_app_data`

7. **Remove `livef1` from `pyproject.toml`** (grep for any other usages first).

## Success Criteria

- [ ] `signalr_core_client.listen()` negotiates + subscribes without exception in a Python REPL
- [ ] `CarData.z` and `Position.z` decompress to dicts with `Entries` key
- [ ] `LiveF1Feeder.start()` receives `Heartbeat`, `DriverList`, `TimingData` within 30s of a live session
- [ ] WebSocket broadcast includes `car_telemetry` and `car_positions` dicts
- [ ] `grep -r "livef1" backend/src` returns no matches

## Risk Assessment

- **AWSALBCORS 7-day expiry**: re-negotiate on every `listen()` call (connection drop always triggers retry)
- **Session name change**: detect in `on_update` when `SessionInfo.Name` changes; cancel + restart listener
- **`CarData.z`/`Position.z` batch sizes**: each update contains multiple timestamped entries; take latest, buffer rest for smooth animation if needed later
