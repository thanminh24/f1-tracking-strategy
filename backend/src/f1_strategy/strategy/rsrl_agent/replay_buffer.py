"""Replay buffer for recurrent strategy Q-learning."""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class TransitionBatch:
    obs: np.ndarray
    actions: np.ndarray
    rewards: np.ndarray
    next_obs: np.ndarray
    dones: np.ndarray


class SequenceReplayBuffer:
    """Stores sequence observations from `RaceStrategyRecurrentEnv` transitions."""

    def __init__(self, capacity: int = 50_000, seed: int = 0):
        self.capacity = capacity
        self.rng = np.random.default_rng(seed)
        self._items: list[tuple[np.ndarray, int, float, np.ndarray, bool]] = []
        self._cursor = 0

    def __len__(self) -> int:
        return len(self._items)

    def add(
        self,
        obs: np.ndarray,
        action: int,
        reward: float,
        next_obs: np.ndarray,
        done: bool,
    ) -> None:
        item = (
            obs.astype(np.float32, copy=True),
            int(action),
            float(reward),
            next_obs.astype(np.float32, copy=True),
            bool(done),
        )
        if len(self._items) < self.capacity:
            self._items.append(item)
            return
        self._items[self._cursor] = item
        self._cursor = (self._cursor + 1) % self.capacity

    def sample(self, batch_size: int) -> TransitionBatch:
        if not self._items:
            raise ValueError("cannot sample empty replay buffer")
        idx = self.rng.integers(0, len(self._items), size=batch_size)
        rows = [self._items[int(i)] for i in idx]
        return TransitionBatch(
            obs=np.stack([r[0] for r in rows]),
            actions=np.array([r[1] for r in rows], dtype=np.int64),
            rewards=np.array([r[2] for r in rows], dtype=np.float32),
            next_obs=np.stack([r[3] for r in rows]),
            dones=np.array([r[4] for r in rows], dtype=np.float32),
        )
