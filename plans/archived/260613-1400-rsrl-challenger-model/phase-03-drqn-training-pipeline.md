# Phase 03: DRQN Training Pipeline

## Context Links

- Parent plan: [plan.md](plan.md)
- Depends on: Phase 02
- Current PPO train: `backend/src/f1_strategy/strategy/ppo_agent/train.py`

## Overview

Date: 2026-06-13  
Priority: P1  
Implementation status: scaffold complete  
Review status: verified by lint/tests

Train an RSRL-style recurrent Q-network challenger. Keep checkpoints separate from PPO.

## Key Insights

- Stable-Baselines3 does not provide DRQN directly.
- Best pragmatic path: implement small PyTorch DRQN training loop for discrete actions.
- Use replay buffer with sequence sampling and target network.

## Requirements

- New artifact names:
  - `data/models/rsrl_{season}_{circuit}.pt`
  - `data/models/rsrl_{season}_{circuit}_eval.json`
  - `data/models/rsrl_multi_track_v1.pt`
- Support train modes:
  - single-circuit
  - multi-circuit
  - leave-one-circuit-out eval
- Deterministic seeds.
- GPU optional, CPU safe.
- Never overwrite PPO checkpoints.

## Architecture

Training loop:

`RaceStrategyRecurrentEnv -> sequence replay buffer -> DRQN online net -> target net -> checkpoint -> evaluation`

Model:
- Input: `(batch, sequence_len, feature_dim)`
- Recurrent layer: GRU or LSTM
- Head: Q-values for 4 actions
- Action selection: epsilon-greedy during train, argmax during eval

## Related Code Files

- Create: `backend/src/f1_strategy/strategy/rsrl_agent/model.py`
- Create: `backend/src/f1_strategy/strategy/rsrl_agent/replay_buffer.py`
- Create: `backend/src/f1_strategy/strategy/rsrl_agent/train.py`
- Create: `backend/src/f1_strategy/strategy/rsrl_agent/policy.py`
- Create: `backend/tests/strategy/test_rsrl_agent_smoke.py`
- Modify: `backend/pyproject.toml` entry point if CLI commands are registered there.

## Implementation Steps

1. Implement `DRQN` model.
2. Implement sequence replay buffer:
   - stores observations, actions, rewards, dones
   - samples contiguous sequences
3. Implement target-network DQN training:
   - Huber loss
   - gamma 0.99
   - target sync every N updates
   - epsilon decay
4. Add CLI:
   - `f1-train-rsrl --season 2024 --circuit Sakhir --timesteps 200000`
   - `f1-train-rsrl --multi-track --seasons 2024 2025`
5. Add checkpoint metadata:
   - feature schema hash
   - reward mode
   - sequence length
   - train circuits
   - eval metrics
6. Add smoke tests:
   - 2-episode train does not crash
   - checkpoint load produces Q-values
   - invalid action mask works if implemented

## Todo List

- [x] Add DRQN model.
- [x] Add replay buffer.
- [x] Add train CLI.
- [x] Add checkpoint metadata.
- [x] Add smoke tests.

## Success Criteria

- Smoke training completes under 2 minutes.
- Checkpoint can be loaded by inference wrapper.
- Training metrics saved after every run.
- Existing PPO training remains untouched.

## Risk Assessment

- Training instability likely. Mitigation: start with simple GRU, small network, extensive seeding, and compare reward modes.
- Replay buffer bugs are subtle. Mitigation: pure unit tests for sequence sampling and terminal boundaries.

## Security Considerations

- Model files remain under gitignored `data/models`.

## Next Steps

- Run tournament evaluation in Phase 04.

Unresolved questions:
- GRU is implemented first; LSTM remains an ablation only if tournament metrics justify it.
- Real multi-track training is still required before performance claims.
