# RSRL Challenger Cook Report

Date: 2026-06-13

## Summary

Implemented the RSRL challenger infrastructure beside the existing PPO/MC system.
This does not prove RSRL beats PPO yet; it creates the env, training scaffold,
tournament harness, shadow live serving path, and first explainability tool needed
to run that comparison.

## Implemented

- Baseline inventory/report layer:
  - `backend/src/f1_strategy/strategy/evaluation/baseline.py`
  - `backend/scripts/model_baseline_report.py`
  - `f1-model-baseline-report`
- RSRL recurrent env:
  - `backend/src/f1_strategy/sim/recurrent_gym_env.py`
  - `backend/src/f1_strategy/sim/observation_features.py`
- DRQN challenger:
  - `backend/src/f1_strategy/strategy/rsrl_agent/model.py`
  - `backend/src/f1_strategy/strategy/rsrl_agent/replay_buffer.py`
  - `backend/src/f1_strategy/strategy/rsrl_agent/train.py`
  - `backend/src/f1_strategy/strategy/rsrl_agent/policy.py`
  - `f1-train-rsrl`
- Evaluation tournament:
  - `backend/src/f1_strategy/strategy/evaluation/agents.py`
  - `backend/src/f1_strategy/strategy/evaluation/tournament.py`
  - `backend/scripts/run_model_tournament.py`
  - `f1-model-tournament`
- Shadow serving:
  - optional `F1_RSRL_SHADOW=1`
  - optional `model_recommendations["rsrl"]` in predictions
  - frontend model summary display for RSRL shadow action/latency
- Explainability:
  - `backend/src/f1_strategy/strategy/rsrl_agent/explain.py`
  - `backend/scripts/explain_rsrl_policy.py`
  - `f1-explain-rsrl`
- Tests:
  - baseline inventory
  - recurrent env
  - RSRL model/replay/train/policy smoke tests
  - tournament smoke tests
  - perturbation explanation test

## Verification

- `cd backend && uv run ruff check .` passed.
- `cd backend && uv run pytest -q` passed: 81 tests.
- `cd frontend && npm run lint` passed with 9 warnings.
- `cd frontend && npm run build` passed.
- Baseline inventory command ran against local data and found 54 races, 49 calibrations, 21 PPO checkpoints.

## Remaining

- Run real long-budget RSRL training.
- Run full tournament against PPO/MC/fixed/heuristic agents.
- Add replay-state mid-race tournament starts.
- Add surrogate tree and counterfactual explainability.
- Write promotion report only after real tournament data exists.

Unresolved questions:

- Which circuits should be train/test holdout for the first expensive run?
- What local wall-clock/GPU budget should be used for the first full RSRL training job?
