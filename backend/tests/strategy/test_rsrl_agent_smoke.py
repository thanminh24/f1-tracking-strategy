import numpy as np

from f1_strategy.models import CarState, RaceState, TireState
from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES
from f1_strategy.sim.params import CompoundParams, SimParams
from f1_strategy.strategy.rsrl_agent.model import DRQN
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy
from f1_strategy.strategy.rsrl_agent.replay_buffer import SequenceReplayBuffer
from f1_strategy.strategy.rsrl_agent.train import evaluate_on_params, train_on_params


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


def test_drqn_forward_shape():
    import torch

    model = DRQN(feature_dim=len(RSRL_FEATURE_NAMES), hidden_dim=16)
    q, hidden = model(torch.zeros((2, 4, len(RSRL_FEATURE_NAMES))))
    assert q.shape == (2, 4, 4)
    assert hidden.shape[-1] == 16


def test_sequence_replay_buffer_sample_shapes():
    buf = SequenceReplayBuffer(capacity=4, seed=0)
    obs = np.zeros((3, len(RSRL_FEATURE_NAMES)), dtype=np.float32)
    next_obs = np.ones_like(obs)
    buf.add(obs, 1, 2.0, next_obs, False)
    batch = buf.sample(2)
    assert batch.obs.shape == (2, 3, len(RSRL_FEATURE_NAMES))
    assert batch.actions.tolist() == [1, 1]


def test_rsrl_training_smoke_runs():
    params = toy_params(8)
    model = train_on_params(params, timesteps=40, seed=0, sequence_len=3)
    metrics = evaluate_on_params(params, model, n_sims=2, seed=10, sequence_len=3)
    assert 1 <= metrics["rsrl_mean_position"] <= 20


def test_rsrl_policy_missing_checkpoint_degrades(tmp_path):
    policy = RSRLPolicy(tmp_path / "missing.pt")
    assert not policy.available
    assert policy.q_values(np.zeros((3, len(RSRL_FEATURE_NAMES)), dtype=np.float32)).shape == (4,)


def test_rsrl_policy_recommends_from_race_state(tmp_path):
    import torch

    path = tmp_path / "rsrl_2024_Testville.pt"
    model = DRQN(feature_dim=len(RSRL_FEATURE_NAMES), hidden_dim=16)
    torch.save(
        {
            "state_dict": model.state_dict(),
            "feature_dim": len(RSRL_FEATURE_NAMES),
            "action_dim": 4,
            "hidden_dim": 16,
            "sequence_len": 3,
        },
        path,
    )
    policy = RSRLPolicy(path)
    state = RaceState(
        session_key="test",
        t_session_s=0,
        leader_lap=3,
        total_laps=8,
        cars=[
            CarState(
                car_id="44",
                position=1,
                lap=3,
                gap_leader_s=0,
                interval_s=0,
                tire=TireState(compound="MEDIUM", age_laps=3, stint=1),
            ),
            CarState(
                car_id="1",
                position=2,
                lap=3,
                gap_leader_s=1.2,
                interval_s=1.2,
                tire=TireState(compound="HARD", age_laps=4, stint=1),
            ),
        ],
    )
    recs = policy.recommend(state, toy_params(8))
    assert set(recs) == {"44", "1"}
    assert recs["44"]["recommended_action"] in {"STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"}
