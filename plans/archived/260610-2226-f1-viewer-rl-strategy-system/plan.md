---
title: F1 Viewer + RL Strategy System
description: >-
  Local-first F1 viewer: 2024+ archive, replay engine, telemetry dashboard,
  lap-level race simulator, RL/ML strategy predictions (probabilistic)
status: completed
priority: P2
branch: ''
tags:
  - f1
  - rl
  - telemetry
  - fastapi
  - nextjs
  - duckdb
blockedBy: []
blocks: []
created: '2026-06-10T15:30:28.521Z'
createdBy: 'ck:plan'
source: skill
---

# F1 Viewer + RL Strategy System

## Overview

Local-first web app: FastF1 → Parquet/DuckDB archive (2024→now), replay engine streaming `RaceState` ticks ("simulated live"), Next.js viewer (track map, timing tower, telemetry), lap-level Gymnasium race simulator calibrated from archive, ML/RL strategy layer (SB3 PPO optimal policy, team behavior GBM, SC hazard model, Monte Carlo outcome probabilities), strategy overlay + what-if explorer. ALL predictions probabilistic.

Design source: `plans/reports/brainstorm-260610-2213-f1-viewer-rl-strategy-system-report.md` (user-approved).

## Architecture

```
backend/  (Python 3.11+, uv)          frontend/  (Next.js + TS)
  src/f1_strategy/
    ingestion/   FastF1 → Parquet       app/        archive browser, replay view
    archive/     DuckDB views + queries  components/ track-map, timing-tower,
    replay/      LiveSource + replay                 telemetry-charts, strategy-overlay
    sim/         gymnasium env + calib   lib/        ws-client, api-client, state store
    strategy/    ppo, behavior, sc, mc
    api/         FastAPI REST + WS
data/  (gitignored) parquet/ + archive.duckdb + fastf1_cache/
```

Key invariant: `RaceState` schema + tick protocol are series-agnostic — variable car count, optional refueling/multi-class/track-status fields. No hardcoded F1 assumptions in core models.

## Phases

| Phase | Name | Status |
|-------|------|--------|
| 1 | [Foundation: Scaffold](./phase-01-foundation-scaffold.md) | Completed |
| 2 | [Ingestion](./phase-02-ingestion.md) | Completed |
| 3 | [Archive](./phase-03-archive.md) | Completed |
| 4 | [Replay Engine + API](./phase-04-replay-engine-api.md) | Completed |
| 5 | [Viewer Frontend](./phase-05-viewer-frontend.md) | Completed |
| 6 | [Race Simulator + Calibration](./phase-06-race-simulator-calibration.md) | Completed (single-race gate) |
| 7 | [ML/RL Strategy Layer](./phase-07-ml-rl-strategy-layer.md) | Completed (single-race scope) |
| 8 | [Strategy UI + What-If Explorer](./phase-08-strategy-ui-what-if-explorer.md) | Completed |
| 9 | [Retrieve-Only Mode (Scratch Tier)](./phase-09-retrieve-only-scratch-tier.md) | Completed |

Dependency chain: 1→2→3→4→5; 6 needs 3; 7 needs 6 (+4 for serving); 8 needs 5+7.
Hard gate: Phase 6 sim validation MUST pass before Phase 7 RL work starts.

## Current Todo
All phases complete at single-race scope (user-approved 260611: Bahrain 2024 only).
Remaining work unlocks with the full archive backfill (`make ingest-backfill`):
- Re-run phase 6 validation gate on held-out 2024-25 race set (n=1 report exists).
- Re-train SC hazard (currently prior mode — 0 deployments in archive) + behavior model
  (currently quality=fallback — no holdout possible) via `f1-train-models`.
- Full PPO eval: 500 sims, time-gain ≥1.5s gate, per track-cluster training (`f1-train-ppo`).
- Phase 8 demo pass in browser (60fps check, screenshots into docs/).
- Phase 2 (historical): verify backfill completes cleanly when run on this machine.

## Next: Interactive Multi-Driver Dashboard (v2)

Full race-weekend dashboard with a pluggable feeder interface. Archive data is the default feeder; a live SignalR source can be hot-swapped in.

**Requirements (user-stated 2026-06-11):**
- All drivers + teams visible simultaneously: track map, timing tower, gap chart, telemetry overlays (speed/throttle/brake/gear), stint bars
- Feeder abstraction: `ArchiveFeeder` (replays parquet ticks) and `LiveFeeder` (SignalR adapter) implement the same `IFeeder` interface so the dashboard is source-agnostic
- Strategy model overlay available per driver (from Phase 7 outputs)
- Snapshot/scrub timeline: seek by lap or wall-clock time
- Performance: 60 fps canvas render; WebSocket fan-out from backend

**Planned phases:**
| Phase | Name |
|-------|------|
| 10 | Feeder abstraction layer (IFeeder, ArchiveFeeder, LiveFeeder stub) |
| 11 | Multi-driver canvas dashboard (track map, timing, gap, telemetry) |
| 12 | Strategy overlay integration + what-if hooks per driver |

## Out of Scope (this plan)

- WEC/multi-series support → v3 (kept possible via series-agnostic schema)
- Hosting/auth/deployment — local only
- Physics-level simulation, deterministic predictions

## Dependencies

External: fastf1, duckdb, pyarrow, pandas, fastapi, uvicorn, pydantic v2, gymnasium, stable-baselines3, torch (CUDA, RTX 4060), lightgbm, scikit-learn, Next.js 15, React 18+, visx/d3. Cross-plan: none.
