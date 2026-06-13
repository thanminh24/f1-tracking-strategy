"""RSRL-style recurrent strategy environment.

This is a challenger env, not a replacement for `RaceStrategyEnv`. It keeps the
same four pit actions but returns a sequence of richer feature rows so recurrent
agents can learn race trends.
"""

from collections import deque

import numpy as np
from gymnasium import spaces

from f1_strategy.sim.gym_env import ACTIONS, RaceStrategyEnv
from f1_strategy.sim.observation_features import (
    DRY_COMPOUNDS,
    RSRL_FEATURE_NAMES,
    build_rsrl_env_features,
    validate_strategy_action,
)
from f1_strategy.sim.params import SimParams
from f1_strategy.sim.race_sim import COMPOUND_IDX

F1_POINTS = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
}


class RaceStrategyRecurrentEnv(RaceStrategyEnv):
    """Focal-car strategy env with sequence observations and RSRL reward modes."""

    metadata = {"render_modes": []}

    def __init__(
        self,
        params: SimParams,
        n_rivals: int = 19,
        seed: int = 0,
        sequence_len: int = 8,
        reward_mode: str = "terminal_points",
    ):
        self.sequence_len = max(1, int(sequence_len))
        self.reward_mode = reward_mode
        self._history: deque[np.ndarray] = deque(maxlen=self.sequence_len)
        self._available_compounds = set(DRY_COMPOUNDS)
        self._used_compounds: set[str] = set()
        self._focal_pit_stops = 0
        self._last_lap_ms = params.base_lap_ms
        super().__init__(params, n_rivals=n_rivals, seed=seed)
        self.observation_space = spaces.Box(
            -10.0,
            10.0,
            shape=(self.sequence_len, len(RSRL_FEATURE_NAMES)),
            dtype=np.float32,
        )

    def reset(self, *, seed: int | None = None, options: dict | None = None):
        self._history = deque(maxlen=self.sequence_len)
        self._available_compounds = set(DRY_COMPOUNDS)
        self._used_compounds = set()
        self._focal_pit_stops = 0
        self._last_lap_ms = self.params.base_lap_ms
        obs, info = super().reset(seed=seed, options=options)
        start_idx = int(self._compound[0])
        if 0 <= start_idx < len(DRY_COMPOUNDS):
            self._used_compounds.add(DRY_COMPOUNDS[start_idx])
        return obs, info

    def _obs(self) -> np.ndarray:
        row = build_rsrl_env_features(
            self,
            used_compounds=self._used_compounds,
            pit_stops=self._focal_pit_stops,
            available_compounds=self._available_compounds,
        )
        self._history.append(row)
        if len(self._history) < self.sequence_len:
            pad = [np.zeros_like(row) for _ in range(self.sequence_len - len(self._history))]
            return np.stack([*pad, *self._history]).astype(np.float32)
        return np.stack(list(self._history)).astype(np.float32)

    def step(self, action: int):
        current_idx = int(self._compound[0])
        current_compound = (
            DRY_COMPOUNDS[current_idx] if current_idx < len(DRY_COMPOUNDS) else "MEDIUM"
        )
        validity = validate_strategy_action(action, current_compound, self._available_compounds)

        obs, shaped_reward, terminated, truncated, info = super().step(action)
        if action > 0:
            compound = ACTIONS[action] if action < len(ACTIONS) else None
            if compound in COMPOUND_IDX:
                self._used_compounds.add(compound)
                self._available_compounds.discard(compound)
                self._focal_pit_stops += 1

        self._last_lap_ms = float(self.params.base_lap_ms)
        reward = shaped_reward if self.reward_mode == "position_shaped" else 1.0
        if not validity.valid:
            reward -= 10.0
            info["invalid_action"] = validity.reason
        if terminated and self.reward_mode == "terminal_points":
            position = int(info["position"])
            reward += float(F1_POINTS.get(position, 0) * 100)
            if len(self._used_compounds) < 2:
                reward -= 3000.0
                info["invalid_finish"] = "single_compound"
        return obs, reward, terminated, truncated, info
