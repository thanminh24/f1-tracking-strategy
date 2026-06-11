"""CLI: f1-train-models [--season 2024] — fits SC hazard + behavior model from archive.

PPO training is separate (f1-train-ppo) since it is per-circuit and slow.
"""

import argparse
import json
import logging

from f1_strategy.strategy.behavior_model import fit_behavior_model
from f1_strategy.strategy.sc_hazard import fit_sc_hazard


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(prog="f1-train-models")
    parser.add_argument("--season", type=int, default=2024)
    args = parser.parse_args()

    sc = fit_sc_hazard(args.season)
    print(f"sc_hazard: mode={sc.mode} deployments={sc.n_deployments}")
    meta = fit_behavior_model()
    print(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
