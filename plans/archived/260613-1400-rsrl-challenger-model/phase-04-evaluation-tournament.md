# Phase 04: Evaluation Tournament

## Context Links

- Parent plan: [plan.md](plan.md)
- Depends on: Phase 01, Phase 03
- Current MC baseline: `backend/src/f1_strategy/strategy/mc_engine.py`

## Overview

Date: 2026-06-13  
Priority: P1  
Implementation status: scaffold complete  
Review status: verified by lint/tests

Run a fair tournament to determine if RSRL beats the current model.

## Key Insights

- Same seeds and simulator conditions are mandatory.
- Need compare on unseen races/circuits, not only training circuits.
- Promotion gate must include latency and invalid strategy rate.

## Requirements

Compare agents:
- `ppo_current`
- `rsrl_single_track`
- `rsrl_multi_track`
- `mc_best_action`
- `behavior_heuristic`
- `fixed_one_stop`
- `fixed_two_stop`

Splits:
- Same-circuit validation.
- Leave-one-circuit-out.
- Chronological holdout: train earlier sessions, test later sessions.
- Live-style mid-race starts from archived replay states.

Metrics:
- mean finish position
- expected points
- head-to-head win rate vs PPO
- strategy reasonableness rate
- invalid action rate
- pit window calibration error
- p50/p95 inference latency
- crash/degrade rate

## Architecture

`tournament config -> common simulator seeds -> agent adapters -> result aggregator -> promotion report`

## Related Code Files

- Create: `backend/src/f1_strategy/strategy/evaluation/tournament.py`
- Create: `backend/src/f1_strategy/strategy/evaluation/agents.py`
- Create: `backend/scripts/run_model_tournament.py`
- Create: `backend/tests/strategy/test_model_tournament_smoke.py`

## Implementation Steps

1. Add agent adapter interface:
   - `recommend(state, params) -> action_probs/recommended_action`
2. Wrap PPO current as adapter.
3. Wrap RSRL as adapter.
4. Wrap fixed and heuristic baselines.
5. Add MC best-action adapter with configurable MC budget.
6. Evaluate from:
   - race start
   - lap 10
   - lap 25
   - post-SC restart states where available
7. Save tournament results:
   - JSON metrics
   - CSV per episode
   - markdown summary
8. Enforce promotion gates.

## Todo List

- [x] Add agent adapter contract.
- [x] Add tournament runner.
- [ ] Add replay-state mid-race starts.
- [x] Add promotion gate function.
- [x] Run smoke tournament.
- [ ] Run full tournament.

## Success Criteria

- Full report answers: "Does RSRL beat PPO?"
- RSRL not promoted unless all gates pass.
- Evaluation can be re-run from one command.

## Risk Assessment

- Simulator may favor one reward design unrealistically. Mitigation: evaluate on archived mid-race states and compare strategy reasonableness.
- MC best-action may dominate but be too slow. Keep it as reference, not default production target.

## Security Considerations

- Evaluation outputs must stay in `data/model_reports` or plan reports, not include raw proprietary credentials.

## Next Steps

- If RSRL passes, integrate shadow inference in Phase 05.

Unresolved questions:
- Need choose exact holdout circuits after archive inventory and real RSRL training.
