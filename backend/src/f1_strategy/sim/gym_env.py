"""Gymnasium env: single-agent pit-strategy decisions over RaceSim.

obs (float32): [race_frac, position_norm, gap_ahead_s, gap_behind_s, tire_age_norm,
                compound onehot(3), deg_rate_norm, sc_active] = 10 dims
actions: 0=stay, 1=pit SOFT, 2=pit MEDIUM, 3=pit HARD
reward: per-lap -Δposition shaping + terminal bonus by finish position.
"""

import gymnasium as gym
import numpy as np
from gymnasium import spaces

from f1_strategy.sim.params import SimParams
from f1_strategy.sim.race_sim import COMPOUND_IDX, GRID_SLOT_MS, TRAFFIC_GAP_MS, RaceSim
from f1_strategy.sim.strategies import FixedStrategy, one_stop, two_stop

ACTIONS = ["STAY", "SOFT", "MEDIUM", "HARD"]


class RaceStrategyEnv(gym.Env):
    """Focal car chooses pit actions; rivals follow fixed strategies."""

    metadata = {"render_modes": []}

    def __init__(self, params: SimParams, n_rivals: int = 19, seed: int = 0):
        self.params = params
        self.n_cars = n_rivals + 1
        self.rng = np.random.default_rng(seed)
        self.observation_space = spaces.Box(-10.0, 10.0, shape=(10,), dtype=np.float32)
        self.action_space = spaces.Discrete(len(ACTIONS))
        self._sim: RaceSim | None = None

    # -- internal single-rollout stepping over RaceSim arrays ----------------
    def reset(self, *, seed: int | None = None, options: dict | None = None):
        super().reset(seed=seed)
        if seed is not None:
            self.rng = np.random.default_rng(seed)
        L = self.params.total_laps
        car_ids = [str(i) for i in range(self.n_cars)]
        self.focal = "0"
        grid = {c: i + 1 for i, c in enumerate(self.rng.permutation(car_ids).tolist())}
        rival_strats: dict[str, FixedStrategy] = {}
        for c in car_ids:
            r = self.rng.random()
            rival_strats[c] = one_stop(L) if r < 0.5 else two_stop(L)
        self._sim = RaceSim(
            self.params, car_ids, grid, rival_strats,
            n_rollouts=1, seed=int(self.rng.integers(2**31)),
            policy=lambda lap, view: None, policy_car=self.focal,
        )
        # manual lap-by-lap loop state (mirror of RaceSim.run, single rollout)
        self._lap = 0
        self._cum = np.array([(grid[c] - 1) * GRID_SLOT_MS for c in car_ids])
        self._compound = np.array([COMPOUND_IDX[rival_strats[c].start_compound] for c in car_ids])
        self._age = np.zeros(self.n_cars)
        self._stops = np.zeros(self.n_cars, dtype=int)
        self._sc_remaining = 0
        self._strats = rival_strats
        self._prev_pos = self._position(0)
        return self._obs(), {}

    def _position(self, j: int) -> int:
        return int(np.sum(self._cum < self._cum[j]) + 1)

    def _obs(self) -> np.ndarray:
        j = 0
        order = np.argsort(self._cum)
        rank = int(np.where(order == j)[0][0])
        gap_ahead = (self._cum[j] - self._cum[order[rank - 1]]) / 1000 if rank > 0 else 0.0
        gap_behind = (self._cum[order[rank + 1]] - self._cum[j]) / 1000 \
            if rank < self.n_cars - 1 else 0.0
        comp_onehot = np.zeros(3)
        if self._compound[j] < 3:
            comp_onehot[self._compound[j]] = 1.0
        slope = self._sim.comp_slope[self._compound[j]] / 100.0
        return np.array(
            [
                self._lap / self.params.total_laps,
                rank / self.n_cars,
                min(gap_ahead, 30) / 30,
                min(gap_behind, 30) / 30,
                self._age[j] / 40.0,
                *comp_onehot,
                slope,
                float(self._sc_remaining > 0),
            ],
            dtype=np.float32,
        )

    def step(self, action: int):
        sim, p, j = self._sim, self.params, 0
        self._lap += 1
        lap = self._lap
        # SC process
        if self._sc_remaining == 0 and self.rng.random() < p.sc_hazard_per_lap * (
            p.sc_lap1_multiplier if lap == 1 else 1.0
        ):
            self._sc_remaining = int(self.rng.integers(3, 7))
        sc = self._sc_remaining > 0
        if sc:
            self._sc_remaining -= 1

        lap_ms = (
            p.base_lap_ms
            + sim.driver_offset
            + sim.comp_offset[self._compound]
            + sim.comp_slope[self._compound] * self._age
            + p.fuel_ms_per_lap * (p.total_laps - lap)
            + self.rng.normal(0, p.noise_sigma_ms, self.n_cars)
        )
        order = np.argsort(self._cum)
        gaps = np.diff(self._cum[order])
        in_traffic = np.zeros(self.n_cars, dtype=bool)
        in_traffic[order[1:]] = gaps < TRAFFIC_GAP_MS
        lap_ms += in_traffic * p.traffic_penalty_ms
        if sc:
            lap_ms *= p.sc_pace_factor

        # rival pits
        for k, cid in enumerate(self._strats):
            if k == j:
                continue
            new_comp = self._strats[cid].pit_at(lap)
            if new_comp is not None:
                lap_ms[k] += p.pit_loss_ms * (0.55 if sc else 1.0)
                self._compound[k] = COMPOUND_IDX[new_comp]
                self._age[k] = -1
                self._stops[k] += 1
        # focal action
        if action > 0:
            lap_ms[j] += p.pit_loss_ms * (0.55 if sc else 1.0)
            self._compound[j] = action - 1  # 1→SOFT(0) 2→MEDIUM(1) 3→HARD(2)
            self._age[j] = -1
            self._stops[j] += 1

        self._cum = self._cum + lap_ms
        self._age += 1
        pos = self._position(j)
        reward = float(self._prev_pos - pos)  # gained positions = +
        self._prev_pos = pos
        terminated = lap >= p.total_laps
        if terminated:
            # F1 rule: must use ≥2 compounds; massive penalty teaches the constraint
            if self._stops[j] == 0:
                reward -= 30.0
            reward += (self.n_cars - pos) * 0.5  # terminal bonus
        return self._obs(), reward, terminated, False, {"position": pos}
