"""Feature builders shared by PPO, RSRL, and future strategy agents."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass

import numpy as np

from f1_strategy.sim.gym_env import ACTIONS, RaceStrategyEnv

DRY_COMPOUNDS = ("SOFT", "MEDIUM", "HARD")

RSRL_FEATURE_NAMES = [
    "race_frac",
    "position_norm",
    "gap_ahead_norm",
    "gap_behind_norm",
    "gap_leader_norm",
    "tire_age_norm",
    "comp_soft",
    "comp_medium",
    "comp_hard",
    "deg_rate_norm",
    "last_lap_ref",
    "sc_active",
    "soft_available",
    "medium_available",
    "hard_available",
    "valid_finish",
    "pit_stops_norm",
    "track_norm",
]


@dataclass(frozen=True)
class ActionValidity:
    valid: bool
    reason: str | None = None


def action_compound(action: int) -> str | None:
    """Map strategy action index to pit compound; `None` means stay out."""
    if action <= 0:
        return None
    try:
        return ACTIONS[action]
    except IndexError:
        return None


def stable_track_feature(circuit: str) -> float:
    """Stable [0, 1] circuit feature; avoids Python's randomized hash()."""
    digest = hashlib.sha1(circuit.encode("utf-8")).digest()
    return int.from_bytes(digest[:2], "big") / 65535.0


def build_rsrl_env_features(
    env: RaceStrategyEnv,
    used_compounds: set[str],
    pit_stops: int,
    available_compounds: set[str],
) -> np.ndarray:
    """Build one RSRL feature row from a `RaceStrategyEnv` internal state."""
    if env._sim is None:
        return np.zeros(len(RSRL_FEATURE_NAMES), dtype=np.float32)
    j = 0
    order = np.argsort(env._cum)
    rank = int(np.where(order == j)[0][0])
    gap_ahead = (env._cum[j] - env._cum[order[rank - 1]]) / 1000 if rank > 0 else 0.0
    gap_behind = (
        (env._cum[order[rank + 1]] - env._cum[j]) / 1000
        if rank < env.n_cars - 1
        else 0.0
    )
    gap_leader = (env._cum[j] - env._cum[order[0]]) / 1000 if rank > 0 else 0.0
    compound_idx = int(env._compound[j])
    comp_onehot = np.zeros(3, dtype=np.float32)
    if 0 <= compound_idx < 3:
        comp_onehot[compound_idx] = 1.0
    current_compound = DRY_COMPOUNDS[compound_idx] if 0 <= compound_idx < 3 else "MEDIUM"
    slope = env._sim.comp_slope[compound_idx] / 100.0 if compound_idx < 3 else 0.0
    base_lap = max(env.params.base_lap_ms, 1.0)
    last_lap_ref = float(np.clip(env._last_lap_ms / base_lap, 0.0, 2.0))
    valid_finish = float(len(used_compounds | {current_compound}) >= 2 or pit_stops > 0)
    available = {c.upper() for c in available_compounds}

    return np.array(
        [
            env._lap / max(env.params.total_laps, 1),
            rank / max(env.n_cars, 1),
            min(max(gap_ahead, 0.0), 30.0) / 30.0,
            min(max(gap_behind, 0.0), 30.0) / 30.0,
            min(max(gap_leader, 0.0), 90.0) / 90.0,
            min(max(float(env._age[j]), 0.0), 50.0) / 50.0,
            *comp_onehot,
            slope,
            last_lap_ref,
            float(env._sc_remaining > 0),
            float("SOFT" in available),
            float("MEDIUM" in available),
            float("HARD" in available),
            valid_finish,
            min(pit_stops, 5) / 5.0,
            stable_track_feature(env.params.circuit),
        ],
        dtype=np.float32,
    )


def validate_strategy_action(
    action: int,
    current_compound: str,
    available_compounds: set[str],
) -> ActionValidity:
    compound = action_compound(action)
    if compound is None:
        return ActionValidity(valid=True)
    if compound == current_compound:
        return ActionValidity(valid=False, reason="same_compound")
    if compound not in available_compounds:
        return ActionValidity(valid=False, reason="compound_unavailable")
    return ActionValidity(valid=True)
