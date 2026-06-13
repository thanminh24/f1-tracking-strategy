# Backend Replay Nullable Results Bugfix

## Summary

Fixed backend WebSocket feeder crashes for practice sessions with nullable archive metadata/results.

## Evidence

- Log symptom: `/ws/feed/2026_2_FP1` and `/ws/feed/2026_5_FP1` closed with `TypeError: boolean value of NA is ambiguous`.
- Root cause: `build_timeline()` used `r["position"] == r["position"]` as a NaN guard. With pandas nullable `Int64`, `pd.NA == pd.NA` returns `pd.NA`, which cannot be evaluated as boolean.
- Adjacent failure: practice sessions also store `sessions.total_laps` as `pd.NA`; existing in-worktree code already guarded this field with `pd.notna`.

## Fix

- Use `pd.notna(r["position"])` before converting result positions to `int`.
- Keep practice-session `total_laps` as `None`.
- Added regression test for nullable result positions and nullable total laps.

## Adversarial Review

- Symptom patch risk: low. Fix is at archive-to-timeline conversion boundary, not WebSocket exception handling.
- Race regression risk: low. Valid race result positions still pass `pd.notna` and are converted unchanged.
- Practice-session behavior: correct. No official finish positions means `finish_positions` stays empty and replay ordering remains timeline-progress based.
- API contract impact: none. No response shape or route changed.

## Verification

- `build_timeline("2026_2_FP1")`, `build_timeline("2026_5_FP1")`, and `build_timeline("2026_6_FP1")` all build successfully.
- `uv run pytest -q`: 63 passed.
- Targeted ruff on changed replay files: passed.
- `uv run python -m compileall -q src tests`: passed.
- `/api/live/current-session` and `/api/live/schedule`: both returned 200.

## Unresolved Questions

- Full backend ruff still fails on unrelated existing lint in other modified files.
