# Plan: Live Fix + Frontend Rewrite + Docker

**Status:** pending  
**Branch:** main

## Phases

| # | Phase | Status |
|---|-------|--------|
| 1 | Fix live data pipeline | pending |
| 2 | Frontend ground-up rewrite | pending |
| 3 | Docker Compose single-command stack | pending |

---

## Phase 1 — Fix live data pipeline

**Files to change:**
- `backend/src/f1_strategy/feeder/livef1_feeder.py`
- `backend/src/f1_strategy/api/ws_feeder.py`
- `backend/src/f1_strategy/api/app.py` (CORS)

**Bugs:**
1. `_run_signalr()` calls `await client._run()` → must be `await client._async_run()` to run `_forever_check()` keepalive alongside the connection
2. Callback registered as `"livef1_feeder_handler"` → must be `"feed"` (F1 SignalR Streaming hub method name, confirmed by FastF1)
3. `ws_feeder.py` calls `queries.session_has_laps()` + `queries.ensure_session()` unconditionally → these are archive-only; live sessions (`"live"`, `"livef1"`) must skip them
4. CORS `allow_origins=["http://localhost:3000"]` → add `"*"` or configurable env var for Docker

**Fix strategy:**
- `_run_signalr`: replace `_run()` with `_async_run()`; register callback as `"feed"`
- `ws_feeder.py`: skip archive loading when feeder source is live
- `app.py`: read `CORS_ORIGINS` env var; default includes `localhost:3000` + `*` in dev

---

## Phase 2 — Frontend ground-up rewrite

**Approach:**
- Delete `frontend/app/` and `frontend/components/` (all buggy UI)
- Keep `frontend/lib/` (solid: types, api-client, stores, design-tokens, use-track-geo, use-canvas-loop, feeder-client, prediction-store, team-colors)
- Rebuild with a flat, single-page architecture (no nested `/session/[key]` routes)

**New structure:**
```
app/
  layout.tsx           # root layout: fonts, globals, metadata
  page.tsx             # home: session picker → main dashboard
  globals.css          # F1 Pit Wall design system tokens

components/
  shell/
    header.tsx         # top bar: session label + source toggle
    side-nav.tsx       # icon-only collapsible nav (Dashboard, Archive)
  views/
    replay-view.tsx    # full pit wall: map + tower + gap + stints + strategy
    telemetry-view.tsx # multi-driver chart (clean rewrite)
  track-map.tsx        # 60fps canvas (driver labels fixed)
  timing-tower.tsx     # live standings
  gap-chart.tsx        # gap evolution
  stint-bars.tsx       # tyre stints (hook ordering fixed)
  strategy/
    strategy-panel.tsx # SC gauge + pit-window viz + what-if
    pit-window-viz.tsx # action badges + pit probability bars
    sc-gauge.tsx
    undercut-toasts.tsx
  telemetry/
    telemetry-compare.tsx  # multi-driver, all-laps
    telemetry-traces.tsx   # SVG overlay chart
  playback-controls.tsx
  session-picker.tsx
```

**Key fixes vs old code:**
- No React hook ordering violations (hooks always before any conditional return)
- No `useEffect` dependency-array warnings (all deps explicit)
- `TelemetryView` accessible from top tab bar without URL routing
- `TrackMap` driver-code labels correct (from prev session, preserved)
- `StrategyPanel` pit-window visualizer as primary (prev session, preserved)

---

## Phase 3 — Docker Compose

**Files to create:**
- `Dockerfile.backend`
- `Dockerfile.frontend`
- `docker-compose.yml`

**Stack:**
```yaml
services:
  backend:   uvicorn on :8000, data/ volume-mounted
  frontend:  next dev (or next start) on :3000, proxies /api + /ws to backend
```

**Makefile**: keep existing targets; add `docker-up` / `docker-down` shortcuts

---

## Acceptance Criteria

- [ ] `/ws/feed/live` connects and streams `race_state` ticks (verifiable via wscat)
- [ ] `LiveF1Feeder` logs `"SignalR feed received"` during an active session
- [ ] `LiveFeeder` resolves OpenF1 key and polls without 404
- [ ] Frontend loads at `localhost:3000`, no console errors on initial render
- [ ] Replay tab: track map draws, timing tower updates, stints visible
- [ ] Telemetry tab: loads multi-driver comparison without crashes
- [ ] `docker compose up` starts both services, frontend reachable on :3000
- [ ] `docker compose up` works with a single command from repo root
