# F1 Viewer + RL Strategy System

Local-first Formula 1 viewer helper: 2024→now archival data, "simulated live" race
replay, per-driver telemetry, and a probabilistic RL/ML strategy layer (recommended
actions, pit windows, safety-car hazard, outcome probabilities, what-if exploration).

## Stack

- **Backend** `backend/` — Python 3.12 (uv), FastF1, DuckDB + Parquet, FastAPI + WebSocket,
  Gymnasium + Stable-Baselines3 (phases 6-7)
- **Frontend** `frontend/` — Next.js (App Router, TS, Tailwind)
- **Data** `data/` — gitignored: Parquet lake, FastF1 cache, calibration + model artifacts

## Setup

```bash
# backend (requires uv: https://docs.astral.sh/uv/)
cd backend && uv sync

# frontend
cd frontend && npm install
```

## Develop

```bash
make dev          # backend :8000 + frontend :3000
make test         # backend pytest
make lint         # ruff
make ingest ARGS="--year 2024 --round 1"   # ingest one weekend into the archive
make ingest-backfill                        # full 2024→now archive (long; ~5GB)
make clean-scratch                          # drop viewer-retrieved sessions
```

Races opened through the viewer are **retrieve-only**: fetched from FastF1 into a
purgeable scratch tier (`data/scratch_parquet/`) — the durable archive
(`data/parquet/`) grows only via the explicit `make ingest` / backfill CLI.
Archive ingest evicts any scratch copy of the same session. Purge scratch before
calibration runs (phase 6+) so models train on deliberately archived data only.

## Project docs

- Plan: `plans/260610-2226-f1-viewer-rl-strategy-system/plan.md` (8 phases)
- Design: `plans/reports/brainstorm-260610-2213-f1-viewer-rl-strategy-system-report.md`

Key invariant: core `RaceState` models are series-agnostic (variable car count,
optional class/fuel fields) — F1-specific logic lives in adapters, keeping future
series support (e.g. WEC) a module rather than a rewrite.
