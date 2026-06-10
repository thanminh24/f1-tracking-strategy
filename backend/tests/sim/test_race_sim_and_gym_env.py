"""Sim unit tests: determinism, deg monotonicity, pit loss, throughput, gym API."""

import time

import numpy as np
import pytest
from gymnasium.utils.env_checker import check_env

from f1_strategy.sim.gym_env import RaceStrategyEnv
from f1_strategy.sim.params import CompoundParams, SimParams
from f1_strategy.sim.race_sim import RaceSim
from f1_strategy.sim.strategies import FixedStrategy, one_stop, two_stop


def toy_params(total_laps: int = 50) -> SimParams:
    return SimParams(
        season=2024, circuit="Testville", total_laps=total_laps,
        base_lap_ms=90000, fuel_ms_per_lap=60, pit_loss_ms=21000,
        sc_hazard_per_lap=0.004, sc_lap1_multiplier=8, sc_pace_factor=1.45,
        traffic_penalty_ms=350, overtake_pace_threshold_ms=600, noise_sigma_ms=400,
        compounds={
            "SOFT": CompoundParams(-400, 90, 100),
            "MEDIUM": CompoundParams(0, 55, 100),
            "HARD": CompoundParams(500, 35, 100),
        },
        driver_offsets_ms={"0": -300, "1": -200, "2": 0, "3": 150},
    )


def make_sim(n_rollouts=8, seed=42, **kw):
    p = toy_params()
    cars = [str(i) for i in range(6)]
    grid = {c: i + 1 for i, c in enumerate(cars)}
    strats = {c: (one_stop(p.total_laps) if i % 2 else two_stop(p.total_laps))
              for i, c in enumerate(cars)}
    return RaceSim(p, cars, grid, strats, n_rollouts=n_rollouts, seed=seed, **kw)


def test_same_seed_identical_rollout():
    a, b = make_sim(seed=7).run(), make_sim(seed=7).run()
    assert np.array_equal(a.cum_time_ms, b.cum_time_ms)
    assert np.array_equal(a.positions, b.positions)


def test_different_seed_differs():
    a, b = make_sim(seed=1).run(), make_sim(seed=2).run()
    assert not np.array_equal(a.cum_time_ms, b.cum_time_ms)


def test_deg_makes_old_tires_slower():
    """No-stop strategy on SOFT must lose to a sane 1-stop, all else equal."""
    p = toy_params()
    cars = ["A", "B"]
    grid = {"A": 1, "B": 2}
    strats = {
        "A": FixedStrategy("SOFT", []),  # never pits — cooked tires
        "B": one_stop(p.total_laps, "MEDIUM", "HARD"),
    }
    res = RaceSim(p, cars, grid, strats, n_rollouts=64, seed=3,
                  sc_laps_override=[]).run()
    # B wins clearly despite pit loss
    assert (res.positions[:, 1] == 1).mean() > 0.9


def test_pit_loss_applied():
    """With zero-deg tires, a stop costs exactly pit_loss (isolated from tire gain)."""
    p = toy_params()
    p.compounds["MEDIUM"] = CompoundParams(0, 0, 100)  # no deg → no benefit to stopping
    cars = ["A", "B"]
    grid = {"A": 1, "B": 21}  # B far behind: clamp/traffic never interferes
    same = FixedStrategy("MEDIUM", [])
    stopper = FixedStrategy("MEDIUM", [(25, "MEDIUM")])
    res = RaceSim(p, cars, grid, {"A": same, "B": stopper}, n_rollouts=1,
                  noise=False, sc_laps_override=[]).run()
    grid_stagger = 20 * 300.0
    diff = res.cum_time_ms[0, 1] - res.cum_time_ms[0, 0] - grid_stagger
    assert abs(diff - p.pit_loss_ms) < 500


def test_sc_override_and_bunching():
    res = make_sim(n_rollouts=4, sc_laps_override=[10, 11, 12]).run()
    assert res.sc_laps[:, 9].all() and res.sc_laps[:, 11].all()
    assert not res.sc_laps[:, 20].any()


def test_throughput_200_rollouts_per_sec():
    sim = make_sim(n_rollouts=400)
    t0 = time.perf_counter()
    sim.run()
    dt = time.perf_counter() - t0
    rps = 400 / dt
    assert rps >= 200, f"only {rps:.0f} rollouts/sec"


def test_gym_env_api_compliance():
    env = RaceStrategyEnv(toy_params(), n_rivals=9, seed=0)
    check_env(env, skip_render_check=True)


def test_gym_episode_runs_to_completion():
    env = RaceStrategyEnv(toy_params(30), n_rivals=5, seed=1)
    obs, _ = env.reset(seed=1)
    total_reward, steps = 0.0, 0
    done = False
    while not done:
        action = 2 if steps == 15 else 0  # one stop onto MEDIUM at lap 15
        obs, r, done, _, info = env.step(action)
        total_reward += r
        steps += 1
    assert steps == 30
    assert 1 <= info["position"] <= 6
    assert obs.shape == (10,)


@pytest.mark.parametrize("n", [1, 3])
def test_variable_car_count_is_supported(n):
    """Series-agnostic: any car count works."""
    p = toy_params(20)
    cars = [str(i) for i in range(n)]
    res = RaceSim(p, cars, {c: i + 1 for i, c in enumerate(cars)},
                  {c: one_stop(20) for c in cars}, n_rollouts=2, seed=0).run()
    assert res.positions.shape == (2, n)
