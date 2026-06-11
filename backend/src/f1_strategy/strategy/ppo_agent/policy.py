"""PPO checkpoint inference: per-car recommended action + action probabilities.

Builds the gym observation vector for any car from a RaceState (mirror of
RaceStrategyEnv._obs) so one trained focal-car policy serves the whole field.
"""

import logging
from functools import lru_cache

import numpy as np

from f1_strategy.config import get_settings
from f1_strategy.models import CarStatus, RaceState, TrackStatus
from f1_strategy.sim.gym_env import ACTIONS
from f1_strategy.sim.params import SimParams

log = logging.getLogger(__name__)

ACTION_LABELS = {"STAY": "STAY", "SOFT": "PIT_SOFT", "MEDIUM": "PIT_MEDIUM", "HARD": "PIT_HARD"}
COMPOUND_SLOT = {"SOFT": 0, "MEDIUM": 1, "HARD": 2}


@lru_cache(maxsize=4)
def _load_model(season: int, circuit: str):
    # Path check BEFORE the SB3/torch import: absent checkpoints must not pay the
    # multi-second torch import. NOTE: a None result is cached — training a new
    # checkpoint requires a server restart to be picked up.
    path = get_settings().models_dir / f"ppo_{season}_{circuit}.zip"
    if not path.exists():
        return None
    from stable_baselines3 import PPO  # deferred heavy import

    return PPO.load(str(path), device="auto")


def build_obs(state: RaceState, params: SimParams) -> tuple[list[str], np.ndarray]:
    """(car_ids, (n, 10) obs batch) for all running cars, sorted by position."""
    cars = [c for c in state.cars if c.status not in (CarStatus.OUT, CarStatus.FINISHED)]
    cars.sort(key=lambda c: c.position)
    total = state.total_laps or params.total_laps
    n = len(cars)
    obs = np.zeros((n, 10), dtype=np.float32)
    sc = float(state.track_status in (TrackStatus.SC, TrackStatus.VSC))
    for i, c in enumerate(cars):
        gap_ahead = c.interval_s or 0.0
        gap_behind = (cars[i + 1].interval_s or 0.0) if i < n - 1 else 0.0
        comp = (c.tire.compound if c.tire else "MEDIUM") or "MEDIUM"
        slot = COMPOUND_SLOT.get(comp)
        onehot = np.zeros(3)
        if slot is not None:
            onehot[slot] = 1.0
        slope = params.compound(comp).deg_ms_per_lap / 100.0
        # training env feeds 0-based rank/n (gym_env._obs) — mirror exactly,
        # and rank within RUNNING cars so the feature stays in [0, 1) late-race
        obs[i] = [
            c.lap / max(total, 1), i / max(n, 1),
            min(gap_ahead, 30) / 30, min(gap_behind, 30) / 30,
            (c.tire.age_laps if c.tire else 0) / 40.0,
            *onehot, slope, sc,
        ]
    return [c.car_id for c in cars], obs


class PPOPolicy:
    """None-safe wrapper: absent checkpoint → recommendations omitted, never errors."""

    def __init__(self, season: int, circuit: str):
        self.model = _load_model(season, circuit)
        self.version = f"ppo_{season}_{circuit}" if self.model else "none"

    @property
    def available(self) -> bool:
        return self.model is not None

    def recommend(self, state: RaceState, params: SimParams) -> dict[str, dict]:
        """car_id → {recommended_action, action_probs}; {} when no checkpoint."""
        if self.model is None:
            return {}
        import torch

        car_ids, obs = build_obs(state, params)
        if not car_ids:
            return {}
        with torch.no_grad():
            tensor, _ = self.model.policy.obs_to_tensor(obs)
            dist = self.model.policy.get_distribution(tensor)
            probs = dist.distribution.probs.cpu().numpy()
        out = {}
        for i, cid in enumerate(car_ids):
            p = probs[i]
            out[cid] = {
                "recommended_action": ACTION_LABELS[ACTIONS[int(np.argmax(p))]],
                "action_probs": {
                    ACTION_LABELS[a]: float(p[k]) for k, a in enumerate(ACTIONS)
                },
            }
        return out
