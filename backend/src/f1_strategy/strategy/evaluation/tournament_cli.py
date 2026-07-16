"""Console entry point for strategy model tournaments."""

import argparse
import json
from pathlib import Path

from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.evaluation.agents import build_benchmark_agents
from f1_strategy.strategy.evaluation.tournament import (
    AgentSummary,
    build_promotion_report,
    run_tournament,
)


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1-model-tournament")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--circuit", required=True)
    parser.add_argument("--n-sims", type=int, default=20)
    parser.add_argument("--sequence-len", type=int, default=8)
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    params = SimParams.load(args.season, args.circuit)
    result = run_tournament(
        params,
        build_benchmark_agents(args.season, args.circuit, params.total_laps),
        n_sims=args.n_sims,
        seed=args.seed,
        sequence_len=args.sequence_len,
    )
    result["promotion"] = build_promotion_report(
        [AgentSummary(**row) for row in result["summaries"]]
    )
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text)
