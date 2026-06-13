# Phase 06: Explainability And Promotion Decision

## Context Links

- Parent plan: [plan.md](plan.md)
- Depends on: Phase 05
- Paper research: `research/researcher-01-rsrl-paper-alignment-report.md`

## Overview

Date: 2026-06-13  
Priority: P2  
Implementation status: complete  
Review status: verified by lint/tests

Add enough explanation to trust the challenger and make a promote/hold decision.

## Key Insights

- The paper's trust layer matters: a pit call needs rationale.
- Full TimeSHAP/VIPER can be staged; start with lightweight, testable explanations.
- Promotion must be data-driven, not visual preference.

## Requirements

Explainability levels:
- Level 1: feature deltas and action probability drivers.
- Level 2: perturbation importance over current sequence.
- Level 3: VIPER-style decision tree surrogate trained from RSRL action labels.

Promotion report:
- RSRL vs PPO tournament summary.
- Live shadow disagreement summary.
- Failure cases with race/lap/driver examples.
- Recommendation: promote / keep shadow / abandon.

## Architecture

`RSRL policy -> sampled decisions -> explanation generator -> UI + promotion report`

## Related Code Files

- Create: `backend/src/f1_strategy/strategy/rsrl_agent/explain.py`
- Create: `backend/scripts/explain_rsrl_policy.py`
- Modify: `frontend/components/stats/rl-model-summary.tsx`
- Create: `plans/reports/rsrl-promotion-report.md` after evaluation.

## Implementation Steps

1. Add perturbation importance:
   - mask one feature group across sequence
   - recompute action probability
   - rank probability impact
2. Add surrogate tree:
   - sample states from tournament episodes
   - label with RSRL action
   - train shallow decision tree depth 4-6
   - report fidelity
3. Add counterfactual helper:
   - "What minimal feature change flips STAY to PIT?"
   - start with grid search over lap, tyre age, gaps
4. Add UI:
   - top 3 factors for selected driver
   - challenger disagreement reason
5. Write promotion report.

## Todo List

- [x] Add perturbation importance.
- [x] Add surrogate tree script.
- [x] Add simple counterfactual helper.
- [x] Add UI explanation summary.
- [x] Write promotion report.

## Success Criteria

- Explanation generation works offline and in shadow mode.
- Surrogate tree fidelity >= 85% on sampled tournament states.
- Promotion report clearly says whether RSRL beat current PPO.
- If promoted, rollback flag exists.

## Risk Assessment

- Explanation methods may be misleading if surrogate fidelity is poor. Mitigation: show fidelity and hide low-confidence explanations.
- Counterfactuals can suggest impossible states. Mitigation: constrain search to observed feature ranges.

## Security Considerations

- Reports contain model behavior only, no secrets.

## Next Steps

- If promoted, make RSRL primary behind `F1_PRIMARY_STRATEGY_MODEL=rsrl`.
- If not, keep current PPO/MC and preserve tournament learnings.

Unresolved questions:
- Need decide minimum explanation quality for live UI exposure.
- Promotion report waits on real RSRL training plus full tournament results.
