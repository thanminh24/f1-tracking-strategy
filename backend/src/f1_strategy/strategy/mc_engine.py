"""Monte Carlo outcome engine: RaceState → mid-race sim rollouts → outcome probs.

Strategy uncertainty is captured by batching: each batch draws one field-wide
strategy sample (behavior model or heuristic), then runs `rollouts_per_draw`
noisy sim rollouts under it. Outcomes aggregate across every rollout.
"""

import time
from dataclasses import dataclass

import numpy as np

from f1_strategy.models import CarStatus, RaceState
from f1_strategy.sim.params import SimParams
from f1_strategy.sim.race_sim import COMPOUND_IDX, RaceSim
from f1_strategy.sim.strategies import FixedStrategy
from f1_strategy.strategy.behavior_model import BehaviorModel
from f1_strategy.strategy.prediction_schema import OutcomeProbs
from f1_strategy.strategy.strategy_sampler import sample_draw

POINTS_POSITIONS = 10
DEFAULT_DRAWS = 20
DEFAULT_ROLLOUTS_PER_DRAW = 25


@dataclass
class MCResult:
    car_ids: list[str]
    positions: np.ndarray  # (N, C) finishing positions across all rollouts
    pit_lap_samples: dict[str, list[int]]  # car_id → sampled future pit laps (1 per draw max)
    compound_samples: dict[str, list[str]]  # car_id → sampled next compounds
    n_rollouts: int
    n_draws: int  # strategy draws — denominator for MARGINAL pit-window probs
    compute_ms: float

    def outcome(self, car_id: str) -> OutcomeProbs:
        j = self.car_ids.index(car_id)
        pos = self.positions[:, j]
        vals, counts = np.unique(pos, return_counts=True)
        dist = {str(int(v)): float(c / len(pos)) for v, c in zip(vals, counts, strict=True)}
        return OutcomeProbs(
            win=float((pos == 1).mean()),
            podium=float((pos <= 3).mean()),
            points=float((pos <= POINTS_POSITIONS).mean()),
            expected_position=float(pos.mean()),
            position_dist=dist,
        )

    def pit_window(self, car_id: str) -> dict[str, float]:
        """Marginal P(pits on lap L) per draw — sums to P(pits at all), NOT to 1.
        UI thresholds (undercut alerts, gap-chart bands) rely on marginal semantics."""
        samples = self.pit_lap_samples.get(car_id, [])
        if not samples:
            return {}
        vals, counts = np.unique(samples, return_counts=True)
        denom = max(self.n_draws, 1)
        return {str(int(v)): float(c / denom) for v, c in zip(vals, counts, strict=True)}

    def compound_dist(self, car_id: str) -> dict[str, float]:
        samples = self.compound_samples.get(car_id, [])
        if not samples:
            return {}
        vals, counts = np.unique(samples, return_counts=True)
        return {str(v): float(c / len(samples)) for v, c in zip(vals, counts, strict=True)}


def state_to_sim_inputs(state: RaceState) -> tuple[list[dict], np.ndarray]:
    """Active cars as sampler dicts + cumulative-time array (leader = 0)."""
    cars = []
    for c in state.cars:
        if c.status in (CarStatus.OUT, CarStatus.FINISHED):
            continue
        cars.append({
            "car_id": c.car_id,
            "compound": (c.tire.compound if c.tire else "MEDIUM") or "MEDIUM",
            "age": float(c.tire.age_laps if c.tire else 0),
            "position": c.position, "stint": int(c.tire.stint if c.tire else 1),
            "lap": c.lap, "gap_s": c.gap_leader_s or 0.0,
        })
    cum = np.array([c["gap_s"] * 1000.0 for c in cars])
    return cars, cum


def run_mc(
    state: RaceState,
    params: SimParams,
    behavior: BehaviorModel | None = None,
    forced: dict | None = None,  # {"car_id": str, "stops": list[(lap, compound)]}
    n_draws: int = DEFAULT_DRAWS,
    rollouts_per_draw: int = DEFAULT_ROLLOUTS_PER_DRAW,
    seed: int = 0,
) -> MCResult | None:
    """Rollout the remainder of the race. None when too few laps remain to predict."""
    t0 = time.perf_counter()
    lap = state.leader_lap
    total = state.total_laps or params.total_laps
    if total - lap < 2:
        return None
    cars, cum = state_to_sim_inputs(state)
    if len(cars) < 2:
        return None
    car_ids = [c["car_id"] for c in cars]
    init_comp = np.array([COMPOUND_IDX.get(c["compound"], 1) for c in cars])
    init_age = np.array([c["age"] for c in cars])
    grid = {c["car_id"]: c["position"] for c in cars}

    rng = np.random.default_rng(seed)
    all_pos = []
    pit_samples: dict[str, list[int]] = {cid: [] for cid in car_ids}
    comp_samples: dict[str, list[str]] = {cid: [] for cid in car_ids}
    for _ in range(n_draws):
        draw = sample_draw(cars, lap, total, behavior, rng)
        if forced is not None:
            focal_comp = next(c["compound"] for c in cars if c["car_id"] == forced["car_id"])
            draw[forced["car_id"]] = FixedStrategy(focal_comp, forced["stops"])
        for cid, strat in draw.items():
            if forced is not None and cid == forced["car_id"]:
                continue
            if strat.stops:
                pit_samples[cid].append(strat.stops[0][0])
                comp_samples[cid].append(strat.stops[0][1])
        sim = RaceSim(
            params, car_ids, grid, draw,
            n_rollouts=rollouts_per_draw, seed=int(rng.integers(2**31)),
            start_lap=lap, init_cum_ms=cum, init_compound=init_comp, init_age=init_age,
        )
        all_pos.append(sim.run().positions)

    return MCResult(
        car_ids=car_ids,
        positions=np.concatenate(all_pos, axis=0),
        pit_lap_samples=pit_samples,
        compound_samples=comp_samples,
        n_rollouts=n_draws * rollouts_per_draw,
        n_draws=n_draws,
        compute_ms=(time.perf_counter() - t0) * 1000,
    )
