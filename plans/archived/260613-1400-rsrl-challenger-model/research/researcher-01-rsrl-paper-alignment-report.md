# Researcher 01: RSRL Paper Alignment

Status: done

Scope: compare target architecture against Thomas et al. "Explainable Reinforcement Learning for Formula One Race Strategy" (Imperial + Mercedes-AMG PETRONAS).

Findings:
- Paper target is RSRL: simulator-trained RL for pit strategy, deployed over live race state.
- State includes track, SC status, position, race progress, current tyre, tyre degradation, tyre availability, gaps ahead/behind/leader, last-lap-to-reference, and valid-finish signal.
- Action space is four discrete choices: no pit, pit soft, pit medium, pit hard.
- Paper argues for DRQN, not plain DQN, because F1 strategy is partially observable and temporal trends matter.
- Reward is mostly terminal: F1 points-based finish reward, normal-step reward, heavy invalid-action penalties. Paper explicitly avoids mid-race reward shaping because decision quality is only known at race end.
- Architecture uses abstraction: unified race state/strategy plus translator layers so simulator data and live data can both feed the model.
- XAI layer uses TimeSHAP, VIPER surrogate decision trees, and decision-tree counterfactuals.

Implication:
- To fairly test "RSRL-like" improvement, the repo needs recurrent memory, richer state, tyre-availability constraints, terminal-focused reward, and a controlled evaluation harness.
- Do not replace current PPO immediately. Build RSRL-v2 as challenger and compare against current PPO/MC outputs.

Sources:
- https://arxiv.org/html/2501.04068v1
- https://dl.acm.org/doi/10.1145/3672608.3707766

Unresolved questions:
- Exact Mercedes simulator internals are proprietary; we can only mirror published abstractions.
