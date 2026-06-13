"""Console entry point for RSRL perturbation explanations."""

import argparse
import json
from pathlib import Path

import numpy as np

from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES
from f1_strategy.strategy.rsrl_agent.explain import perturbation_importance
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1-explain-rsrl")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--sequence-len", type=int, default=8)
    args = parser.parse_args()
    policy = RSRLPolicy(args.checkpoint)
    obs = np.zeros((args.sequence_len, len(RSRL_FEATURE_NAMES)), dtype=np.float32)
    print(json.dumps([item.to_dict() for item in perturbation_importance(policy, obs)], indent=2))
