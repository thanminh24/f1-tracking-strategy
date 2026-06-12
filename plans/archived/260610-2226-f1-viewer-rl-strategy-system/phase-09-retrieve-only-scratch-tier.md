# Phase 9: Retrieve-Only Mode (Scratch Tier)

## Context Links

- Plan: [plan.md](./plan.md)
- Current data path: `backend/src/f1_strategy/archive/queries.py` (`ensure_session`),
  `backend/src/f1_strategy/ingestion/pipeline.py` (`ingest_session`)

## Overview

- **Priority:** P2 | **Status:** Completed (260611; code-reviewed, 32 tests pass)
- Viewer auto-loads currently run the full archival pipeline — every casually opened
  race permanently grows `data/parquet/`. Add a retrieve-only default: viewer fetches
  on demand into a purgeable scratch tier; the archive grows only via explicit CLI.

## Key Insights (verified)

- `POST /sessions/{key}/ensure` + WS replay both call `queries.ensure_session` →
  `ingest_session` → permanent Parquet partitions + `.ingest_log` marker.
- DuckDB views (`archive/db.py`) glob a single root; views are per-thread and only
  refreshed on the calling thread → cross-thread staleness already latent.
- FastF1 always caches raw HTTP under `data/fastf1_cache/` — retrieve-only avoids
  growing the *processed* archive, not the raw cache (needed for rate limits).

## Decisions (user-approved 260611)

1. **Retrieve-only is the default for the viewer**: `ensure_session` never writes the
   archive. Archive grows only via `make ingest` / `f1-ingest` / backfill.
2. **Scratch parquet tier** `data/scratch_parquet/`, same partition layout; DuckDB
   views union archive + scratch; purgeable via `make clean-scratch`.
3. Archived session + `force=True` on ensure → archive still wins (repairs go through
   CLI `--force`); force only re-fetches the scratch copy.
4. Successful **archive** ingest evicts that session's scratch partitions (no
   duplicate rows in unioned views).
5. Calibration/sim (phase 6) reads only archive-tier data — scratch is view-only.
   (Analytics views union both; calibration runs against a deliberately built archive,
   so keep scratch purged before calibration runs — documented in README.)

## Related Code Files

- Modify: `backend/src/f1_strategy/config.py` — `scratch_parquet_dir`
- Modify: `backend/src/f1_strategy/ingestion/parquet_writer.py` — `root` param
- Create: `backend/src/f1_strategy/ingestion/scratch_tier.py` — purge helpers
- Modify: `backend/src/f1_strategy/ingestion/pipeline.py` — `dest="archive"|"scratch"`,
  scratch eviction after archive ingest, markers archive-only
- Modify: `backend/src/f1_strategy/archive/db.py` — union views, views-version counter
- Modify: `backend/src/f1_strategy/archive/queries.py` — tier-aware `ensure_session`
- Modify: `backend/src/f1_strategy/ingestion/cli.py` — `--purge-scratch`
- Modify: `Makefile` (`clean-scratch`), `frontend/components/load-race-form.tsx`
  (caption), `README.md`
- Tests: update `backend/tests/archive/test_on_demand_session_loading.py`;
  create `backend/tests/archive/test_scratch_tier_retrieve_only.py`

## Implementation Steps

1. Config: add `scratch_parquet_dir` property + `ensure_dirs` entry.
2. Writer: `partition_dir`/`write_entity` accept optional `root` (default archive).
3. `scratch_tier.py`: `session_in_scratch`, `purge_scratch_session`, `purge_scratch`.
4. Pipeline: `ingest_session(..., dest)` — scratch dest writes under scratch root,
   skips marker writes; archive dest unchanged + evicts scratch copy on success.
5. db: `_register_views` builds per-entity pattern list from roots that contain
   parquet files; global views-version so stale thread conns re-register lazily.
6. Queries: `ensure_session` order = archive → scratch → fetch-to-scratch;
   `session_has_laps` = either tier (used by WS replay guard).
7. CLI flag + make target; frontend caption; README note.
8. Tests; `make test` + `make lint` green.

## Success Criteria

- Opening a non-archived race via UI/API serves data with zero writes under
  `data/parquet/` (all processed output under `data/scratch_parquet/`).
- Archived races serve from archive; scratch copy evicted after CLI ingest.
- `f1-ingest --purge-scratch` / `make clean-scratch` empties scratch tier.
- All backend tests pass; no public API contract change (`/ensure` response gains
  `source: "scratch"` value only).

## Review Outcome (260611)

Code-reviewer: DONE_WITH_CONCERNS → all concerns addressed same session:
- Stale-glob 500s after external scratch purge → `query_df` re-registers + retries once.
- Views-version TOCTOU + non-atomic bump → version snapshot at registration entry + lock.
- Duplicate-row window on partial archive ingest → scratch evicted BEFORE archive writes.
- Calibration scratch leak → `f1-calibrate` warns loudly when scratch tier non-empty
  (kept warning, not refusal — purge-before-calibration stays the documented contract).

## Risk Assessment

- Duplicate rows across tiers → mitigated by eviction (step 4) + archive-first order.
- Empty-glob DuckDB errors → pattern list only includes roots with files; falls back
  to archive pattern (same error surface as today).
- Calibration accidentally training on scratch data → documented; purge before
  calibration runs. Follow-up if needed: tier column filter (YAGNI for now).
