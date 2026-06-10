# Journal — 2026-06-10 — Implementation Plan Created (F1 Viewer + RL Strategy)

## What happened

- Answered follow-up Qs: SignalR = F1's public live-timing push feed; transport easy (FastF1/f1-dash reference impls), real work = merging JSON patches + deflate-compressed topics; mitigated weekend-only access by record-stream-then-develop-offline. WEC/Le Mans assessed: architecture transfers, data (Al Kamel, redistribution-prohibited, no public telemetry) + simulator (refueling, driver stints, multi-class, FCY/slow zones) do not → v3 at best. Both findings appended to brainstorm report.
- Created 8-phase implementation plan via `ck plan create`, set as active plan:
  `plans/260610-2226-f1-viewer-rl-strategy-system/`
  1. Scaffold (uv backend + Next.js + series-agnostic RaceState models)
  2. Ingestion (FastF1→Parquet, 2024→now backfill, resumable)
  3. Archive (DuckDB views, analytics for calibration, on-demand telemetry)
  4. Replay engine + API (LiveSource interface, WS tick protocol)
  5. Viewer frontend (track map, timing tower, gap chart, telemetry compare)
  6. Simulator + calibration — **hard validation gate** (median race-time error ≤15s, stint RMSE ≤0.8s/lap, Spearman ≥0.85) before phase 7
  7. ML/RL (SB3 PPO vs fixed-strategy baselines, behavior GBM with time-split eval, SC hazard w/ calibration check, MC engine ≤2s/lap)
  8. Strategy UI + what-if (probabilistic copy rules enforced, degraded mode)

## Key decisions

- Series-agnostic core schema locked as invariant (variable car count, optional class/fuel fields) — keeps WEC a module, not a rewrite.
- Heavy ML deps (torch/sb3/lightgbm) deferred to phases 6-7 install.
- Live SignalR adapter + WEC explicitly out of plan scope (v2/v3).
- Task hydration skipped (Task tools unavailable in VSCode ext); plan files = source of truth.

## Next step

User reviewing plan. Resume with `/ck:plan validate`, `/ck:plan red-team`, or `/ck:cook plans/260610-2226-f1-viewer-rl-strategy-system/plan.md`.
