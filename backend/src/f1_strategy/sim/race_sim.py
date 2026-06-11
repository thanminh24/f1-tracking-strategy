"""Vectorized lap-level race simulator.

State arrays are (n_rollouts, n_cars) — variable car count, series-agnostic.
Lap model: base + driver offset + compound offset + linear deg + fuel burn
+ traffic penalty + noise; SC hazard process with field bunching; pit stops
cost pit_loss (halved under SC). Deterministic given a seed.
"""

from dataclasses import dataclass

import numpy as np

from f1_strategy.sim.params import SimParams
from f1_strategy.sim.strategies import FixedStrategy, PolicyFn

COMPOUND_IDX = {"SOFT": 0, "MEDIUM": 1, "HARD": 2, "INTERMEDIATE": 3, "WET": 4}
IDX_COMPOUND = {v: k for k, v in COMPOUND_IDX.items()}
TRAFFIC_GAP_MS = 1500.0
GRID_SLOT_MS = 300.0  # cumulative-time stagger per grid slot at lights-out
SC_MIN_LAPS, SC_MAX_LAPS = 3, 6


@dataclass
class SimResult:
    cum_time_ms: np.ndarray  # (R, C) total race time
    positions: np.ndarray  # (R, C) finishing position per car
    lap_times_ms: np.ndarray | None  # (laps, R, C) when recorded
    sc_laps: np.ndarray  # (R, total_laps) bool — SC active that lap


