#!/usr/bin/env python3
"""Run a small strategy-agent tournament for one calibrated circuit."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.evaluation.agents import (
    RSRLAgent,
    fixed_one_stop_agent,
    fixed_two_stop_agent,
)
from f1_strategy.strategy.evaluation.tournament import run_tournament
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy


def _auto_find_checkpoint(season: int, circuit: str) -> Path | None:
    """Search data/models for an RSRL checkpoint for this season+circuit."""
    roots = [Path("data/models"), Path("../data/models")]
    patterns = [
        f"rsrl_{season}_{circuit}.pt",
        f"rsrl_{season}_{circuit.lower()}.pt",
        f"rsrl_{season}_*.pt",
    ]
    for root in roots:
        if not root.exists():
            continue
        for pattern in patterns:
            matches = sorted(root.glob(pattern))
            if matches:
                return matches[-1]  # newest
    return None


def main() -> None:
    parser = argparse.ArgumentParser(prog="run_model_tournament")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--circuit", required=True)
    parser.add_argument("--n-sims", type=int, default=20)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--checkpoint", type=Path, default=None,
                        help="RSRL checkpoint path; auto-detected from data/models/ if omitted")
    args = parser.parse_args()
    params = SimParams.load(args.season, args.circuit)

    agents = [fixed_one_stop_agent(params.total_laps), fixed_two_stop_agent(params.total_laps)]

    # Auto-discover RSRL checkpoint and add agent if found
    ckpt = args.checkpoint or _auto_find_checkpoint(args.season, args.circuit)
    if ckpt and ckpt.exists():
        policy = RSRLPolicy(ckpt)
        if policy.available:
            agents.append(RSRLAgent(f"rsrl_{ckpt.stem}", policy))
            import sys; print(f"[tournament] RSRL checkpoint loaded: {ckpt}", file=sys.stderr)
    else:
        import sys; print("[tournament] No RSRL checkpoint found — running fixed agents only", file=sys.stderr)

    result = run_tournament(params, agents, n_sims=args.n_sims)
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text)


if __name__ == "__main__":
    main()
