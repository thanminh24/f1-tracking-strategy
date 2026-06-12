---
phase: 3
title: Archive
status: completed
priority: P1
effort: 2d
dependencies:
  - 2
---

# Phase 3: Archive

## Overview
Query layer over the Parquet lake: DuckDB views + typed Python query API + on-demand telemetry service. This is the single read path for replay engine, simulator calibration, and REST API.

## Requirements
- Functional: list seasons/weekends/sessions; per-session laps/stints/pits/results/weather/RC; cross-session analytics (stint deg data, pit loss per track, SC history per track); per-driver-lap telemetry fetched lazily via FastF1.
- Non-functional: archive queries <100ms typical; telemetry first-fetch seconds (network), cached thereafter; read-only DuckDB over Parquet (no data duplication).

## Architecture
```
archive/db.py          → duckdb connection, CREATE VIEW x AS SELECT * FROM read_parquet(...)
archive/queries.py     → typed functions returning DataFrames/Pydantic (sessions, laps, stints…)
archive/analytics.py   → deg-fitting datasets, pit-loss estimates, sc_history (consumed by phase 6)
archive/telemetry_service.py → get_telemetry(session_key, car_id, lap) via fastf1; LRU + disk cache
```
`analytics.py` outputs (consumed by sim calibration):
- `stint_deg_dataset(track?)`: clean racing laps only (exclude in/out laps, SC/VSC laps, traffic-affected: gap_ahead < 1.5s flag), cols: track, compound, tire_age, fuel_proxy (lap_number), lap_ms, year.
- `pit_loss_per_track()`: median (pit lap + out lap) delta vs clean laps.
- `sc_history()`: SC/VSC deployments per session from race_control + track_status, with lap numbers.

## Related Code Files
- Create: `backend/src/f1_strategy/archive/{__init__.py, db.py, queries.py, analytics.py, telemetry_service.py}`
- Create: `backend/tests/archive/{test_queries.py, test_analytics.py}`

## Implementation Steps
1. `db.py`: lazy singleton conn; register views over `data/parquet/{entity}/**`; helper `query(sql, params)`.
2. `queries.py`: `list_seasons()`, `list_events(year)`, `list_sessions(year, round)`, `get_laps(session_key)`, `get_stints`, `get_pit_stops`, `get_results`, `get_weather`, `get_race_control`. Return Pydantic for API-facing, DataFrame for internal.
3. `analytics.py` per architecture; document lap-filter rules in docstrings (they define calibration quality).
4. `telemetry_service.py`: maps session_key → fastf1 session; `pick_driver(car_id).get_telemetry()`; downsample to ~10Hz for API payloads; cache processed result as parquet under `data/telemetry_cache/`.
5. Tests against the real ingested archive (skip-if-missing marker for CI-less local runs).

## Success Criteria
- [x] All query functions return correct shapes for a known session (assert against published results, e.g. 2024 Bahrain winner/laps)
- [x] `stint_deg_dataset` excludes in/out/SC laps (spot-check counts)
- [ ] Telemetry: first call fetches+caches; second call <50ms
- [ ] Archive-wide query (all 2024-26 stints) <1s
- [x] Saved DB build path exists: `make build-archive-db` / `scripts/build-archive-db.sh` materializes `data/archive.duckdb`

## Risk Assessment
- Dirty data (red flags, crashes, missing laps) skews analytics → strict lap filters + per-track sample-size floor; surface n per fit.
- FastF1 session load is slow (~10-30s first time) → telemetry_service keeps loaded sessions in small LRU.
