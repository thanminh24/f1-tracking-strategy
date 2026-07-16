---
phase: 8
title: "Runtime dependency split and lightweight model inference"
status: in_progress
effort: "3 days"
---

# Phase 8: Runtime dependency split and lightweight model inference

## Overview

Separate serving, analysis, and training dependencies; reduce runtime weight without weakening correctness.

## Implementation Steps

1. Measure locked package/image contribution and imports. Current install: Torch ~1.08 GiB, PyArrow ~147 MiB, SciPy ~109 MiB, DuckDB ~58 MiB.
2. Split dependency groups into live-core, archive, strategy-runtime, training, and development with lock-verified CI environments.
3. Predefine model evaluation: walk-forward temporal splits, multiple circuits/weather/SC regimes, seeds, and stay/heuristic/PPO/RS-RL/candidate baselines.
4. Measure reward, regret, pit-window error, invalid actions, calibration, noise robustness, latency, and resources.
5. Prototype PPO/RS-RL export to ONNX with CPU runtime; test preprocessing, recurrent state, logits/actions, and rollouts for parity.
6. Remove Torch from serving only after parity; otherwise keep strategy optional and use a CPU-only analysis image.
7. Select no new “best” model without uncertainty and leakage checks.

## Success Criteria

- [ ] Live-core lock excludes archive/training packages.
- [ ] Exported policies meet documented parity tolerances.
- [ ] Unsupported export has explicit fallback.
- [ ] “Best” requires multi-circuit, multi-seed evidence.
