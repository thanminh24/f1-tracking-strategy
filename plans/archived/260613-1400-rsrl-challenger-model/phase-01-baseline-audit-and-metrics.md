# Phase 01: Baseline Audit And Metrics

## Context Links

- Parent plan: [plan.md](plan.md)
- Research: [paper alignment](research/researcher-01-rsrl-paper-alignment-report.md), [current baseline](research/researcher-02-current-system-baseline-report.md)
- Current code: `backend/src/f1_strategy/strategy/ppo_agent/train.py`, `backend/src/f1_strategy/strategy/prediction_service.py`, `backend/src/f1_strategy/strategy/mc_engine.py`

## Overview

Date: 2026-06-13  
Priority: P1  
Implementation status: inventory complete, evaluation pending  
Review status: verified by lint/tests

Create a reproducible baseline. Before training RSRL, lock what "beat current model" means and capture current PPO/MC performance.

## Key Insights

- Current PPO eval is too narrow for promotion.
- MC outputs already include outcome distributions and pit windows; use those as shared evaluation data.
- Evaluation must include unseen circuits, not only same-track smoke tests.

## Requirements

- Inventory local archive sessions by season/circuit/session type.
- Identify calibrated circuits with `SimParams`.
- Identify existing PPO checkpoints and eval JSON files.
- Create common metrics schema for PPO, RSRL, MC action baseline, fixed strategies, behavior heuristic.
- No model changes in this phase.

## Architecture

Add an evaluation reporting layer around existing simulator and prediction services:

`archive sessions + SimParams + checkpoints -> tournament runner -> metrics JSON/CSV -> stats report`

## Related Code Files

- Read: `backend/src/f1_strategy/archive/queries.py`
- Read: `backend/src/f1_strategy/sim/params.py`
- Read: `backend/src/f1_strategy/strategy/ppo_agent/train.py`
- Modify: `backend/src/f1_strategy/strategy/evaluation/` if missing, create focused evaluation module.
- Create: `backend/scripts/model_baseline_report.py`

## Implementation Steps

1. Add data inventory script:
   - list race sessions
   - list circuits with calibration JSON
   - list PPO checkpoints
   - list behavior/SC model metadata
2. Add metric schema:
   - `mean_finish_position`
   - `expected_points`
   - `head_to_head_win_rate`
   - `invalid_action_rate`
   - `mean_pit_count`
   - `strategy_reasonableness_rate`
   - `p50/p95_inference_ms`
3. Run current PPO evaluation per available circuit.
4. Run fixed baselines:
   - one-stop
   - two-stop
   - F1-guide-like compound schedule if available
5. Run MC best-action baseline:
   - for each decision lap, evaluate `STAY`, `PIT_SOFT`, `PIT_MEDIUM`, `PIT_HARD` by short MC budget
   - choose lowest expected position / highest expected points
6. Save baseline report in `data/model_reports/`.

## Todo List

- [x] Add baseline inventory script.
- [x] Add metric schema.
- [ ] Run PPO baseline across all target circuits.
- [ ] Run fixed strategy baselines across all target circuits.
- [ ] Run MC best-action baseline across all target circuits.
- [x] Produce baseline report command.

## Success Criteria

- One command creates complete current-model baseline.
- Baseline report includes all available circuits.
- Metrics are deterministic by seed.
- Current PPO result is reproducible within tolerance.

## Risk Assessment

- Archive may not contain enough races for holdout. Mitigation: use simulator seed holdout and leave-circuit-out where possible.
- MC best-action can be slow. Mitigation: use small budget for comparison, full budget only on finalists.

## Security Considerations

- Do not write archive data or model artifacts to git.
- Reports must avoid secrets/env dumps.

## Next Steps

- Use baseline metrics to configure Phase 04 gates.

Unresolved questions:
- Full baseline comparison output still requires running the expensive PPO/fixed/MC evaluation suite.
