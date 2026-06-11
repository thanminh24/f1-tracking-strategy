# Phases 6-8 Completion Report — Single-Race Scope (Bahrain 2024)

**Date:** 2026-06-11 | **Scope:** user-directed: one race only, full implementation
through phase 8 (phase 9 retrieve-only tier completed earlier same day).

## Verification Status

| Check | Result |
|---|---|
| Backend tests | 62 passed (incl. 16 new strategy tests) |
| Ruff | clean |
| Frontend `npm run build` + TS | clean |
| UI copy audit (deterministic claims) | 0 hits |
| Code review (subagent) | DONE_WITH_CONCERNS → 2 High + 3 Medium + 4 quick Lows fixed same session |

## Phase 6 — Race Sim + Calibration: COMPLETED

- Bahrain 2024 ingested to archive (1129 laps); Sakhir calibrated (confidence=fitted).
- Validation gate PASSED (n=1): race-time err 12.55s (≤15), clean-lap RMSE 0.452s (≤0.8),
  Spearman 0.891 (≥0.85). Gate runner fixed to match its own spec (clean-lap RMSE,
  NaN-fair totals) — see `sim-validation-gate-260611-0754-single-race-bahrain-2024-report.md`.

## Phase 7 — ML/RL Strategy Layer: COMPLETED (single-race caveats)

New `strategy/` package: prediction_schema, sc_hazard (logistic/prior), behavior_model
(LightGBM pit+compound, quality gate vs modal-stint baseline), strategy_sampler,
mc_engine (mid-race batched rollouts), ppo_agent (SB3 train/eval CLI + inference),
prediction_service (lazy, degraded-safe orchestrator), train_models_cli.
API: POST /api/whatif; predictions multiplexed into replay WS ({"type":"predictions"}).
RaceSim extended with additive mid-race-start params (default path unchanged, verified).

Artifacts (data/models/): sc_hazard_2024.json (prior mode — 0 SC in archive),
behavior_{pit,compound}.txt + meta (quality=fallback → MC uses heuristics, honest gate),
ppo_2024_Sakhir.zip (400k steps).

Measured: PPO eval 98.5% head-to-head vs best fixed, +4.19 mean positions (100 sims);
PredictionSet 0.45-0.9 s/lap @ 500 rollouts, 20 cars, CPU (≤2s budget); what-if ≈1.2s (<3s).

## Phase 8 — Strategy UI + What-If: COMPLETED

strategy-overlay/ (panel, SC gauge+sparkline, sortable outcome table, driver cards,
undercut toasts w/ cooldown), what-if-panel (abortable, pinnable compare), pit-window
probability bands in gap-chart, prediction-store (zustand, stale flag seek-safe),
ws-replay-client routes predictions. Degraded mode: banner; F1_PREDICTIONS=0 kill switch.

## Review Fixes Applied (post-review, same session)

- H1: /api/whatif 409 (not 500) for retired/finished car; engine test added.
- H2: torch import gated behind checkpoint-exists; PredictionService artifact load
  now lazy on first predict() (worker thread) — WS connect never blocks the loop.
- M1: all-or-nothing artifact init (no half-available service).
- M2: PPO serving obs position feature aligned to training (0-based rank of running cars).
- M3: pit-window probs now marginal per draw (UI thresholds depend on it); test pins it.
- L1 stay_laps bounds; L4 stale flag |Δlap|; L6 whatif 502 mapping; L7 lru_cache comment.

## Deferred (require full backfill — see plan.md Current Todo)

Phase 6 gate on held-out set; SC hazard fitted mode + Brier; behavior model holdout
gate; PPO 500-sim time-gain eval + track-cluster training; browser demo/60fps pass.
Reviewer Lows L2/L3/L5 accepted as-is (shortened-race horizon, orphan pred task waste,
bimodal window phrasing).

## Unresolved Questions

- position_dist renumbers among active cars only (retirees excluded) — confirm UI
  expectation before the demo pass.
- Should seek clear last_prediction snapshot? Current: kept until next lap-gated update.
