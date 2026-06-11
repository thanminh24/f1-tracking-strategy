---
phase: 7
title: "ML/RL Strategy Layer"
status: completed
priority: P1
effort: "10d"
dependencies: [6, 4]
---

# Phase 7: ML/RL Strategy Layer

## Overview
Four models on top of the validated sim + a prediction service streaming results alongside replay ticks: (1) PPO optimal-strategy agent, (2) team behavior model, (3) SC hazard model, (4) Monte Carlo outcome engine + what-if API. All outputs probabilistic.

## Requirements
- Functional: per lap, per car: recommended action + pit-window distribution; team likely-strategy distribution; P(SC next 1/5 laps); P(win/podium/points/positions); what-if forced-action rollouts.
- Non-functional: full-field prediction refresh ≤ 2s per lap on RTX 4060 laptop; models versioned artifacts under `data/models/`; every prediction payload carries confidence/sample-count.

## Architecture
```
strategy/ppo_agent/train.py     → SB3 PPO on sim/gym_env; opponents driven by behavior model
                                   (fallback: heuristic strategies) + domain randomization over params
strategy/ppo_agent/policy.py    → load checkpoint, batch inference (torch, CUDA)
strategy/behavior_model/        → LightGBM: P(pit this lap | features) + compound classifier
                                   features: tire_age vs track-typical stint len, position, gaps,
                                   undercut threat (rival pitted last lap), track_status, team, laps_left
strategy/sc_hazard/             → logistic per-lap hazard: track base rate + lap-1 flag + wetness
                                   + field spread; calibrated probabilities (isotonic check)
strategy/mc_engine/             → from RaceState → SimState (via replay state_at) → N rollouts
                                   (default 1000): strategies sampled from behavior model, SC from hazard,
                                   focal-car action optionally forced (what-if) or PPO-recommended
strategy/prediction_service.py  → orchestrator: on each completed lap, run pipeline, emit PredictionSet
api/routes_whatif.py            → POST /api/whatif {session_key, t, car_id, action} → outcome deltas
api/ws_predictions.py           → predictions multiplexed into replay WS as {"type":"predictions"}
```
`PredictionSet` (per lap): per-car {recommended_action, action_probs, pit_window_dist (per-lap probs), team_strategy_dist, outcome_probs {win, podium, points, position_dist}}, global {sc_prob_1lap, sc_prob_5laps}, meta {n_rollouts, model_versions, compute_ms}.

Training data note: behavior model trains on ~50-60 dry races 2024→now — use feature-based GBM (NOT deep nets), pool across teams with team as feature, report calibration curves. Accept wide distributions; that honesty is a design requirement.

## Related Code Files
- Create: all under `backend/src/f1_strategy/strategy/` per architecture
- Create: `backend/src/f1_strategy/api/{routes_whatif.py, ws_predictions.py}`
- Modify: `backend/src/f1_strategy/api/app.py`, `replay/session_manager.py` (hook prediction_service to lap-completed events)
- Create: `backend/tests/strategy/{test_behavior_model.py, test_sc_hazard_calibration.py, test_mc_engine.py, test_whatif_api.py}`
- Modify: `backend/pyproject.toml` (add torch CUDA, stable-baselines3, gymnasium, lightgbm)

## Implementation Steps
1. SC hazard first (simplest, independent): fit, verify calibration (Brier vs track-base-rate baseline must improve).
2. Behavior model: build per-lap training table from archive (label = pitted this lap; compound label on pit laps); time-based split (train 2024-25, test 2026); report AUC + calibration; ship only if beats naive "pit at modal stint length" baseline.
3. MC engine: RaceState→SimState bridge; vectorized rollouts; outcome aggregation; benchmark to hit ≤2s (tune N vs latency; expose N in config).
4. PPO training: curriculum — v0 opponents = fixed archive strategies, v1 = behavior-model-sampled; domain randomization over calibration uncertainty; train per track-cluster (street/permanent/high-deg) not per-track (data efficiency); eval harness: PPO vs best fixed 1/2-stop in 500 sims/track — require ≥ +1.5s mean gain and ≥55% head-to-head win rate.
5. Recommended-action path: PPO policy on focal car state; pit-window dist from MC over PPO-policy rollouts.
6. `prediction_service` + WS multiplexing + what-if endpoint; integration test on a replayed race: predictions emitted every lap, schema-valid, latency logged.
7. Sanity review pass: replay 2024 Monza; eyeball known strategic moments (does undercut pressure show before actual pits?). Document examples in a report.

## Success Criteria (single-race scope 260611 — items needing backfill marked ⏳)
- [ ] ⏳ SC hazard beats base-rate baseline — UNMEASURABLE on 1 race (0 SC deployments);
      pipeline ships in honest "prior" mode; re-train + Brier check after backfill
- [ ] ⏳ Behavior model beats modal-stint baseline on holdout — UNMEASURABLE (1 race, no
      time split); shipped quality="fallback" → MC samples heuristics per the plan gate;
      re-train after backfill
- [x] PPO beats best fixed strategy: 98.5% head-to-head win rate, +4.19 mean positions
      (100 sims, 400k steps, position-proxy gate; data/models/ppo_2024_Sakhir_eval.json);
      ⏳ time-gain (≥1.5s) 500-sim eval after backfill
- [x] Full PredictionSet, 20-car field: 0.45-0.9 s/lap @ 500 rollouts on CPU (≤2s budget)
- [x] What-if API: 2×~300-rollout MC ≈ 1.2s (<3s budget), paired seeds
- [x] All payloads carry model_versions + n_rollouts + compute_ms

## Implementation Notes (260611)
- Mid-race rollouts via additive RaceSim params (start_lap/init_cum/init_compound/init_age);
  default full-race path unchanged (sim determinism tests green).
- Predictions multiplexed into replay WS as {"type":"predictions"}; lap-gated, one
  in-flight, off-thread, lazy artifact load — replay stream never blocks on strategy layer.
- gymnasium relaxed to >=1.2 (stable-baselines3 <1.3 ceiling).
- CLIs: f1-train-models (SC hazard + behavior), f1-train-ppo (train + eval gate).

## Risk Assessment
- PPO exploits sim quirks (reward hacking) → eval vs held-out param draws; domain randomization; keep fixed-strategy baselines in every eval.
- Behavior model overfits 60 races → GBM + few features + time-split honesty; wide distributions acceptable.
- Latency blowout → N adaptive (fewer rollouts under SC chaos), numpy vectorization, profile before optimizing.
- 2026 regs shift behavior (energy management) → 2026-only fine-tune flag for behavior model when sample grows.
