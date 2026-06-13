"""Console entry point for strategy model tournaments."""

import argparse
import json
from pathlib import Path

from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.evaluation.agents import fixed_one_stop_agent, fixed_two_stop_agent
from f1_strategy.strategy.evaluation.tournament import run_tournament


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1-model-tournament")
    parser.add_argument("--season", type=int, required=True)
    parser.add_argument("--circuit", required=True)
    parser.add_argument("--n-sims", type=int, default=20)
    parser.add_argument("--output", type=Path, default=None)
    args = parser.parse_args()
    params = SimParams.load(args.season, args.circuit)
    result = run_tournament(
        params,
        [fixed_one_stop_agent(params.total_laps), fixed_two_stop_agent(params.total_laps)],
        n_sims=args.n_sims,
    )
    text = json.dumps(result, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text)
