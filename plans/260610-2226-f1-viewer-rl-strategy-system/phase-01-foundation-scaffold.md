---
phase: 1
title: 'Foundation: Scaffold'
status: completed
priority: P1
effort: 1d
dependencies: []
---

# Phase 1: Foundation: Scaffold

## Overview
Repo skeleton: Python backend (uv), Next.js frontend, core `RaceState` Pydantic models (series-agnostic), data dir layout, tooling. Everything later builds on these models.

## Requirements
- Functional: importable `f1_strategy` package; `make dev` starts backend+frontend; core models defined + unit-tested.
- Non-functional: Python 3.11+, snake_case modules, files <200 LOC, type hints everywhere, ruff + pytest configured.

## Architecture
Monorepo: `backend/` (uv project) + `frontend/` (create-next-app, TS, App Router) + `data/` (gitignored). Core models live in `backend/src/f1_strategy/models/` — single source of truth shared by ingestion, replay, sim, API.

Series-agnostic `RaceState` (Pydantic v2):
```python
class CarState(BaseModel):
    car_id: str                 # driver number as str (series-agnostic)
    position: int
    lap: int
    gap_leader_s: float | None
    interval_s: float | None
    last_lap_ms: int | None
    tire: TireState | None      # compound: str (not enum-locked), age_laps
    car_class: str | None       # F1: None; future multi-class
    fuel_state: dict | None     # F1: None; future refueling series
    status: CarStatus           # running | pitting | in_pit | out | finished

class RaceState(BaseModel):
    session_key: str
    t_session_s: float
    leader_lap: int
    total_laps: int | None
    track_status: TrackStatus   # green|sc|vsc|red|yellow_zone (extensible str enum)
    cars: list[CarState]        # variable length — NOT fixed 20
    weather: WeatherState | None
    rc_messages: list[RaceControlMsg]
```

## Related Code Files
- Create: `backend/pyproject.toml`, `backend/src/f1_strategy/__init__.py`
- Create: `backend/src/f1_strategy/models/{race_state.py, session_meta.py, __init__.py}`
- Create: `backend/src/f1_strategy/config.py` (paths: data dir, parquet root, duckdb file, fastf1 cache — env-overridable)
- Create: `backend/tests/test_race_state_models.py`
- Create: `frontend/` via `npx create-next-app@latest` (TS, App Router, Tailwind)
- Create: `Makefile`, `.gitignore` (data/, .venv, node_modules, *.duckdb), `README.md`

## Implementation Steps
1. `git init`; create dir layout above.
2. `cd backend && uv init`; add deps: pydantic, fastf1, duckdb, pyarrow, pandas, fastapi, uvicorn[standard]; dev: pytest, ruff. (torch/sb3/gymnasium/lightgbm deferred to phases 6-7 — keep install light.)
3. Write `config.py` with `Settings` (pydantic-settings): `DATA_DIR=./data`, derived `PARQUET_DIR`, `DUCKDB_PATH`, `FASTF1_CACHE_DIR`.
4. Write `models/race_state.py` per architecture above + `session_meta.py` (`SessionMeta`: session_key `{year}_{round}_{session}`, year, round, event_name, session_type, circuit, date, total_laps).
5. Unit tests: model validation, serialization round-trip, variable car count, None-able fields.
6. Scaffold frontend; verify `npm run dev`.
7. `Makefile`: `dev` (concurrent backend uvicorn + frontend), `test`, `lint`, `ingest` (placeholder).
8. README: project summary, setup, link to plan + brainstorm report.

## Success Criteria
- [ ] `uv run pytest` green; `uv run ruff check` clean
- [ ] `RaceState` round-trips JSON with 22-car F1 grid AND a hypothetical 60-car multi-class grid (series-agnostic proof)
- [ ] `make dev` serves backend :8000 + frontend :3000
- [ ] No file >200 LOC

## Risk Assessment
- Model schema churn later → mitigate: keep models minimal now; additive evolution only (optional fields).
