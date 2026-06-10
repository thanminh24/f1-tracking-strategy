---
title: F1 Viewer + RL Strategy System
description: >-
  Local-first F1 viewer: 2024+ archive, replay engine, telemetry dashboard,
  lap-level race simulator, RL/ML strategy predictions (probabilistic)
status: pending
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
| 6 | [Race Simulator + Calibration](./phase-06-race-simulator-calibration.md) | Pending |
| 7 | [ML/RL Strategy Layer](./phase-07-ml-rl-strategy-layer.md) | Pending |
| 8 | [Strategy UI + What-If Explorer](./phase-08-strategy-ui-what-if-explorer.md) | Pending |

Dependency chain: 1→2→3→4→5; 6 needs 3; 7 needs 6 (+4 for serving); 8 needs 5+7.
Hard gate: Phase 6 sim validation MUST pass before Phase 7 RL work starts.

## Out of Scope (this plan)

- Live SignalR adapter → v2 (interface `LiveSource` reserved in Phase 4; record raw streams during race weekends when convenient)
- WEC/multi-series support → v3 (kept possible via series-agnostic schema)
- Hosting/auth/deployment — local only
- Physics-level simulation, deterministic predictions

## Dependencies

External: fastf1, duckdb, pyarrow, pandas, fastapi, uvicorn, pydantic v2, gymnasium, stable-baselines3, torch (CUDA, RTX 4060), lightgbm, scikit-learn, Next.js 15, React 18+, visx/d3. Cross-plan: none.
