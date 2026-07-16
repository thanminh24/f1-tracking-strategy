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


def _latest_available_model_season(models_dir, season: int, circuit: str) -> int | None:
    """Newest season ≤ requested with a checkpoint for this circuit; else newest
    available (e.g. circuit only trained on a later season than the live race)."""
    seasons: list[int] = []
    for path in models_dir.glob(f"ppo_*_{circuit}.zip"):
        token = path.stem[len("ppo_"):-(len(circuit) + 1)]
        try:
            seasons.append(int(token))
        except ValueError:
            continue
    if not seasons:
        return None
    past_or_current = [s for s in seasons if s <= season]
    return max(past_or_current) if past_or_current else max(seasons)


@lru_cache(maxsize=4)
def _load_model(season: int, circuit: str):
    # Path check BEFORE the SB3/torch import: absent checkpoints must not pay the
    # multi-second torch import. NOTE: a None result is cached — training a new
    # checkpoint requires a server restart to be picked up.
    # Fall back to the latest available season for the same circuit when the
    # exact (season, circuit) zip is absent (e.g. 2026 race served by the 2024
    # model, or a circuit only trained on 2025 such as São Paulo).
    models_dir = get_settings().models_dir
    path = models_dir / f"ppo_{season}_{circuit}.zip"
    artifact_season = season
    if not path.exists():
        fallback_season = _latest_available_model_season(models_dir, season, circuit)
        if fallback_season is None:
            return None
        log.info("PPO: no model for %s %s, falling back to %s", season, circuit, fallback_season)
        path = models_dir / f"ppo_{fallback_season}_{circuit}.zip"
        artifact_season = fallback_season
    from stable_baselines3 import PPO  # deferred heavy import

    return PPO.load(str(path), device="auto"), artifact_season


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
        loaded = _load_model(season, circuit)
        self.model = loaded[0] if loaded else None
        artifact_season = loaded[1] if loaded else season
        self.version = f"ppo_{artifact_season}_{circuit}" if self.model else "none"

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
