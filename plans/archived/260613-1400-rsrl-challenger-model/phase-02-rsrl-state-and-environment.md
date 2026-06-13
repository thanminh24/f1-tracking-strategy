# Phase 02: RSRL State And Environment

## Context Links

- Parent plan: [plan.md](plan.md)
- Depends on: Phase 01
- Current env: `backend/src/f1_strategy/sim/gym_env.py`
- Current policy obs: `backend/src/f1_strategy/strategy/ppo_agent/policy.py`

## Overview

Date: 2026-06-13  
Priority: P1  
Implementation status: complete  
Review status: verified by lint/tests

Create a new RSRL-compatible environment beside `RaceStrategyEnv`. Do not mutate PPO env behavior.

## Key Insights

- RSRL should see sequences, not isolated laps.
- State must include published paper concepts that current PPO misses.
- Terminal reward should be tested against current shaped reward.

## Requirements

- New env name: `RaceStrategyRecurrentEnv`.
- Keep action space: `0=STAY`, `1=PIT_SOFT`, `2=PIT_MEDIUM`, `3=PIT_HARD`.
- Add observation features:
  - race progress
  - normalized position
  - gap ahead
  - gap behind
  - gap to leader
  - current tyre one-hot
  - tyre age
  - tyre degradation slope
  - last lap to reference
  - SC/VSC state
  - available soft/medium/hard flags
  - valid finish flag
  - pit stops used
  - track/circuit embedding or one-hot id
- Maintain recurrent sequence length, initially 8 laps.
- Enforce invalid action rules:
  - cannot pit to unavailable compound
  - must finish with at least two compounds in dry race
  - avoid nonsensical repeated pit every lap unless explicitly allowed for failure learning.

## Architecture

New env path:

`RaceSim + SimParams + rival strategy sampler -> RaceStrategyRecurrentEnv -> sequence obs -> DRQN`

Keep old:

`RaceStrategyEnv -> PPO`

Both must share simulator utilities and strategy action constants.

## Related Code Files

- Create: `backend/src/f1_strategy/sim/recurrent_gym_env.py`
- Create: `backend/src/f1_strategy/sim/observation_features.py`
- Modify cautiously: `backend/src/f1_strategy/sim/gym_env.py` only to share constants/helpers.
- Test: `backend/tests/sim/test_recurrent_gym_env.py`

## Implementation Steps

1. Extract shared action labels/constants.
2. Add `observation_features.py` with pure feature builders.
3. Implement recurrent env with a fixed history buffer.
4. Add two reward modes:
   - `terminal_points`: paper-aligned
   - `position_shaped`: current-style ablation
5. Add tyre availability model:
   - simple dry allocation default
   - support future real tyre-set data if available
6. Add unit tests:
   - observation shape stable
   - invalid pit action penalized
   - no-stop dry race penalized
   - recurrent buffer fills correctly after reset/step
7. Add config flags:
   - `F1_RSRL_SEQUENCE_LEN`
   - `F1_RSRL_REWARD_MODE`

## Todo List

- [x] Create recurrent env.
- [x] Create feature builder.
- [x] Add reward-mode ablation.
- [x] Add tyre availability constraints.
- [x] Add env tests.

## Success Criteria

- Env passes Gymnasium checks.
- Sequence observation shape is deterministic.
- Reward tests cover valid and invalid strategy paths.
- Existing PPO env tests still pass.

## Risk Assessment

- Feature expansion can leak future info. Mitigation: only use current/past lap fields.
- Track one-hot can overfit. Mitigation: compare one-hot vs learned embedding/no-track ablation.

## Security Considerations

- No security-sensitive data involved.

## Next Steps

- Feed env into DRQN training in Phase 03.

Unresolved questions:
- Real tyre-set allocation data can replace the current dry-compound availability defaults later.
