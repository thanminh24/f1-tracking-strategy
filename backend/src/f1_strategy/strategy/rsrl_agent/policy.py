"""Checkpoint inference wrapper for RSRL challenger models."""

from __future__ import annotations

import time
from pathlib import Path

import numpy as np

from f1_strategy.models import CarStatus, RaceState, TrackStatus
from f1_strategy.sim.observation_features import (
    DRY_COMPOUNDS,
    RSRL_FEATURE_NAMES,
    stable_track_feature,
)
from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.rsrl_agent.model import DRQN

ACTION_LABELS = ["STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"]


class RSRLPolicy:
    """None-safe RSRL checkpoint loader used by shadow inference later."""

    def __init__(self, path: Path, device: str = "cpu"):
        self.path = path
        self.device = device
        self.model: DRQN | None = None
        self.sequence_len = 8
        self.version = path.stem if path.exists() else "none"
        self._history: dict[str, list[np.ndarray]] = {}
        if path.exists():
            self._load()

    @property
    def available(self) -> bool:
        return self.model is not None

    def _load(self) -> None:
        import torch

        raw = torch.load(self.path, map_location=self.device)
        self.sequence_len = int(raw.get("sequence_len", self.sequence_len))
        self.model = DRQN(
            feature_dim=int(raw.get("feature_dim", len(RSRL_FEATURE_NAMES))),
            action_dim=int(raw.get("action_dim", 4)),
            hidden_dim=int(raw.get("hidden_dim", 64)),
        ).to(self.device)
        self.model.load_state_dict(raw["state_dict"])
        self.model.eval()

    def q_values(self, obs_sequence: np.ndarray) -> np.ndarray:
        if self.model is None:
            return np.zeros(4, dtype=np.float32)
        import torch

        with torch.no_grad():
            obs = torch.as_tensor(obs_sequence[None], dtype=torch.float32, device=self.device)
            q, _ = self.model(obs)
            return q[:, -1, :].cpu().numpy()[0]

    def recommend(self, state: RaceState, params: SimParams) -> dict[str, dict]:
        if self.model is None:
            return {}
        out = {}
        start = time.perf_counter()
        cars = [c for c in state.cars if c.status not in (CarStatus.OUT, CarStatus.FINISHED)]
        cars.sort(key=lambda c: c.position)
        for index, car in enumerate(cars):
            gap_behind = cars[index + 1].interval_s if index < len(cars) - 1 else 0.0
            row = _features_from_race_state(car, gap_behind or 0.0, state, params, len(cars))
            hist = [*self._history.get(car.car_id, []), row][-self.sequence_len:]
            self._history[car.car_id] = hist
            if len(hist) < self.sequence_len:
                pad = [np.zeros_like(row) for _ in range(self.sequence_len - len(hist))]
                seq = np.stack([*pad, *hist]).astype(np.float32)
            else:
                seq = np.stack(hist).astype(np.float32)
            q = self.q_values(seq)
            probs = _softmax(q)
            action_idx = int(np.argmax(probs))
            out[car.car_id] = {
                "recommended_action": ACTION_LABELS[action_idx],
                "action_probs": {
                    label: float(probs[i]) for i, label in enumerate(ACTION_LABELS)
                },
            }
        per_car_ms = ((time.perf_counter() - start) * 1000.0) / max(len(out), 1)
        for rec in out.values():
            rec["inference_ms"] = round(per_car_ms, 3)
            rec["version"] = self.version
        return out

    def sequences_for_state(self, state: RaceState, params: SimParams) -> dict[str, np.ndarray]:
        """Return the padded observation sequence (seq_len × n_features) per active car.

        Call after `recommend()` so histories are already updated.
        Used by the explanation layer without re-running inference.
        """
        if self.model is None:
            return {}
        cars = [c for c in state.cars if c.status not in (CarStatus.OUT, CarStatus.FINISHED)]
        seqs: dict[str, np.ndarray] = {}
        for car in cars:
            hist = self._history.get(car.car_id, [])
            if not hist:
                continue
            if len(hist) < self.sequence_len:
                pad = [np.zeros_like(hist[0]) for _ in range(self.sequence_len - len(hist))]
                seq = np.stack([*pad, *hist]).astype(np.float32)
            else:
                seq = np.stack(hist[-self.sequence_len:]).astype(np.float32)
            seqs[car.car_id] = seq
        return seqs


def _features_from_race_state(
    car,
    gap_behind: float,
    state: RaceState,
    params: SimParams,
    n_cars: int,
) -> np.ndarray:
    total = state.total_laps or params.total_laps
    comp = (car.tire.compound if car.tire else "MEDIUM") or "MEDIUM"
    comp = comp.upper()
    comp_onehot = np.zeros(3, dtype=np.float32)
    if comp in DRY_COMPOUNDS:
        comp_onehot[DRY_COMPOUNDS.index(comp)] = 1.0
    slope = params.compound(comp).deg_ms_per_lap / 100.0
    last_ref = (car.last_lap_ms or params.base_lap_ms) / max(params.base_lap_ms, 1.0)
    return np.array(
        [
            car.lap / max(total, 1),
            (car.position - 1) / max(n_cars, 1),
            min(max(car.interval_s or 0.0, 0.0), 30.0) / 30.0,
            min(max(gap_behind, 0.0), 30.0) / 30.0,
            min(max(car.gap_leader_s or 0.0, 0.0), 90.0) / 90.0,
            min(max(float(car.tire.age_laps if car.tire else 0), 0.0), 50.0) / 50.0,
            *comp_onehot,
            slope,
            float(np.clip(last_ref, 0.0, 2.0)),
            float(state.track_status in (TrackStatus.SC, TrackStatus.VSC)),
            1.0,
            1.0,
            1.0,
            float(car.pit_stops > 0),
            min(car.pit_stops, 5) / 5.0,
            stable_track_feature(params.circuit),
        ],
        dtype=np.float32,
    )


def _softmax(values: np.ndarray) -> np.ndarray:
    shifted = values - np.max(values)
    exp = np.exp(shifted)
    return exp / max(float(exp.sum()), 1e-9)
