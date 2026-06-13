# Research Report: f1-dash 4.0.6 — Live Data Access & Feature Analysis

**Date:** 2026-06-13 | **Source:** `/home/than-minh/project/F1_RL/f1-dash-4.0.6`

---

## Executive Summary

f1-dash connects to `livetiming.formula1.com/signalrcore` (SignalR Core, NOT the old `/signalr/` endpoint) **without any authentication**. This is the critical finding: the endpoint we previously tested (`/signalr/negotiate?clientProtocol=1.5`) returns 401, but the SignalR Core endpoint (`/signalrcore/negotiate?negotiateVersion=1`) returns 200 with a valid connection token using only the AWSALBCORS session cookie from a pre-flight OPTIONS request. **Verified live in testing — full negotiate succeeds.**

Track maps come from `api.multiviewer.app/api/v1/circuits/{circuitKey}/{year}` (free, no auth, confirmed 200 for Catalunya 2026).

---

## Critical Finding: How Live Data Works (No Auth)

### Connection Flow

```
1. OPTIONS https://livetiming.formula1.com/signalrcore/negotiate
   → HTTP 405 but sets AWSALBCORS cookie (this is intentional)

2. POST https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1
   Headers: Cookie: AWSALBCORS=<value>
   → 200 OK: { connectionId, connectionToken, availableTransports: [WebSockets, SSE, LongPolling] }

3. WebSocket connect: wss://livetiming.formula1.com/signalrcore?id=<connectionToken>
   Headers: User-Agent: BestHTTP, Accept-Encoding: gzip,identity, Cookie: AWSALBCORS=<value>

4. Handshake: send {"protocol":"json","version":1} + \x1E (record separator U+001E)
   → receive {} + \x1E (handshake ack)

5. Subscribe: send InvocationMessage type=1, target="Subscribe", arguments=[["TimingData","DriverList",...]]
   → receive Completion with full initial state snapshot

6. Stream: receive FeedMessage type=1, target="feed", arguments=(topic, delta_data, utc_timestamp)
```

### Python Verification (tested this session)
```python
import requests
r = requests.options('https://livetiming.formula1.com/signalrcore/negotiate', timeout=5)
cookie = f'AWSALBCORS={r.cookies["AWSALBCORS"]}'
r2 = requests.post('https://livetiming.formula1.com/signalrcore/negotiate?negotiateVersion=1',
    headers={'Cookie': cookie}, timeout=5)
# Result: HTTP 200, connectionToken returned ✅
```

### Difference from old endpoint
| Endpoint | Auth Required | Status |
|---|---|---|
| `/signalr/negotiate?clientProtocol=1.5` | ❌ Yes (F1TV) | 401 during race weekend |
| `/signalrcore/negotiate?negotiateVersion=1` | ✅ No | 200 OK, free |

---

## Topics Subscribed

f1-dash subscribes to 17 topics (all free via /signalrcore):

| Topic | Data | Compressed |
|---|---|---|
| `Heartbeat` | UTC timestamp ping | No |
| `CarData.z` | Per-car: RPM, Speed, Gear, Throttle, Brake, DRS | **Yes** (zlib+base64) |
| `Position.z` | Per-car: X, Y, Z on track coordinates | **Yes** (zlib+base64) |
| `ExtrapolatedClock` | Session remaining time + extrapolating flag | No |
| `TimingStats` | PB lap times, sector bests, speeds per driver | No |
| `TimingAppData` | Tyre stints, grid positions per driver | No |
| `WeatherData` | AirTemp, Humidity, Pressure, Rainfall, TrackTemp, WindDirection, WindSpeed | No |
| `TrackStatus` | Status code (1-7) + message | No |
| `SessionStatus` | Started/Finished/Finalised/Ends | No |
| `DriverList` | Full driver info: name, team, color, headshot URL, country | No |
| `RaceControlMessages` | Flag events, DRS, SC, penalties with scope/sector | No |
| `SessionInfo` | Meeting/circuit info, session type, dates, path | No |
| `SessionData` | Lap series, status series | No |
| `LapCount` | Current/total laps | No |
| `TimingData` | Gaps, intervals, sectors, mini-segments, speeds, InPit, PitOut | No |
| `TeamRadio` | Audio capture paths (base URL: `livetiming.formula1.com/static/`) | No |
| `ChampionshipPrediction` | Live predicted championship standings | No |

### CarData.z / Position.z Decompression
Both are zlib-compressed, base64-encoded JSON. Decompress with:
```python
import base64, zlib, json
raw = base64.b64decode(data)
decompressed = zlib.decompress(raw, -zlib.MAX_WBITS)  # raw inflate (no header)
parsed = json.loads(decompressed)
```

In f1-dash frontend: `pako.inflateRaw(bytes, { to: "string" })`.

---

## State Management Pattern

f1-dash uses **incremental delta merging**:
- Subscribe response = full initial snapshot (all topics)
- Each subsequent feed message = delta update for one topic
- Merge rule: objects recursively merged; arrays patched by integer key index; scalars replaced
- State stored as raw JSON object — no normalization