class RaceSim:
    def __init__(
        self,
        params: SimParams,
        car_ids: list[str],
        grid_positions: dict[str, int],
        strategies: dict[str, FixedStrategy],
        n_rollouts: int = 1,
        seed: int = 0,
        noise: bool = True,
        sc_laps_override: list[int] | None = None,  # validation: force real SC laps
        policy: PolicyFn | None = None,
        policy_car: str | None = None,
        record_laps: bool = False,
        start_lap: int = 0,  # mid-race start: laps 1..start_lap already run
        init_cum_ms: np.ndarray | None = None,  # (C,) cumulative time at start_lap
        init_compound: np.ndarray | None = None,  # (C,) COMPOUND_IDX values
        init_age: np.ndarray | None = None,  # (C,) tire age in laps
    ):
        self.p = params
        self.car_ids = car_ids
        self.n_cars = len(car_ids)
        self.n_rollouts = n_rollouts
        self.rng = np.random.default_rng(seed)
        self.noise = noise
        self.strategies = strategies
        self.sc_override = sc_laps_override
        self.policy = policy
        self.policy_idx = car_ids.index(policy_car) if policy_car else None
        self.record_laps = record_laps
        self.start_lap = start_lap
        self.init_cum_ms = init_cum_ms
        self.init_compound = init_compound
        self.init_age = init_age
        self.grid = np.array([grid_positions.get(c, self.n_cars) for c in car_ids], dtype=float)

        # per-car static arrays
        self.driver_offset = np.array(
            [self.p.driver_offsets_ms.get(c, 0.0) for c in car_ids], dtype=float
        )
        self.comp_offset = np.zeros(len(COMPOUND_IDX))
        self.comp_slope = np.zeros(len(COMPOUND_IDX))
        for name, idx in COMPOUND_IDX.items():
            cp = self.p.compound(name)
            self.comp_offset[idx] = cp.offset_ms
            self.comp_slope[idx] = cp.deg_ms_per_lap

    def run(self) -> SimResult:
        R, C, L = self.n_rollouts, self.n_cars, self.p.total_laps
        if self.init_cum_ms is not None:  # mid-race start (MC engine / what-if)
            cum = np.tile(self.init_cum_ms.astype(float), (R, 1))
            compound = np.tile(self.init_compound.astype(int), (R, 1))
            age = np.tile(self.init_age.astype(float), (R, 1))
        else:
            cum = np.tile((self.grid - 1) * GRID_SLOT_MS, (R, 1))
            compound = np.zeros((R, C), dtype=int)
            for j, cid in enumerate(self.car_ids):
                compound[:, j] = COMPOUND_IDX.get(self.strategies[cid].start_compound, 1)
            age = np.zeros((R, C))
        sc_remaining = np.zeros(R, dtype=int)
        sc_laps = np.zeros((R, L), dtype=bool)
        lap_log = np.zeros((L, R, C)) if self.record_laps else None

        for lap in range(self.start_lap + 1, L + 1):
            # --- SC process -------------------------------------------------
            if self.sc_override is not None:
                sc_active = np.full(R, lap in self.sc_override)
            else:
                hazard = self.p.sc_hazard_per_lap * (
                    self.p.sc_lap1_multiplier if lap == 1 else 1.0
                )
                deploy = (sc_remaining == 0) & (self.rng.random(R) < hazard)
                sc_remaining[deploy] = self.rng.integers(SC_MIN_LAPS, SC_MAX_LAPS + 1, deploy.sum())
                sc_active = sc_remaining > 0
                sc_remaining[sc_active] -= 1
            sc_laps[:, lap - 1] = sc_active

            # --- lap time ----------------------------------------------------
            lap_ms = (
                self.p.base_lap_ms
                + self.driver_offset[None, :]
                + self.comp_offset[compound]
                + self.comp_slope[compound] * age
                + self.p.fuel_ms_per_lap * (L - lap)
            )
            if lap == 1:
                lap_ms = lap_ms + self.p.lap1_extra_ms  # standing start + first-lap order
            if self.noise:
                lap_ms = lap_ms + self.rng.normal(0, self.p.noise_sigma_ms, (R, C))
            # traffic: within threshold of car ahead on track → dirty-air penalty
            order = np.argsort(cum, axis=1)
            sorted_cum = np.take_along_axis(cum, order, axis=1)
            gaps = np.diff(sorted_cum, axis=1)
            in_traffic = np.zeros((R, C), dtype=bool)
            np.put_along_axis(in_traffic, order[:, 1:], gaps < TRAFFIC_GAP_MS, axis=1)
            lap_ms += in_traffic * self.p.traffic_penalty_ms
            lap_ms = np.where(sc_active[:, None], lap_ms * self.p.sc_pace_factor, lap_ms)

            # --- pit stops ---------------------------------------------------
            for j, cid in enumerate(self.car_ids):
                if self.policy is not None and j == self.policy_idx:
                    continue  # focal car handled by step() in the gym env
                new_comp = self.strategies[cid].pit_at(lap)
                if new_comp is not None:
                    loss = self.p.pit_loss_ms * np.where(sc_active, 0.55, 1.0)
                    lap_ms[:, j] += loss
                    compound[:, j] = COMPOUND_IDX.get(new_comp, 2)
                    age[:, j] = -1.0  # incremented to 0 below

            # --- no-pass clamp: passing needs clear pace advantage -----------
            new_cum = cum + lap_ms
            srt = np.argsort(cum, axis=1)
            for r in range(R):  # C ~ 20 → cheap inner pass
                prev_t, prev_pace = -np.inf, np.inf
                for j in srt[r]:
                    if new_cum[r, j] < prev_t + 800.0:
                        faster_enough = (
                            prev_pace - lap_ms[r, j] > self.p.overtake_pace_threshold_ms
                        )
                        if sc_active[r] or not faster_enough:
                            new_cum[r, j] = prev_t + 800.0  # held up behind
                    prev_t, prev_pace = new_cum[r, j], lap_ms[r, j]
            # SC bunching: field snaps to a 1s-interval queue behind the leader
            # (order preserved; followers catch up — gaps are neutralized)
            if sc_active.any():
                bunch = np.argsort(new_cum, axis=1)
                base_t = np.take_along_axis(new_cum, bunch[:, :1], axis=1)
                packed = base_t + np.arange(C)[None, :] * 1000.0
                packed_full = np.empty_like(new_cum)
                np.put_along_axis(packed_full, bunch, packed, axis=1)
                new_cum = np.where(sc_active[:, None], packed_full, new_cum)

            cum = new_cum
            age += 1.0
            if lap_log is not None:
                lap_log[lap - 1] = lap_ms

        finish_order = np.argsort(cum, axis=1)
        positions = np.empty((R, C), dtype=int)
        np.put_along_axis(positions, finish_order, np.arange(1, C + 1)[None, :], axis=1)
        return SimResult(cum, positions, lap_log, sc_laps)
