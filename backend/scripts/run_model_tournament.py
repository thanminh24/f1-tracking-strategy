#!/usr/bin/env python3
"""Run a small strategy-agent tournament for one calibrated circuit."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.evaluation.agents import (
    build_benchmark_agents,
)
from f1_strategy.strategy.evaluation.tournament import build_promotion_report, run_tournament
from f1_strategy.strategy.rsrl_agent.train import checkpoint_path, train


def main() -> None:
    parser = argparse.ArgumentParser(prog="run_model_tournament")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--circuit", required=True)
    parser.add_argument("--n-sims", type=int, default=20)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--sequence-len", type=int, default=8)
    parser.add_argument("--output", type=Path, default=None)
    parser.add_argument("--checkpoint", type=Path, default=None,
                        help="RSRL checkpoint path; auto-detected from data/models/ if omitted")
    parser.add_argument("--train-rsrl", action="store_true",
                        help="Train a fresh RSRL checkpoint before tournament")
    parser.add_argument("--timesteps", type=int, default=20_000)
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()
    params = SimParams.load(args.season, args.circuit)

    ckpt = args.checkpoint
    if args.train_rsrl:
        train(
            args.season,
            args.circuit,
            timesteps=args.timesteps,
            seed=args.seed,
            device=args.device,
            sequence_len=args.sequence_len,
        )
        ckpt = checkpoint_path(args.season, args.circuit)

    agents = build_benchmark_agents(
        args.season, args.circuit, params.total_laps, rsrl_checkpoint=ckpt
    )
    result = run_tournament(
        params,
        agents,
        n_sims=args.n_sims,
        seed=args.seed,
        sequence_len=args.sequence_len,
    )
    from f1_strategy.strategy.evaluation.tournament import AgentSummary

    result["promotion"] = build_promotion_report(
        [AgentSummary(**row) for row in result["summaries"]]
    )
    if args.train_rsrl:
        result["training"] = {
            "checkpoint": str(ckpt or checkpoint_path(args.season, args.circuit)),
            "timesteps": args.timesteps,
            "device": args.device,
        }
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text)


if __name__ == "__main__":
    main()