```rust
// state_service.rs merge() — handles array-as-dict deltas
(Value::Array(prev), Value::Object(update)) => {
    for (k, v) in update {
        if let Ok(index) = k.parse::<usize>() {
            if let Some(item) = prev.get_mut(index) { merge(item, v); }
            else { prev.push(v); }
        }
    }
}
```

Backend broadcasts each delta via SSE (`event: update`, `data: {topic: delta}`). Frontend uses a 200ms tick interval to apply buffered updates with optional delay support.

---

## Track Map Source

**`api.multiviewer.app/api/v1/circuits/{circuitKey}/{year}`** — free, no auth, CORS open.

Response contains:
```json
{
  "x": [...],          // track outline X coords
  "y": [...],          // track outline Y coords
  "rotation": -90.0,   // optimal display rotation
  "corners": [         // corner number + trackPosition + angle for label placement
    { "number": 1, "trackPosition": {"x": -3102, "y": -6966}, "angle": -68.9, "length": 8118 }
  ],
  "marshalSectors": [  // sector boundaries for yellow flag coloring
    { "trackPosition": {"x": ..., "y": ...}, "number": 1 }
  ]
}
```

The `circuitKey` comes from `SessionInfo.Meeting.Circuit.Key` in the live stream (e.g., 15 = Catalunya). **This replaces our current FastF1-based outline loading entirely.**

---

## Features Worth Incorporating

### High Priority (directly useful for our RL pit wall)

1. **SignalR Core live connection** — replace the broken `livef1` package with direct websocket to `/signalrcore`. No auth needed. Gets ALL 17 topics including CarData.z and Position.z.

2. **Multiviewer track map API** — replaces FastF1 circuit outline fetching. Includes corners, marshal sectors for yellow zone rendering. Works during live sessions.

3. **Mini-sector segment colors** — `TimingDataDriver.Sectors[].Segments[].Status`: 0=none, 2048=yellow, 2049=green (personal best), 2051=purple (overall fastest). Provides per-mini-sector track position display.

4. **DRS status from CarData** — `CarData.z` channel `"45"`: 0-7=off, 8=eligible but inactive, 10-14=active. Real-time per-driver DRS indicator.

5. **`TrackStatus` codes** — 1=Clear, 2=Yellow, 3=Flag, 4=SC, 5=Red, 6=VSC Deployed, 7=VSC Ending. Color-code entire track map + timing tower.

6. **`ChampionshipPrediction`** — live predicted championship standings as session unfolds. Shows current vs predicted position/points per driver and team.

7. **`ExtrapolatedClock`** — session remaining time with extrapolation flag. Better session timer than our current approach.

### Medium Priority (UX enhancements)

8. **Broadcast delay buffer** — f1-dash implements adjustable delay (0–60s) to sync with TV broadcast. Buffer stores timestamped frames; apply at (now - delayMs). Useful for watching F1TV simultaneously.

9. **Marshal sector yellow highlighting on track map** — using `marshalSectors` from multiviewer + `RaceControlMessages` flag events to color individual track sectors yellow.

10. **Corner number labels on track map** — `corners[].number` + label position calculated from `angle` offset (540 units from track center).

11. **Qualifying danger zone** — highlight drivers in elimination zone: P16+ in Q1, P11+ in Q2, based on `TimingData.SessionPart`.

12. **`TimingStats` speed traps** — I1, I2, FL, ST speed trap values per driver with fastest highlighting.

### Lower Priority

13. **OLED mode** — pure black background variant for OLED displays. Single CSS class toggle.

14. **Favorite driver highlighting** — sky-blue border ring on track map + blue-tinted row in timing tower.

15. **Weather radar map** — RainViewer API (`tilecache.rainviewer.com/v2/`) overlaid on circuit area. f1-dash has full implementation in `weather/map.tsx`.

---

## Architecture for Integration

f1-dash's Rust backend is a thin proxy:
```
F1 SignalR Core → Rust (state merge + SSE broadcast) → Next.js frontend
```

For our Python backend the equivalent is:
```
F1 SignalR Core (websockets) → Python (asyncio, state merge) → FastAPI SSE → Next.js frontend
```

We already have `LiveF1Feeder` infrastructure. We need to:
1. Replace `livef1.RealF1Client` (old SignalR, broken) with direct `websockets` to `/signalrcore`
2. Implement the negotiate → handshake → subscribe flow in Python
3. Handle `CarData.z` / `Position.z` decompression (zlib raw inflate)
4. Update topic list to match f1-dash's 17 topics

---

## Unresolved Questions

1. Does `/signalrcore` also return 401/403 between race weekend sessions (not during)? We tested between FP3 and Qualifying — negotiated successfully. Needs confirmation during Qualifying.
2. Are CarData.z/Position.z update frequency the same as old SignalR (i.e., ~3.7Hz for position, ~2Hz for telemetry)?
3. TeamRadio path base: assumed `livetiming.formula1.com/static/{session_path}/` — needs verification.
4. Does `ChampionshipPrediction` update in real-time or only at session end?
