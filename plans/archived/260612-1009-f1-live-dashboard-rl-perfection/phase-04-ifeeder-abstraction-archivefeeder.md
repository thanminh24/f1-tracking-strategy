---
phase: 4
title: "IFeeder Abstraction & ArchiveFeeder"
status: pending
priority: P1
effort: "2-3h"
dependencies: []
---

# Phase 4: IFeeder Abstraction & ArchiveFeeder

## Overview

Introduce a `IFeeder` protocol that decouples the dashboard WebSocket from the data source.
`ArchiveFeeder` wraps the existing `ReplaySource` (archive-backed, play/pause/seek).
`LiveFeeder` is a stub that satisfies the interface but yields nothing (phase 5 fills it in).
The WS endpoint is updated to accept a `source` query param (`archive` | `live`).

The existing `LiveSource` ABC in `replay_source.py` already has the right shape — this phase
formalises it as `IFeeder`, moves replay under it, and wires up the API switching layer.

## Requirements

**Functional:**
- `IFeeder` protocol: `async def ticks() -> AsyncIterator[RaceState]` + metadata properties
- `ArchiveFeeder`: wraps `ReplaySource`; exposes play/pause/speed/seek controls
- `LiveFeeder` stub: `__init__(session_key)`, `ticks()` yields nothing, `is_live = True`
- `GET /api/sessions/{key}/source` — returns `{"source": "archive"|"live", "live_available": bool}`
- `POST /api/sessions/{key}/source` — body `{"source": "archive"|"live"}` switches active feeder
- WS `/ws/feed/{session_key}` replaces `/ws/replay/{session_key}` (keep old path as alias)
- Frontend `FeederClient` replaces `ReplayWsClient` — same message protocol, source-agnostic

**Non-functional:**
- Existing replay WS behavior unchanged (no regression on archive sessions)
- `LiveFeeder` stub logs a warning per tick ("live source not connected") rather than erroring
- Source switch is per-session; concurrent sessions can have different sources

## Architecture

```
backend/src/f1_strategy/feeder/        NEW module
  __init__.py
  protocol.py       IFeeder protocol (typing.Protocol)
  archive_feeder.py ArchiveFeeder wraps ReplaySource
  live_feeder.py    LiveFeeder stub (phase 5 fills in)
  session_registry.py  session_key → active IFeeder instance

api/
  ws_feeder.py      NEW: WS /ws/feed/{key} backed by IFeeder (replaces ws_replay.py)
  routes_source.py  NEW: GET/POST /api/sessions/{key}/source

frontend/lib/
  feeder-client.ts  NEW: replaces ws-replay-client.ts, source-agnostic
```

**IFeeder protocol:**
```python
class IFeeder(Protocol):
    session_key: str
    is_live: bool

    async def ticks(self) -> AsyncIterator[RaceState]: ...
    def status(self) -> dict: ...        # {"playing", "speed", "t_s", "finished", "source"}
    def play(self) -> None: ...
    def pause(self) -> None: ...
    def set_speed(self, speed: float) -> None: ...
    def seek_lap(self, lap: int) -> None: ...
```

**WS message protocol (unchanged):**
- Server → client: `{"type": "state", "data": RaceState.model_dump()}` (same as current)
- Server → client: `{"type": "status", "data": {...feeder status...}}`
- Client → server: `{"cmd": "play"|"pause"|"speed"|"seek", ...}` (same as current)

## Related Code Files

- Create: `backend/src/f1_strategy/feeder/__init__.py`
- Create: `backend/src/f1_strategy/feeder/protocol.py`
- Create: `backend/src/f1_strategy/feeder/archive_feeder.py`
- Create: `backend/src/f1_strategy/feeder/live_feeder.py`
- Create: `backend/src/f1_strategy/feeder/session_registry.py`
- Create: `backend/src/f1_strategy/api/ws_feeder.py`
- Create: `backend/src/f1_strategy/api/routes_source.py`
- Modify: `backend/src/f1_strategy/api/app.py` — include `ws_feeder` + `routes_source` routers
- Create: `frontend/lib/feeder-client.ts`
- Modify: `frontend/app/session/[key]/replay-dashboard.tsx` — swap `ReplayWsClient` → `FeederClient`

## Implementation Steps

1. **Create `feeder/protocol.py`** — define `IFeeder` as `typing.Protocol` with properties
   `session_key`, `is_live` and methods `ticks`, `status`, `play`, `pause`, `set_speed`, `seek_lap`
2. **Create `feeder/archive_feeder.py`** — thin wrapper around existing `ReplaySource`:
   ```python
   class ArchiveFeeder:
       is_live = False
       def __init__(self, session_key: str):
           timeline = build_timeline(session_key)
           self._src = ReplaySource(timeline)
       async def ticks(self): async for s in self._src.states(): yield s
       def play(self): self._src.play()
       # ... delegate pause/speed/seek to self._src
   ```
3. **Create `feeder/live_feeder.py`** — stub only:
   ```python
   class LiveFeeder:
       is_live = True
       def __init__(self, session_key: str): self.session_key = session_key
       async def ticks(self):
           log.warning("live feed not connected: %s", self.session_key)
           return  # empty async generator
           yield    # unreachable; makes this an async generator
   ```
4. **Create `feeder/session_registry.py`** — dict `session_key → IFeeder`; `get_or_create`,
   `switch_source(key, "archive"|"live")`, `remove(key)`
5. **Create `api/ws_feeder.py`** — mirrors `ws_replay.py` but uses `session_registry.get_or_create`
   instead of `session_manager`; keep same message format
6. **Create `api/routes_source.py`** — GET returns current source; POST calls `switch_source`
7. **Register both new routers in `app.py`**; keep `ws_replay` router as alias for backward compat
8. **Create `frontend/lib/feeder-client.ts`** — replace `ReplayWsClient`; same connect/close/
   send API; add `source` property; update `replay-dashboard.tsx` to use it
9. **Smoke test** — start `make dev`, open archive session, verify replay still works end-to-end

## Success Criteria

- [ ] Archive replay works through new `ArchiveFeeder` path (no regression)
- [ ] `GET /api/sessions/{key}/source` returns `{"source": "archive", "live_available": false}`
- [ ] `POST /api/sessions/{key}/source` with `{"source": "live"}` switches to `LiveFeeder` stub
   (WS stream goes quiet; no crash)
- [ ] `IFeeder` protocol is satisfied by both `ArchiveFeeder` and `LiveFeeder` (mypy clean)
- [ ] Old `/ws/replay/{key}` endpoint still functional (backward compat alias)
- [ ] `FeederClient` replaces `ReplayWsClient` in frontend without behavior regression

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Protocol structural subtyping confusion | Use `@runtime_checkable` + explicit `assert isinstance` in registry |
| Session registry memory leak (session never removed) | Add TTL cleanup or remove on WS disconnect |
| Two concurrent WS connections to same session (archive + client) | Registry ensures single feeder per session_key |
