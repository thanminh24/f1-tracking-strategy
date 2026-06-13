import numpy as np

from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES
from f1_strategy.strategy.rsrl_agent.explain import perturbation_importance
from f1_strategy.strategy.rsrl_agent.model import DRQN
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy


def test_perturbation_importance_returns_ranked_groups(tmp_path):
    import torch

    path = tmp_path / "rsrl.pt"
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
    obs = np.ones((3, len(RSRL_FEATURE_NAMES)), dtype=np.float32)
    rows = perturbation_importance(policy, obs, top_n=3)
    assert len(rows) == 3
    assert all(row.action in {"STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"} for row in rows)
