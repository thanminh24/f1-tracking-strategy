---
title: "RSRL Challenger Model"
description: "Build and evaluate an RSRL-style recurrent challenger against the current PPO/MC strategy model."
status: in_progress
priority: P1
effort: 28h
branch: main
tags: [rl, rsrl, model, training, evaluation]
created: 2026-06-13
---

# RSRL Challenger Model

Goal: test whether an RSRL-style recurrent strategy model can beat the current PPO/MC system without destabilizing live predictions.

Strategy: keep current PPO/MC as production baseline, add a shadow `rsrl_v2` challenger, evaluate on holdout races/circuits, then promote only if gates pass.

## Phases

1. [Phase 01: Baseline Audit And Metrics](phase-01-baseline-audit-and-metrics.md)  
   Status: inventory complete, evaluation pending. Baseline inventory/report CLI and metric contract are implemented; expensive PPO/fixed/MC baseline runs remain.

2. [Phase 02: RSRL State And Environment](phase-02-rsrl-state-and-environment.md)  
   Status: complete. Recurrent observation env, feature builder, reward modes, and env tests are implemented.

3. [Phase 03: DRQN Training Pipeline](phase-03-drqn-training-pipeline.md)  
   Status: scaffold complete. DRQN model, replay buffer, train/eval CLI, policy loader, and smoke tests are implemented; long real training remains.

4. [Phase 04: Evaluation Tournament](phase-04-evaluation-tournament.md)  
   Status: scaffold complete. Agent interface, fixed/RSRL adapters, tournament runner, promotion gate, CLI, and smoke tests are implemented; full PPO/RSRL tournament remains.

5. [Phase 05: Shadow Live Inference](phase-05-shadow-live-inference.md)  
   Status: complete for backend/UI plumbing. RSRL shadow recommendations are feature-flagged and optional; real checkpoint live validation remains.

6. [Phase 06: Explainability And Promotion Decision](phase-06-explainability-and-promotion-decision.md)  
   Status: complete. Surrogate tree, counterfactual helper, UI top-factors, and promotion report all implemented. Promotion decision pending real training run.

## Success Gate

Promote only if RSRL beats current PPO on unseen-race evaluation by:
- Head-to-head win rate >= 55%.
- Mean expected finishing position improvement >= 0.25 places.
- Expected points improvement >= 3%.
- Invalid strategy rate = 0.
- P95 inference latency <= 50ms per full field on local target hardware.

Unresolved questions:
- Exact train/test circuits depend on local archive coverage and real training budget.
- RSRL has not yet beaten PPO; infrastructure is ready to run the comparison.
