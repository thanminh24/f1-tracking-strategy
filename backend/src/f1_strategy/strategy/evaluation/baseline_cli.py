"""Console entry point for baseline inventory reports."""

import argparse
from pathlib import Path

from f1_strategy.strategy.evaluation.baseline import write_baseline_report


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1-model-baseline-report")
    parser.add_argument("--output-dir", type=Path, default=None)
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
