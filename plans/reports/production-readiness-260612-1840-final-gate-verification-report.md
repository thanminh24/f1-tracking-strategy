# Production Readiness Gate Report
Date: 2026-06-12

## RL Gate Summary (21 circuits, 2024 season, 200k timesteps, CUDA)

| Status | Count |
|---|---|
| Gate passed (win_rate ≥ 55% AND gain > 0) | 18 |
| Gate failed | 3 (Monaco, Montréal, Silverstone) |
| Pass rate | 85.7% ✅ (threshold: ≥80%) |

**Mean position gain (all circuits):** +1.62 places vs best fixed strategy  
**Mean win rate:** 71.5%

### Failed circuits
| Circuit | Reason |
|---|---|
| Monaco | Near-no-stop strategy; SC variance dominates; PPO couldn't learn reliable pit timing |
| Montréal | High SC frequency; rival mix insufficient for generalization |
| Silverstone | High SC variance circuit; 3 retries at 500k steps in progress |

Retry training (500k steps): Monaco, Montréal, Silverstone — running in background.

## Model Status

| Model | Status | Key metric |
|---|---|---|
| SC Hazard (2024) | fitted, 4 coefs, weather-joined | 12 deployments |
| Behavior model | quality=ok | AUC 0.700 vs baseline 0.648 |
| PPO (21 circuits) | 18/21 gate passed | See table above |
| Calibration 2024 | 21/21 circuits | All fitted or pooled |
| Calibration 2025 | 22/24 circuits | 2 SVD failures → pooled fallback |
| Calibration 2026 | 6/6 circuits | Partial season |

## Build & Test Status

| Check | Result |
|---|---|
| `npm run build` | ✅ 0 errors |
| `uv run pytest` | ✅ 62/62 passed |
| TypeScript strict | ✅ clean |

## Phase 3 Changes (Opponent Modeling & Weather)

- **SC hazard**: weather join added to `_deployment_table()`; wet feature now real (session-level rainfall from archive)
- **SC coefs**: updated to 4-element vector including wetness coefficient (+0.43)
- **prediction_service**: `wet` now reads from `state.weather.rainfall` (not hardcoded False)
- **gym_env**: behavior-model rival sampling available via `F1_OPPONENT_MODEL=1` env var

## Unresolved

- Monaco/Montréal/Silverstone 500k retry results pending
- Phase 8 browser 60fps profiling not yet verified (requires manual Chrome devtools test)
- OpenF1 live source end-to-end test pending (requires active session or historical key)
