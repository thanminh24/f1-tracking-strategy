import numpy as np
from gymnasium.utils.env_checker import check_env

from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES, validate_strategy_action
from f1_strategy.sim.params import CompoundParams, SimParams
from f1_strategy.sim.recurrent_gym_env import RaceStrategyRecurrentEnv


def toy_params(total_laps: int = 50) -> SimParams:
    return SimParams(
        season=2024,
        circuit="Testville",
        total_laps=total_laps,
        base_lap_ms=90000,
        fuel_ms_per_lap=60,
        pit_loss_ms=21000,
        sc_hazard_per_lap=0.004,
        sc_lap1_multiplier=8,
        sc_pace_factor=1.45,
        traffic_penalty_ms=350,
        overtake_pace_threshold_ms=600,
        noise_sigma_ms=400,
        compounds={
            "SOFT": CompoundParams(-400, 90, 100),
            "MEDIUM": CompoundParams(0, 55, 100),
            "HARD": CompoundParams(500, 35, 100),
        },
        driver_offsets_ms={"0": -300, "1": -200, "2": 0, "3": 150},
    )


def test_recurrent_env_api_compliance():
    env = RaceStrategyRecurrentEnv(toy_params(20), n_rivals=5, seed=0, sequence_len=4)
    check_env(env, skip_render_check=True)


def test_recurrent_observation_shape_and_history():
    env = RaceStrategyRecurrentEnv(toy_params(20), n_rivals=5, seed=1, sequence_len=4)
    obs, _ = env.reset(seed=1)
    assert obs.shape == (4, len(RSRL_FEATURE_NAMES))
    assert obs.dtype == np.float32
    assert np.count_nonzero(obs[:-1]) == 0
    obs, _, _, _, _ = env.step(0)
    assert np.count_nonzero(obs[-2:]) > 0


def test_invalid_same_compound_action_is_penalized():
    env = RaceStrategyRecurrentEnv(toy_params(12), n_rivals=3, seed=2, sequence_len=3)
    env.reset(seed=2)
    current_action = int(env._compound[0]) + 1
    _, reward, _, _, info = env.step(current_action)
    assert reward < 1.0
    assert info["invalid_action"] == "same_compound"


def test_terminal_points_reward_penalizes_no_stop_finish():
    env = RaceStrategyRecurrentEnv(toy_params(5), n_rivals=3, seed=3, sequence_len=2)
    env.reset(seed=3)
    done = False
    reward = 0.0
    info = {}
    while not done:
        _, reward, done, _, info = env.step(0)
    assert info["invalid_finish"] == "single_compound"
    assert reward < 0


def test_action_validation_rejects_unavailable_compound():
    result = validate_strategy_action(1, "MEDIUM", {"HARD"})
    assert not result.valid
    assert result.reason == "compound_unavailable"
