---
phase: 2
title: "Ingestion"
status: pending
priority: P1
effort: "3d"
dependencies: [1]
---

# Phase 2: Ingestion

## Overview
FastF1 → Parquet pipeline: download every 2024→now session's laps, stints, pit stops, positions (lap-level), weather, race control, results into partitioned Parquet. Telemetry stays on-demand via FastF1 cache (NOT bulk-downloaded).

## Requirements
- Functional: CLI `uv run f1-ingest --year 2024 [--round N] [--session R]`; idempotent (skip already-ingested unless `--force`); resumable backfill for ~70 weekends.
- Non-functional: respect FastF1 rate limits (built-in throttle + its HTTP cache); one failed session doesn't abort the run; structured logging per session.

## Architecture
```
FastF1 (cache: data/fastf1_cache/)
  → extractors (one per entity, pure functions: fastf1 session → pd.DataFrame)
  → normalizers (column names/dtypes → our schema, ms ints for times)
  → parquet writer: data/parquet/{entity}/year=YYYY/session_key=.../part.parquet
  → ingestion_log.parquet (session_key, entity, rows, status, ingested_at)
```
Entities: `sessions` (meta), `laps`, `stints`, `pit_stops`, `positions_lap` (position per car per lap), `weather`, `race_control`, `results`. Position *coordinate* data (X/Y for track map) extracted separately per session on demand (phase 4/5) — it lives in telemetry, too big for bulk.

Key FastF1 mappings: `session.laps` → laps+stints (Stint, Compound, TyreLife cols); pit times from laps' PitInTime/PitOutTime; `session.weather_data`; `session.race_control_messages`; `session.results`.

## Related Code Files
- Create: `backend/src/f1_strategy/ingestion/{__init__.py, cli.py, pipeline.py}`
- Create: `backend/src/f1_strategy/ingestion/extractors/{laps.py, stints.py, pit_stops.py, weather.py, race_control.py, results.py, session_meta.py}`
- Create: `backend/src/f1_strategy/ingestion/parquet_writer.py`
- Create: `backend/tests/ingestion/test_extractors.py` (fixture: one cached real session)
- Modify: `Makefile` (`ingest-backfill` target)

## Implementation Steps
1. `pipeline.py`: `ingest_session(year, round, session) -> IngestResult`; enumerate via `fastf1.get_event_schedule(year)`; skip testing events; wrap per-session try/except → log + continue.
2. Extractors: pure `extract_X(session) -> pd.DataFrame`; normalize: snake_case cols, timedeltas → int ms, compound upper-case str, add `session_key`.
3. Stints derived from laps groupby (car, stint#): compound, start/end lap, in/out lap flags, avg deg proxy.
4. `parquet_writer.py`: write with pyarrow, hive partitioning `year=/session_key=`; overwrite partition on `--force`.
5. CLI (argparse or typer): year/round/session filters, `--backfill` = 2024→today, reads ingestion_log to resume.
6. Smoke-run: 1 full weekend (e.g. 2024 R1 Bahrain, all 5 sessions); verify row counts sane (R: ~1100 laps).
7. Full backfill run 2024→2026-06 (long; document expected duration + disk in README).

## Success Criteria
- [ ] Single-session ingest produces all entity parquets with documented schemas
- [ ] Backfill resumable: rerun skips completed sessions in <30s
- [ ] Failed session logged, run continues
- [ ] Full 2024→now archive on disk; total size ≤ ~5GB excl. fastf1 telemetry cache
- [ ] Extractor tests pass against cached fixture session

## Risk Assessment
- FastF1 API quirks per-season (schema drift 2024 vs 2026) → normalize defensively, assert required cols, log extras.
- Long backfill interrupted → ingestion_log resume covers it.
- F1 server throttling → rely on FastF1 cache + serial requests; no parallel session downloads.
