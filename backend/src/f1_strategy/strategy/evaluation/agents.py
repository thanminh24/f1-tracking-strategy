"""Agent adapters used by strategy-model tournaments."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import numpy as np

from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy


class StrategyAgent(Protocol):
    name: str

    def act(self, obs: np.ndarray, lap: int) -> int:
        """Return action index: 0 stay, 1 soft, 2 medium, 3 hard."""


@dataclass(frozen=True)
class FixedScheduleAgent:
    name: str
    schedule: dict[int, int]

    def act(self, obs: np.ndarray, lap: int) -> int:
        return self.schedule.get(lap, 0)


@dataclass
class RSRLAgent:
    name: str
    policy: RSRLPolicy

    def act(self, obs: np.ndarray, lap: int) -> int:
        if not self.policy.available:
            return 0
        return int(np.argmax(self.policy.q_values(obs)))


def fixed_one_stop_agent(total_laps: int) -> FixedScheduleAgent:
    return FixedScheduleAgent("fixed_one_stop", {max(1, total_laps // 2): 3})


def fixed_two_stop_agent(total_laps: int) -> FixedScheduleAgent:
    return FixedScheduleAgent(
        "fixed_two_stop",
        {max(1, total_laps // 3): 2, max(2, 2 * total_laps // 3): 3},
    )
