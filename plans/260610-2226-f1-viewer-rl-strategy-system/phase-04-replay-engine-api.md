---
phase: 4
title: Replay Engine + API
status: in-progress
priority: P1
effort: 4d
dependencies:
  - 3
---

# Phase 4: Replay Engine + API

## Overview
The "simulated live" core: `LiveSource` interface + `ReplaySource` implementation that streams archived races as `RaceState` ticks at 1×/2×/10×/jump-to-lap, plus FastAPI REST + WebSocket serving archive and tick stream.

## Requirements
- Functional: start replay for any archived race; play/pause/speed/seek-to-lap; WS broadcasts ticks + control acks; REST for archive browse + telemetry.
- Non-functional: tick cadence ~1Hz wall-clock at 1× (state interpolated between lap boundaries); multiple WS clients share one replay session; <50ms tick assembly.

## Architecture
```python
class LiveSource(ABC):                      # v2 SignalR adapter implements this too
    async def states(self) -> AsyncIterator[RaceState]: ...

class ReplaySource(LiveSource):
    # built from archive laps/pits/weather/rc for one session_key
    # internal timeline: per-car cumulative lap-time → session_time events
    # controls: play/pause/set_speed/seek_lap
```
Tick building: pre-compute per-car array of (lap, cum_time_ms, position, tire, pit flags) from laps parquet; at session_time T interpolate gaps/positions; SC periods from race_control reshape track_status. Replay session manager: one `ReplaySource` per session_key, fan-out via asyncio queues to N WS clients.

WS protocol (JSON):
- server→client: `{"type":"race_state", "data": RaceState}`, `{"type":"replay_status", playing, speed, t}`
- client→server: `{"type":"control", "action":"play|pause|speed|seek", "value":...}`

REST: `GET /api/seasons`, `/api/events/{year}`, `/api/sessions/{year}/{round}`, `/api/sessions/{key}/laps|stints|pits|results|weather|rc`, `/api/sessions/{key}/telemetry/{car}/{lap}`, `POST /api/replay/{key}` (create), `WS /ws/replay/{key}`.

## Related Code Files
- Create: `backend/src/f1_strategy/replay/{__init__.py, live_source.py, replay_source.py, timeline_builder.py, session_manager.py}`
- Create: `backend/src/f1_strategy/api/{__init__.py, app.py, routes_archive.py, routes_replay.py, ws_replay.py, schemas.py}`
- Create: `backend/tests/replay/{test_timeline_builder.py, test_replay_source.py}`, `backend/tests/api/test_ws_replay.py`
- Modify: `Makefile` (`dev` runs uvicorn `f1_strategy.api.app:app`)

## Implementation Steps
1. `timeline_builder.py`: laps DF → per-car event timeline; unit-test against known race (gaps at lap N match archive).
2. `replay_source.py`: asyncio loop advancing virtual session_time by `speed × dt`; emit `RaceState` each tick; seek rebuilds state from timeline (idempotent snapshot function `state_at(t)` — this function is also what phase 7 uses to extract sim initial conditions).
3. `session_manager.py`: registry, client fan-out, auto-teardown when last client leaves.
4. FastAPI app + routers; pydantic schemas reuse phase-1 models.
5. WS endpoint: subscribe → push current state immediately → stream; handle control msgs.
6. Integration test: replay 2024 Bahrain at 100×, assert final tick classification == archived results.

## Success Criteria
- [ ] Replay any archived race; final positions match official results
- [ ] Seek to lap 30 mid-replay reproduces identical state as continuous play (determinism)
- [ ] 2 concurrent WS clients receive identical tick streams
- [ ] `state_at(t)` pure/deterministic (snapshot test)

## Risk Assessment
- Lap-time-only interpolation gives approximate mid-lap gaps → acceptable for v1; document; position coords for map come from telemetry per displayed lap (phase 5 decides fidelity).
- Asyncio drift at high speeds → tick scheduler uses absolute deadlines, not sleep accumulation.
