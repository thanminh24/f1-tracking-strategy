---
phase: 6
title: Race Simulator + Calibration
status: in-progress
priority: P1
effort: 7d
dependencies:
  - 3
---

# Phase 6: Race Simulator + Calibration

## Overview
Lap-level race simulator (Gymnasium-compatible) + calibration pipeline fitting its parameters from the archive. **This phase has a HARD validation gate: phase 7 (RL/ML) must not start until the sim passes it** — bad fits poison everything downstream.

## Requirements
- Functional: simulate a full race (any 2024+ track) given grid, driver pace ratings, strategies; vectorizable (1000s of rollouts fast); seedable/deterministic; calibration CLI refits params per season×track.
- Non-functional: ≥200 full-race rollouts/sec single-process (numpy lap-batch ops); params stored as versioned artifacts (`data/calibration/{year}/{track}.json`).

## Architecture
Lap time model (per car, per lap):
```
lap_ms = base(track, car_pace)            # fitted per driver/team/season
       + deg(compound, tire_age; track)    # linear or mild quadratic, fitted
       + fuel_effect(remaining_laps)       # per-track kg→ms coefficient (literature prior, ~0.03s/kg)
       + traffic_penalty(gap_ahead)        # dirty-air step if within threshold
       + noise ~ N(0, σ_track)
pit stop: pit_loss(track) fitted in phase 3 analytics
SC/VSC: hazard process (per-lap base rate per track from sc_history) → field bunching, deg pause, cheap pit window
overtake model: probabilistic position swap given pace delta + track overtaking difficulty coefficient
```
Components:
```
sim/race_sim.py         → core vectorized simulator (numpy state arrays; cars as rows — variable count, series-agnostic)
sim/params.py           → SimParams dataclass: load/save calibration artifacts
sim/strategies.py       → strategy encoding: list[(pit_lap, compound)] + policy-driven mode (callback per lap — used by RL in phase 7)
sim/gym_env.py          → Gymnasium wrapper around race_sim for single-agent pit decisions (obs/action/reward defined here, consumed phase 7)
sim/calibration/fit_degradation.py  → robust regression on stint_deg_dataset (per compound×track; pooled-year prior, per-season offset)
sim/calibration/fit_pace.py         → driver/team base pace from clean-lap medians
sim/calibration/fit_sc_rates.py     → per-track per-lap SC/VSC base hazard
sim/calibration/cli.py              → `uv run f1-calibrate --year ... --track ...`
sim/validation/replay_real_races.py → validation gate runner
```

## Related Code Files
- Create: all under `backend/src/f1_strategy/sim/` per architecture
- Create: `backend/tests/sim/{test_race_sim.py, test_calibration_fits.py, test_validation_gate.py}`

## Implementation Steps
1. `params.py` + `race_sim.py` skeleton with hand-set params; unit tests: monotonic deg, pit loss applied, conservation (no teleporting positions).
2. Calibration fits (deg → pace → sc): robust to outliers (Huber/RANSAC); refuse fit if n < floor (fallback: pooled cross-track compound curve + track offset).
3. Traffic + overtaking: fit overtaking difficulty per track from archive position-change counts vs pace deltas (coarse is fine).
4. `strategies.py` + fixed-strategy rollout API; vectorize across rollouts (param noise + SC realizations vary).
5. **Validation gate** (`replay_real_races.py`): hold out 20% of 2024-25 races (stratified by track type). Feed real grid + real strategies + no-SC-surprise (use actual SC laps) → compare sim vs real: (a) per-driver total race time, (b) stint-level lap-time RMSE, (c) finishing-order rank correlation. Thresholds: median |race time error| ≤ 15s (~0.25%), stint RMSE ≤ 0.8s/lap, Spearman ≥ 0.85. Produce report in `plans/reports/`.
6. If gate fails: iterate fits (more filters, quadratic deg, per-stint fuel correction) — do NOT proceed to phase 7.
7. `gym_env.py`: obs = [race_frac, position_norm, gap_ahead/behind, tire_age_norm, compound one-hot, deg_rate, track_status, top-k rivals' (gap, tire_age, compound)]; action = {stay, pit_soft, pit_med, pit_hard, pit_inter, pit_wet}; reward = -Δ(expected finish position) shaping + terminal position bonus; invalid actions masked (compound availability rules).

## Success Criteria
- [ ] Validation gate report exists with all 3 metrics ≥ thresholds on held-out races
- [ ] ≥200 rollouts/sec benchmark recorded
- [ ] Same seed → identical rollout (determinism test)
- [ ] `gym_env` passes `gymnasium.utils.env_checker`
- [ ] Calibration artifacts versioned per season×track; 2026 fitted separately from 2024-25 (reg change)

## Risk Assessment
- **Top project risk: fit quality.** Mitigations baked in: strict clean-lap filters (phase 3), robust regressors, sample-size floors, pooled priors, explicit gate with report.
- 2026 has few races so far (~9 rounds by June) → wider priors + cross-track pooling for 2026; flag low-confidence tracks in artifact metadata.
- Wet races break lap model → exclude wet sessions from calibration v1; sim supports inter/wet compounds with literature-prior deltas only; document limitation.
