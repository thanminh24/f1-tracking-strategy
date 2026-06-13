#!/usr/bin/env python3
"""Explanation CLI for a saved RSRL checkpoint.

Usage examples:
  python explain_rsrl_policy.py checkpoint.pt                 # perturbation importance
  python explain_rsrl_policy.py checkpoint.pt --mode surrogate
  python explain_rsrl_policy.py checkpoint.pt --mode counterfactual --target PIT_SOFT
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from f1_strategy.sim.observation_features import RSRL_FEATURE_NAMES
from f1_strategy.strategy.rsrl_agent.explain import (
    counterfactual_flip,
    fit_surrogate_tree,
    perturbation_importance,
)
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy


def main() -> None:
    parser = argparse.ArgumentParser(prog="explain_rsrl_policy")
    parser.add_argument("checkpoint", type=Path)
    parser.add_argument("--mode", choices=["perturbation", "surrogate", "counterfactual"],
                        default="perturbation")
    parser.add_argument("--sequence-len", type=int, default=8)
    parser.add_argument("--top-n", type=int, default=5)
    parser.add_argument("--target", default="PIT_SOFT",
                        help="Target action for counterfactual mode")
    parser.add_argument("--n-samples", type=int, default=2000,
                        help="Number of random samples for surrogate tree")
    parser.add_argument("--max-depth", type=int, default=5,
                        help="Max depth for surrogate decision tree")
    args = parser.parse_args()

    policy = RSRLPolicy(args.checkpoint)
    if not policy.available:
        print(json.dumps({"error": f"Checkpoint not found or failed to load: {args.checkpoint}"}))
        return

    obs = np.zeros((args.sequence_len, len(RSRL_FEATURE_NAMES)), dtype=np.float32)

    if args.mode == "perturbation":
        rows = [item.to_dict() for item in perturbation_importance(policy, obs, top_n=args.top_n)]
        print(json.dumps(rows, indent=2))

    elif args.mode == "surrogate":
        result = fit_surrogate_tree(policy, sequence_len=args.sequence_len,
                                    n_samples=args.n_samples, max_depth=args.max_depth)
        print(json.dumps(result.to_dict(), indent=2))

    elif args.mode == "counterfactual":
        result = counterfactual_flip(policy, obs, target_action=args.target)
        print(json.dumps(result.to_dict(), indent=2))


if __name__ == "__main__":
    main()
