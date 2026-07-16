# RL benchmark — 2024 Barcelona

- Date: 2026-06-23
- Command: `cd backend && uv run python scripts/run_model_tournament.py --season 2024 --circuit Barcelona --train-rsrl --timesteps 10000 --n-sims 8 --seed 7 --sequence-len 8 --device cpu --output ../plans/reports/rsrl-barcelona-promotion-trial.json`
- Checkpoint written: `data/models/rsrl_2024_Barcelona.pt`

## Summary

- PPO baseline still clearly better.
- Fresh RSRL challenger did not pass promotion gate.
- Keep PPO as main strategy model.

## Key metrics

- `ppo_current`: mean finish `6.375`, expected points `8.25`
- `rsrl_2024_Barcelona`: mean finish `18.875`, expected points `0.0`
- Position gain vs PPO: `-12.5`
- Promotion result: `false`
- Inference p95: `0.197 ms` for RSRL, under latency gate

## Interpretation

- RSRL is fast enough at inference.
- Current training recipe is not competitive yet.
- Main next lever is training quality, not runtime latency.

## Recommended next moves

1. Keep PPO as production/default recommendation model.
2. Treat RSRL as challenger only.
3. Run longer training on one circuit first, then selective multi-circuit checks.
4. Only consider promotion after PPO head-to-head turns positive on at least one circuit.

Unresolved questions:

- What timesteps budget do we want for the next Barcelona retrain?
- Do we want Sakhir or Barcelona as the canonical first promotion circuit?
