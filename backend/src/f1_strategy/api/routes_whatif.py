"""What-if endpoint: force one car's action at a lap, compare outcome distributions.

POST /api/whatif — baseline MC (behavior-sampled focal strategy) vs forced-action MC
on the same race state; returns both outcome distributions + expected-position delta.
"""

import logging
from functools import lru_cache

from fastapi import APIRouter, HTTPException

from f1_strategy.archive import queries
from f1_strategy.models import CarStatus
from f1_strategy.replay.replay_source import build_timeline
from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.behavior_model import BehaviorModel
from f1_strategy.strategy.mc_engine import run_mc
from f1_strategy.strategy.prediction_schema import PredictionMeta, WhatIfRequest, WhatIfResponse

router = APIRouter(prefix="/api", tags=["strategy"])
log = logging.getLogger(__name__)

ACTION_COMPOUND = {"PIT_SOFT": "SOFT", "PIT_MEDIUM": "MEDIUM", "PIT_HARD": "HARD"}
WHATIF_DRAWS = 12
WHATIF_ROLLOUTS_PER_DRAW = 25


@lru_cache(maxsize=4)
def _timeline(session_key: str):
    return build_timeline(session_key)


def _state_at_lap(session_key: str, lap: int):
    """Race state when the leader starts `lap` (reuses the replay seek logic)."""
    tl = _timeline(session_key)
    for car in sorted(tl.cars, key=lambda c: c.lap_numbers[-1], reverse=True):
        mask = car.lap_numbers == lap
        if mask.any():
            return tl.state_at(float(car.starts[mask.argmax()]))
    raise ValueError(f"lap {lap} not found in {session_key}")


@router.post("/whatif")
def whatif(req: WhatIfRequest) -> WhatIfResponse:
    meta = queries.get_session_meta(req.session_key)
    if meta.empty:
        raise HTTPException(404, f"unknown session: {req.session_key}")
    circuit, season = meta["circuit"].iloc[0], int(meta["year"].iloc[0])
    try:
        params = SimParams.load(season, circuit)
    except FileNotFoundError as exc:
        raise HTTPException(409, f"no calibration artifact for {circuit} {season}") from exc

    try:
        state = _state_at_lap(req.session_key, req.lap)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # archive read failure (corrupt/missing partitions)
        log.exception("what-if state build failed: %s", req.session_key)
        raise HTTPException(502, "session state unavailable") from exc
    if all(c.car_id != req.car_id for c in state.cars):
        raise HTTPException(404, f"unknown car: {req.car_id}")
    # the MC engine simulates only active cars — a retired/finished car has no rollout
    active = {c.car_id for c in state.cars
              if c.status not in (CarStatus.OUT, CarStatus.FINISHED)}
    if req.car_id not in active:
        raise HTTPException(409, f"car {req.car_id} is not running at lap {req.lap}")

    if req.action in ACTION_COMPOUND:
        forced_stops = [(req.lap + 1, ACTION_COMPOUND[req.action])]
    elif req.action == "STAY_N":
        forced_stops = [(min(req.lap + req.stay_laps, (state.total_laps or 99) - 2), "MEDIUM")]
    else:
        raise HTTPException(400, f"unknown action: {req.action}")

    behavior = BehaviorModel()
    kwargs = dict(n_draws=WHATIF_DRAWS, rollouts_per_draw=WHATIF_ROLLOUTS_PER_DRAW, seed=req.lap)
    baseline_mc = run_mc(state, params, behavior=behavior, **kwargs)
    forced_mc = run_mc(state, params, behavior=behavior,
                       forced={"car_id": req.car_id, "stops": forced_stops}, **kwargs)
    if baseline_mc is None or forced_mc is None:
        raise HTTPException(409, "too few laps remaining to simulate")

    baseline, forced = baseline_mc.outcome(req.car_id), forced_mc.outcome(req.car_id)
    return WhatIfResponse(
        session_key=req.session_key, lap=req.lap, car_id=req.car_id, action=req.action,
        baseline=baseline, forced=forced,
        delta_expected_position=round(forced.expected_position - baseline.expected_position, 3),
        meta=PredictionMeta(
            n_rollouts=baseline_mc.n_rollouts,
            model_versions={"behavior": f"{behavior.meta.get('version')}:"
                                        f"{behavior.meta.get('quality')}"},
            compute_ms=round(baseline_mc.compute_ms + forced_mc.compute_ms, 1),
        ),
    )
