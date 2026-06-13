# RSRL Challenger Cook

Date: 2026-06-13

Implemented the first RSRL challenger infrastructure beside current PPO/MC:
baseline inventory, recurrent env, DRQN training scaffold, tournament harness,
shadow prediction plumbing, and perturbation explanation.

Validation:

- `backend`: ruff clean.
- `backend`: full pytest passed, 81 tests.
- `frontend`: lint passed with existing warnings.
- `frontend`: production build passed.

Decision:

- Keep PPO/MC as production baseline.
- Keep RSRL behind `F1_RSRL_SHADOW=1` until real long-budget training and tournament metrics prove promotion gates.

Unresolved questions:

- Choose first train/test circuit split.
- Choose wall-clock/GPU budget for first full RSRL training run.
