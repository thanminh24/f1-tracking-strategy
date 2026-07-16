"""Agent adapters used by strategy-model tournaments."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import numpy as np

from f1_strategy.config import get_settings
from f1_strategy.strategy.ppo_agent.policy import _load_model
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy


class StrategyAgent(Protocol):
    name: str
    observation_mode: str

    def act(self, obs: np.ndarray, lap: int) -> int:
        """Return action index: 0 stay, 1 soft, 2 medium, 3 hard."""


@dataclass(frozen=True)
class FixedScheduleAgent:
    name: str
    schedule: dict[int, int]
    observation_mode: str = "flat"

    def act(self, obs: np.ndarray, lap: int) -> int:
        return self.schedule.get(lap, 0)


@dataclass(frozen=True)
class StayAgent:
    name: str = "stay"
    observation_mode: str = "flat"

    def act(self, obs: np.ndarray, lap: int) -> int:
        return 0


@dataclass
class PPOCheckpointAgent:
    name: str
    season: int
    circuit: str
    observation_mode: str = "flat"

    def __post_init__(self) -> None:
        loaded = _load_model(self.season, self.circuit)
        self.model = loaded[0] if loaded else None
        self.artifact_season = loaded[1] if loaded else self.season
        self.version = (
            f"ppo_{self.artifact_season}_{self.circuit}" if self.model is not None else "none"
        )

    @property
    def available(self) -> bool:
        return self.model is not None

    def act(self, obs: np.ndarray, lap: int) -> int:
        if self.model is None:
            return 0
        action, _ = self.model.predict(obs, deterministic=True)
        return int(action)


@dataclass
class RSRLAgent:
    name: str
    policy: RSRLPolicy
    observation_mode: str = "recurrent"

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


def build_benchmark_agents(
    season: int,
    circuit: str,
    total_laps: int,
    rsrl_checkpoint: Path | None = None,
) -> list[StrategyAgent]:
    agents: list[StrategyAgent] = [
        StayAgent(),
        fixed_one_stop_agent(total_laps),
        fixed_two_stop_agent(total_laps),
    ]
    ppo_agent = PPOCheckpointAgent("ppo_current", season, circuit)
    if ppo_agent.available:
        agents.append(ppo_agent)
    rsrl_path = rsrl_checkpoint or _auto_find_rsrl_checkpoint(season, circuit)
    if rsrl_path is not None:
        policy = RSRLPolicy(rsrl_path)
        if policy.available:
            agents.append(RSRLAgent(rsrl_path.stem, policy))
    return agents


def _auto_find_rsrl_checkpoint(season: int, circuit: str) -> Path | None:
    models_dir = get_settings().models_dir
    for try_season in (season, 2025, 2024):
        path = models_dir / f"rsrl_{try_season}_{circuit}.pt"
        if path.exists():
            return path
    matches = sorted(models_dir.glob(f"rsrl_*_{circuit}.pt"))
    return matches[-1] if matches else None
