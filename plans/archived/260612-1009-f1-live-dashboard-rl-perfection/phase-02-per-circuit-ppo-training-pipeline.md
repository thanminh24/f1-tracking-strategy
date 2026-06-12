---
phase: 2
title: "Per-Circuit PPO Training Pipeline"
status: pending
priority: P1
effort: "3-5h code + training runtime ~1-4h GPU (RTX 4060)"
dependencies: [1]
---

# Phase 2: Per-Circuit PPO Training Pipeline

## Overview

Train a PPO checkpoint for every circuit (using its `SimParams` from phase 1) and evaluate each
against the quality gate: ≥1.5s mean position gain + ≥55% head-to-head win rate on 500 sims.
Also introduces **track-cluster training** as a fallback for circuits with thin calibration data.

## Requirements

**Functional:**
- `f1-train-ppo-all` batch CLI: trains + evaluates PPO for every calibrated circuit
- Per-circuit checkpoint `data/models/ppo_{season}_{circuit}.zip`
- Per-circuit eval JSON `data/models/ppo_{season}_{circuit}_eval.json` with gate verdict
- Track-cluster fallback: circuits with `confidence=pooled` train on pooled cluster params
- 500-sim eval (not 100 smoke runs) for every circuit
- Training summary: table of circuit | gate_passed | mean_gain_s | win_rate | timesteps

**Non-functional:**
- Parallelizable: optional `--workers N` to train multiple circuits concurrently
- Skip-if-exists: `--force` flag to retrain; default skips circuits with passing eval
- GPU-aware: SB3 auto-selects CUDA (RTX 4060)

## Architecture

```
f1-train-ppo-all (NEW CLI)
  reads data/calibration/{season}/ → list of circuits
  for each circuit:
    SimParams.load(season, circuit)
    train(season, circuit, timesteps=300_000)     # increased from 100k smoke
    evaluate(season, circuit, n_sims=500)         # full gate (was 100)
    write: ppo_{season}_{circuit}.zip + _eval.json
  prints: circuit | gate_passed | mean_gain_s | win_rate | timesteps | duration

Track-cluster training:
  circuits with confidence=pooled → use pooled SimParams → same PPO pipeline
  checkpoint name encodes circuit name (not cluster) so serving still works
```

**Training hyperparameters (tuned for F1 strategy horizon):**
- `timesteps=300_000` (3× smoke run; ~3-5min per circuit on RTX 4060)
- `n_steps=2048`, `batch_size=512` (longer horizon for 50-70 lap races)
- `ent_coef=0.01` (encourage exploration of multi-stop strategies)
- `gamma=0.995` (long-horizon reward; terminal position bonus matters)

## Related Code Files

- Modify: `backend/src/f1_strategy/strategy/ppo_agent/train.py` — bump defaults, add batch CLI
- Modify: `backend/src/f1_strategy/strategy/train_models_cli.py` — add `train-ppo-all` subcommand
- Modify: `backend/pyproject.toml` — register `f1-train-ppo-all` entry point
- Modify: `Makefile` — add `train-ppo-all` target
- Read: `backend/src/f1_strategy/sim/gym_env.py` — env definition (rivals still fixed here; phase 3 changes this)
- Read: `backend/src/f1_strategy/sim/params.py` — `SimParams.load`

## Implementation Steps

1. **Tune PPO hyperparameters** in `train.py` — increase defaults: `timesteps=300_000`,
   `n_steps=2048`, `batch_size=512`, `ent_coef=0.01`, `gamma=0.995`
2. **Add `--eval-sims 500` default** to `evaluate()` — current default is 100; gate requires 500
3. **Add `f1-train-ppo-all` subcommand** to `train_models_cli.py`:
   ```python
   # scans data/calibration/{season}/ for .json files
   # for each: call train() then evaluate(n_sims=500)
   # --skip-passing: skip circuits where _eval.json exists and gate_passed=true
   # --workers N: multiprocessing pool (careful with GPU memory — default 1)
   # prints markdown summary table + overall pass rate
   ```
4. **Add `train-ppo-all` Makefile target**:
   ```makefile
   train-ppo-all:
       uv run f1-train-ppo-all --season 2024 --skip-passing
   ```
5. **Run training** — start with 3-5 representative circuits to validate gate metrics
   before full 24-circuit run
6. **Gate check** — for any circuit failing gate: increase timesteps to 500k, retrain once;
   document failing circuits in report (some circuits genuinely hard for PPO)
7. **Write eval report** — `plans/reports/ppo-eval-260612-1009-per-circuit-gate-results-report.md`

## Success Criteria

- [ ] PPO checkpoints exist for ≥20 of 24 circuits
- [ ] ≥80% of circuits pass the gate (≥1.5s mean gain + ≥55% win rate on 500 sims)
- [ ] `--skip-passing` correctly skips circuits with passing eval JSON
- [ ] Training completes in ≤4h on RTX 4060 with `--workers 1`
- [ ] Eval JSON written for every trained circuit with `gate_passed` field
- [ ] `f1-train-ppo-all` summary table printed with pass/fail per circuit

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Some circuits gate hard to pass (street circuits with high SC variance) | Increase timesteps to 500k; document; SC randomness is real |
| GPU OOM with concurrent training | Default `--workers 1`; user can increase if VRAM allows |
| Eval variance (500 sims still noisy) | Report std of position gain alongside mean |
| Fixed-rival bias: rivals use random 1/2-stop, not real strategies | Phase 3 addresses this; note limitation in eval |
