#!/usr/bin/env python3
"""Write the current strategy-model baseline inventory report."""

from __future__ import annotations

import argparse
from pathlib import Path

from f1_strategy.strategy.evaluation import write_baseline_report


def main() -> None:
    parser = argparse.ArgumentParser(prog="model_baseline_report")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="Directory for baseline_inventory.json/.md; defaults to data/model_reports",
    )
    args = parser.parse_args()
    json_path, md_path, report = write_baseline_report(args.output_dir)
    print(f"Wrote {json_path}")
    print(f"Wrote {md_path}")
    print(
        "Coverage: "
        f"{len(report.race_sessions)} races, "
        f"{len(report.calibrations)} calibrations, "
        f"{len(report.ppo_checkpoints)} PPO checkpoints"
    )


if __name__ == "__main__":
    main()
