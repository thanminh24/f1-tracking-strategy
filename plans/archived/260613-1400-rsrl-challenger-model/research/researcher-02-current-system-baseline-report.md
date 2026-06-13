# Researcher 02: Current System Baseline

Status: done

Scope: summarize current model architecture and baseline to beat.

Current stack:
- `RaceSim`: stochastic lap simulator with tyre degradation, fuel burn, traffic, SC process, pit loss, no-pass clamp, and SC bunching.
- `RaceStrategyEnv`: single-agent Gym env. Focal car chooses `STAY/SOFT/MEDIUM/HARD`; rivals use one-stop/two-stop or behavior-model sampled strategies.
- `PPOPolicy`: Stable-Baselines3 PPO with `MlpPolicy`, one current-lap observation, no recurrent memory.
- `BehaviorModel`: LightGBM pit probability + next-compound classifier. Used for MC strategy sampling, not the RL action itself.
- `SCHazardModel`: prior/logistic SC probability model.
- `MCResult`: rollouts provide finish distributions, pit windows, next compounds.
- `PredictionService`: per-lap orchestrator emitting `PredictionSet` with PPO recommendation + MC probabilities.

Baseline weaknesses:
- PPO is snapshot-only; it cannot directly infer momentum/trends from previous laps.
- State vector is only 10 dims and misses gap-to-leader, last-lap-vs-reference, available compounds, valid-finish, track identity.
- Reward is shaped by per-lap position delta, which may overvalue short-term track position.
- Evaluation gate is weaker than paper-style evaluation: current eval compares mean finishing position vs fixed strategies, not robust cross-track/challenger matrix.
- No XAI layer explains "why pit now".

Baseline strengths:
- Current MC layer already gives pit windows and outcome probabilities.
- Live/archive adapters already produce a unified `RaceState`.
- PPO inference is safe: absent checkpoints degrade cleanly.

Unresolved questions:
- Need inspect available local data volume before selecting exact train/test seasons and circuits.
