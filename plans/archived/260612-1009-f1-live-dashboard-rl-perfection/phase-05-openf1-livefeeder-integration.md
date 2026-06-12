---
phase: 5
title: "OpenF1 LiveFeeder Integration"
status: pending
priority: P1
effort: "3-5h"
dependencies: [4]
---

# Phase 5: OpenF1 LiveFeeder Integration

## Overview

Implement the real `LiveFeeder` using the **OpenF1 public API** (https://openf1.org) — this
is a completely **free, no-authentication-required** community API. There is no pro plan;
all endpoints are open. If OpenF1 is unavailable during a race weekend, the fallback is
**FastF1's own `fastf1.livetiming` module** which connects directly to F1's official
`livetiming.formula1.com` SignalR feed (FastF1 is already a project dependency).

OpenF1 exposes live timing, car positions, stints, and race control messages via REST polling
at ~1-2s latency. FastF1 livetiming delivers the same data via SignalR streaming.

The frontend gets a **source toggle** button in the race header: `ARCHIVE ↔ LIVE`.

## Live Source Options

**Primary: OpenF1 REST API** — free, no credentials, poll at 1s
- Endpoint base: `https://api.openf1.org/v1/`
- No API key, no subscription, no rate-limit auth headers required
- Historical data available for testing anytime (not race-weekend-only)

**Fallback: FastF1 livetiming** — requires a race weekend to be active
```python
import fastf1.livetiming
# Streams real-time data from livetiming.formula1.com during a live session
# Same data FastF1 uses for post-race analysis
```
Both options use the same `IFeeder` interface — switchable via env var `F1_LIVE_SOURCE=openf1|fastf1`.

## Requirements

**Functional:**
- `LiveFeeder` polls OpenF1 endpoints every 1s for the current or most recent session
- Assembles `RaceState` from: `position`, `car_data` (speed/throttle/brake/gear),
  `stints`, `pit`, `race_control`, `session` endpoints
- Missing fields degrade gracefully (null-safe; no crash if endpoint returns empty)
- Session auto-detection: `GET /api/live/current-session` returns `{session_key, status}`
  using OpenF1 `/sessions?session_type=Race&date_start[gte]=today`
- Frontend source toggle: header button switches WS from archive to live; shows `LIVE` badge
- Replay controls (play/pause/seek) hidden when source = live (not applicable)
- FastF1 fallback path: `FastF1LiveFeeder` class wraps `fastf1.livetiming`; same `IFeeder` interface

**Non-functional:**
- OpenF1 polling respects `Retry-After` headers; backs off on 429
- `LiveFeeder` is stateless between polls — reconstructs `RaceState` from latest snapshot
- Max 1 concurrent HTTP session per `LiveFeeder` instance

## Architecture

```
OpenF1 REST (https://api.openf1.org/v1/)
  /position?session_key={k}&driver_number[]={1..20}
  /car_data?session_key={k}
  /stints?session_key={k}
  /pit?session_key={k}
  /race_control?session_key={k}
  /drivers?session_key={k}
  /sessions?session_type=Race&date_start[gte]={today}

LiveFeeder
  __init__(session_key)
  ticks():
    while not finished:
      positions = await _fetch("/position", ...)
      stints    = await _fetch("/stints", ...)
      pits      = await _fetch("/pit", ...)
      rc        = await _fetch("/race_control", ...)
      state     = _assemble(positions, stints, pits, rc)
      yield state
      await asyncio.sleep(1.0)

_assemble(positions, stints, pits, rc) → RaceState
  cars: [CarState(car_id, position, lap_fraction, gap_leader_s, ...)]
  track_status: from latest rc flag message
  leader_lap: max position[0].lap_number across drivers
```

**OpenF1 → RaceState field mapping:**

| RaceState field | OpenF1 source |
|----------------|--------------|
| `car_id` | `driver_number` as string |
| `driver_code` | `drivers.name_acronym` |
| `team` | `drivers.team_name` |
| `position` | `position.position` |
| `lap_fraction` | `position.x / track_length` (approx) or `car_data.distance % lap_dist` |
| `gap_leader_s` | computed from `position.date` differences |
| `tire.compound` | `stints.compound` |
| `tire.age_laps` | `stints.lap_end - stints.lap_start + stints.tyre_age_at_start` |
| `pit_stops` | count of `pit` rows per driver |
| `track_status` | `race_control.flag` → TrackStatus enum |
| `last_lap_ms` | `car_data` lap time if available |

## Related Code Files

- Modify: `backend/src/f1_strategy/feeder/live_feeder.py` — full implementation (replaces stub)
- Create: `backend/src/f1_strategy/feeder/openf1_client.py` — async HTTP client + response models
- Create: `backend/src/f1_strategy/api/routes_live.py` — `GET /api/live/current-session`
- Modify: `backend/src/f1_strategy/api/app.py` — include `routes_live` router
- Modify: `backend/pyproject.toml` — add `aiohttp` dependency (or use `httpx[asyncio]`)
- Create: `frontend/components/layout/source-toggle.tsx` — ARCHIVE ↔ LIVE button
- Modify: `frontend/components/layout/race-header.tsx` — embed source toggle + LIVE badge

## Implementation Steps

1. **Install `httpx[asyncio]`** (preferred over aiohttp — already used if present; check pyproject):
   ```toml
   dependencies = [..., "httpx>=0.27"]
   ```
2. **Create `feeder/openf1_client.py`** — typed async client:
   ```python
   BASE = "https://api.openf1.org/v1"
   class OpenF1Client:
       def __init__(self): self._client = httpx.AsyncClient(timeout=5.0)
       async def positions(self, session_key: str) -> list[dict]: ...
       async def stints(self, session_key: str) -> list[dict]: ...
       async def pit(self, session_key: str) -> list[dict]: ...
       async def race_control(self, session_key: str) -> list[dict]: ...
       async def drivers(self, session_key: str) -> list[dict]: ...
       async def current_race_session(self) -> dict | None: ...
       async def close(self): await self._client.aclose()
   ```
3. **Implement `LiveFeeder.ticks()`** — poll loop with `_assemble()`:
   - fetch all endpoints concurrently (`asyncio.gather`)
   - assemble `RaceState` using mapping table above
   - yield; sleep 1s; repeat until `race_control` shows chequered flag
4. **Implement `_assemble()`** — null-safe: missing driver entries → `CarState` with defaults;
   missing compound → `None`; unknown flag → `TrackStatus.GREEN`
5. **Create `api/routes_live.py`**:
   ```python
   @router.get("/api/live/current-session")
   async def current_session() -> dict:
       client = OpenF1Client()
       session = await client.current_race_session()
       return {"session_key": session["session_key"] if session else None,
               "status": "active" if session else "none"}
   ```
6. **Add source toggle to frontend** — `source-toggle.tsx` calls `POST /api/sessions/{key}/source`;
   shows `● LIVE` badge (red dot) when live source active; replay controls fade out
7. **Test with a historical session** — use a past OpenF1 session key to verify full parse
   without needing a live race weekend

## Success Criteria

- [ ] `LiveFeeder.ticks()` polls OpenF1 and yields valid `RaceState` objects
- [ ] `_assemble()` is null-safe: no crash when any OpenF1 endpoint returns empty list
- [ ] `GET /api/live/current-session` returns current race session or `{"session_key": null}`
- [ ] Source toggle button switches WS stream; replay controls hidden in live mode
- [ ] `● LIVE` badge visible in header when source = live
- [ ] Historical OpenF1 session parses correctly end-to-end (integration test with real key)
- [ ] HTTP 429 from OpenF1 → exponential backoff, no crash

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| OpenF1 API schema changes | Pydantic models with `model_config = ConfigDict(extra="ignore")` |
| `lap_fraction` hard to compute from OpenF1 position data | Use `x,y` coordinates + track outline to estimate arc fraction |
| Rate limiting during race weekends | Single poll per second; `Retry-After` respected |
| OpenF1 only covers F1 — no WEC support | Out of scope per plan; LiveFeeder is F1-only |
| Live session detection off-weekend returns null | UI shows "no live session" gracefully |
