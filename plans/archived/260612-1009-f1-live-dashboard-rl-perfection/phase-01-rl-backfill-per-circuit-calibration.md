---
phase: 1
title: "RL Backfill & Per-Circuit Calibration"
status: pending
priority: P1
effort: "2-4h code + backfill runtime ~4-10h"
dependencies: []
---

# Phase 1: RL Backfill & Per-Circuit Calibration

## Overview

Run the full 2024-25 archive backfill then batch-fit `SimParams` calibration artifacts for
every circuit. This is the data foundation for all RL training (phases 2-3), the SC hazard
fitted mode, and the behavior model quality gate.

## Requirements

**Functional:**
- All 2024 + available 2025 race sessions in `data/parquet/` and `archive.duckdb`
- Per-circuit `data/calibration/{season}/{circuit}.json` for every circuit with ≥1 archived race
- Pooled fallback for circuits with <15 lap rows (track-type grouping: street / power / high-df / mixed)
- Batch calibration CLI: `f1-batch-calibrate --season 2024 [--season 2025]`
- Validation report: per-circuit sim vs real MAE; ≥80% of circuits within 1.5s MAE

**Non-functional:**
- Backfill resumable (existing `--resume` already works)
- Calibration idempotent: re-running overwrites artifacts but doesn't crash on existing files
- 2025 and 2026 reg-era data fitted separately (regulation change boundary)

## Architecture

```
make ingest-backfill           # existing; runs overnight
  ingestion/cli.py             # all 2024+2025 rounds

f1-batch-calibrate (NEW)
  reads archive.duckdb:
    SELECT DISTINCT circuit, year FROM sessions WHERE session_type='R'
  for each (season, circuit):
    fit_lap_time_model.fit_circuit(season, circuit)
      if n_laps >= 15 → fitted
      else            → pooled (same track-type group)
  writes data/calibration/{season}/{circuit}.json
  prints: circuit | n_races | confidence | base_lap_ms | mae_ms
```

**Track-type groups for pooled fallback:**
- `street`: Monaco, Baku, Singapore, Jeddah, Las Vegas, Miami
- `power`: Monza, Spa, Silverstone, Interlagos, Austin (long straights)
- `high_df`: Hungary, Zandvoort, Barcelona (twisty, high-downforce)
- `mixed`: everything else (Bahrain, Melbourne, Suzuka, Shanghai, etc.)

## Related Code Files

- Modify: `backend/src/f1_strategy/sim/calibration/cli.py` — add `batch-calibrate` subcommand
- Modify: `backend/src/f1_strategy/sim/calibration/fit_lap_time_model.py` — pooled fallback logic
- Modify: `backend/pyproject.toml` — register `f1-batch-calibrate` console script entry point
- Modify: `Makefile` — add `calibrate-all` target
- Read: `backend/src/f1_strategy/archive/db.py` — query_df helper
- Read: `backend/src/f1_strategy/sim/validation/replay_real_races.py` — validation gate

## Implementation Steps

1. **Run backfill** — `make ingest-backfill`; monitor `data/parquet/` size; expected ~3-6 GB
2. **Add `batch-calibrate` subcommand** to `calibration/cli.py`:
   ```python
   # argparse subcommand: batch-calibrate
   # --season INT (repeatable), --dry-run
   # queries sessions table for distinct (year, circuit) where session_type='R'
   # calls fit_circuit(season, circuit) for each, catches exceptions per-circuit
   # accumulates results, prints markdown table + exits 1 if any circuit fails
   ```
3. **Add pooled fallback** to `fit_lap_time_model.py`:
   ```python
   TRACK_TYPES = {
       "street": ["Monaco", "Baku", "Singapore", "Jeddah", "LasVegas", "Miami"],
       "power":  ["Monza", "Spa", "Silverstone", "Interlagos", "Austin"],
       "high_df":["Hungaroring", "Zandvoort", "Catalunya"],
   }
   # if n_laps < 15: query all circuits of same track type, fit pooled
   # set confidence="pooled" in artifact
   ```
4. **Register CLI entry point** in `pyproject.toml`:
   ```toml
   [project.scripts]
   f1-batch-calibrate = "f1_strategy.sim.calibration.cli:batch_main"
   ```
5. **Add `calibrate-all` Makefile target**:
   ```makefile
   calibrate-all:
       uv run f1-batch-calibrate --season 2024 --season 2025
   ```
6. **Run validation gate** — `uv run python -m f1_strategy.sim.validation.replay_real_races`
   on held-out last race per circuit; log MAE table to report
7. **Write calibration report** — `plans/reports/calibration-260612-1009-per-circuit-results-report.md`

## Success Criteria

- [ ] `archive.duckdb` sessions table has ≥20 distinct race sessions
- [ ] `data/calibration/2024/` contains ≥18 circuit JSON files
- [ ] All artifacts have `confidence` field set (fitted / pooled / prior)
- [ ] Sim vs real lap-time MAE ≤ 1.5s for ≥80% of fitted circuits
- [ ] `make calibrate-all` runs end-to-end without Python exceptions
- [ ] Pooled fallback fires for circuits with <15 laps and sets `confidence="pooled"`

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| FastF1 rate limits during backfill | Existing sleep wrapper; run overnight |
| 2025 data includes 2026 reg cars (new car regs) | Fit seasons separately; never pool across boundary |
| Some circuits zero data (DNS/postponed) | Pooled fallback handles; prior as last resort |
| fit_lap_time_model raises on edge-case data | Per-circuit try/except in batch CLI; continue to next |
