# RSRL Challenger: Promotion Decision Report

**Date:** 2026-06-13  
**Status:** PENDING — infrastructure ready, real training run required  
**Decision:** KEEP SHADOW until gates below are met

---

## Promotion Gates

| Gate | Threshold | Current | Status |
|------|-----------|---------|--------|
| Head-to-head win rate vs fixed | ≥ 55% | 0% (pos 19.05 vs 9.0) | ❌ |
| Mean position improvement | ≥ 0.25 places | −10.05 places (worse) | ❌ |
| Expected points improvement | ≥ 3% | −100% (zero points) | ❌ |
| Invalid strategy rate | = 0 | 0.0% | ✅ |
| P95 inference latency (full field) | ≤ 50ms | 0.30ms per car | ✅ |
| Surrogate fidelity | ≥ 85% | not measured (needs trained model) | ⏳ |

Training budget needed: 500K–2M timesteps (ran only 50K).

---

## Infrastructure Summary

| Component | Status | File |
|-----------|--------|------|
| RSRL observation env | ✅ complete | `sim/observation_features.py` |
| DRQN model + replay buffer | ✅ complete | `rsrl_agent/model.py`, `replay_buffer.py` |
| Train/eval CLI | ✅ complete | `rsrl_agent/train.py` |
| Tournament runner | ✅ complete | `scripts/run_model_tournament.py` |
| Shadow live inference | ✅ feature-flagged | `strategy/prediction_service.py` |
| Perturbation importance | ✅ complete | `rsrl_agent/explain.py` |
| Surrogate tree | ✅ complete | `rsrl_agent/explain.py::fit_surrogate_tree` |
| Counterfactual helper | ✅ complete | `rsrl_agent/explain.py::counterfactual_flip` |
| UI explanation summary | ✅ complete | `components/stats/rl-model-summary.tsx` |

---

## How to Run the Full Evaluation

```bash
# Step 1: Train RSRL on available circuits
cd backend
uv run f1-train-rsrl --season 2025 --circuit Sakhir
uv run f1-train-rsrl --season 2025 --circuit Melbourne
# ... additional circuits

# Step 2: Run tournament (PPO vs RSRL vs MC vs Fixed)
uv run python scripts/run_model_tournament.py --season 2025

# Step 3: Baseline audit report
uv run python scripts/model_baseline_report.py

# Step 4: Explanation audit
uv run python scripts/explain_rsrl_policy.py data/models/rsrl_2025_Sakhir.pt --mode surrogate
uv run python scripts/explain_rsrl_policy.py data/models/rsrl_2025_Sakhir.pt --mode perturbation
```

---

## RSRL vs PPO Tournament Summary

**Run date:** 2026-06-13 · Circuit: Barcelona · Season: 2025 · N=20 sims

| Agent | Mean Pos | Exp Pts | Invalid Rate | P95 Latency |
|-------|----------|---------|--------------|-------------|
| fixed_one_stop (baseline) | 9.40 | 3.75 | 0.0% | <0.01ms |
| fixed_two_stop (baseline) | 9.00 | 4.50 | 0.8% | <0.01ms |
| **rsrl_2025_Barcelona** | **19.05** | **0.00** | **0.0%** | **0.30ms** |

**Result: RSRL FAILS all gates.** Trained on 50K timesteps — vastly insufficient for convergence. Model consistently finishes last (P19), zero expected points. Needs 500K–2M timesteps to be competitive.

---

## Live Shadow Disagreement Summary

*(Populate from shadow mode logs — `F1_RSRL_SHADOW=1`)*

- Sessions monitored: —  
- Total decisions: —  
- RSRL ≠ PPO (disagreements): —  
- RSRL recommended pit when PPO said stay: —  
- RSRL recommended stay when PPO said pit: —  

---

## Known Failure Cases

*(Populate from tournament analysis)*

| Race | Lap | Driver | PPO action | RSRL action | Outcome | Notes |
|------|-----|--------|------------|-------------|---------|-------|

---

## Explanation Quality

*(Populate from `explain_rsrl_policy.py --mode surrogate` after training)*

- Surrogate tree fidelity: —  
- Top feature groups driving pit calls: —  
- Counterfactual flip threshold (tyre age): —  

---

## Recommendation

**Current recommendation: KEEP SHADOW**

Reasons:
1. No trained checkpoint yet — all gate values are unknown.
2. Infrastructure is complete and verified; training is the only remaining step.
3. Promote to `F1_PRIMARY_STRATEGY_MODEL=rsrl` once all 6 gates are green.

Rollback mechanism: set `F1_PRIMARY_STRATEGY_MODEL=ppo` (or unset) to revert without code changes.

---

## Unresolved Questions

- Which circuits have sufficient archive coverage for a statistically significant tournament?
- What GPU/CPU budget is available for the training run?
- Minimum acceptable surrogate fidelity for live UI exposure of explanations?
