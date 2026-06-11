"""MC engine on synthetic mid-race state: probability sanity, determinism, what-if."""

import numpy as np
import pytest

from f1_strategy.models import CarState, RaceState, TireState
from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.mc_engine import run_mc

N_CARS = 6


@pytest.fixture
def params() -> SimParams:
    return SimParams(
        season=2024, circuit="TestTrack", total_laps=30, base_lap_ms=90_000.0,
        fuel_ms_per_lap=60.0, pit_loss_ms=22_000.0, sc_hazard_per_lap=0.005,
        sc_lap1_multiplier=8.0, sc_pace_factor=1.45, traffic_penalty_ms=350.0,
        overtake_pace_threshold_ms=600.0, noise_sigma_ms=300.0,
    )


@pytest.fixture
def state() -> RaceState:
    cars = [
        CarState(
            car_id=str(i + 1), position=i + 1, lap=10,
            gap_leader_s=float(i * 2.5),
            tire=TireState(compound="MEDIUM" if i % 2 else "SOFT", age_laps=8, stint=1),
        )
        for i in range(N_CARS)
    ]
    return RaceState(session_key="2024_1_R", t_session_s=1500.0, leader_lap=10,
                     total_laps=30, cars=cars)


def test_outcome_probabilities_are_coherent(params, state):
    mc = run_mc(state, params, n_draws=8, rollouts_per_draw=10, seed=7)
    assert mc is not None and mc.n_rollouts == 80
    for cid in mc.car_ids:
        o = mc.outcome(cid)
        assert 0 <= o.win <= o.podium <= 1  # win implies podium
        assert 1 <= o.expected_position <= N_CARS
        assert abs(sum(o.position_dist.values()) - 1.0) < 1e-6


def test_leader_more_likely_to_win_than_backmarker(params, state):
    mc = run_mc(state, params, n_draws=10, rollouts_per_draw=20, seed=3)
    assert mc.outcome("1").win > mc.outcome(str(N_CARS)).win


def test_same_seed_same_distribution(params, state):
    a = run_mc(state, params, n_draws=5, rollouts_per_draw=10, seed=11)
    b = run_mc(state, params, n_draws=5, rollouts_per_draw=10, seed=11)
    assert np.array_equal(a.positions, b.positions)


def test_forced_late_pit_changes_focal_outcome(params, state):
    base = run_mc(state, params, n_draws=8, rollouts_per_draw=15, seed=5)
    forced = run_mc(state, params, forced={"car_id": "1", "stops": [(25, "SOFT")]},
                    n_draws=8, rollouts_per_draw=15, seed=5)
    assert not np.array_equal(base.positions, forced.positions)
    assert forced.pit_lap_samples["1"] == []  # forced car excluded from sampled windows


def test_too_few_laps_remaining_returns_none(params, state):
    state.leader_lap = 29
    assert run_mc(state, params) is None


def test_pit_windows_are_future_laps_with_marginal_probs(params, state):
    mc = run_mc(state, params, n_draws=10, rollouts_per_draw=5, seed=2)
    windows = mc.pit_window("2")
    assert windows, "rivals should have sampled pit windows"
    assert all(int(lap) > state.leader_lap for lap in windows)
    assert all(0 < p <= 1 for p in windows.values())
    # marginal semantics: probabilities sum to P(pits at all) ≤ 1, NOT renormalized
    assert sum(windows.values()) <= 1.0 + 1e-9


def test_whatif_rejects_retired_car(params, state):
    # MC active set excludes OUT cars — the API must 409, not 500 (route guard);
    # at engine level a retired car simply isn't in the rollout set
    from f1_strategy.models import CarStatus

    state.cars[3].status = CarStatus.OUT
    mc = run_mc(state, params, n_draws=4, rollouts_per_draw=5, seed=1)
    assert state.cars[3].car_id not in mc.car_ids
