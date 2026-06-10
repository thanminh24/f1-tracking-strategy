"""CLI: f1-ingest --year 2024 [--round 1] [--session R] | --backfill [--force]."""

import argparse
import json
import logging
import sys

from f1_strategy.ingestion.pipeline import backfill, ingest_session, iter_past_sessions


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser(prog="f1-ingest", description="FastF1 → Parquet ingestion")
    parser.add_argument("--year", type=int, help="season year")
    parser.add_argument("--round", type=int, dest="round_num", help="round number")
    parser.add_argument("--session", help="session code: FP1 FP2 FP3 Q SQ SS S R")
    parser.add_argument("--backfill", action="store_true", help="ingest 2024 → today")
    parser.add_argument("--force", action="store_true", help="re-ingest even if done")
    args = parser.parse_args()

    if args.backfill:
        results = backfill(force=args.force)
        errors = [r for r in results if r["status"] == "error"]
        print(f"backfill done: {len(results)} sessions, {len(errors)} errors")
        for r in errors:
            print(f"  ERROR {r['session_key']}: {r['error']}")
        sys.exit(1 if errors else 0)

    if not args.year:
        parser.error("--year required unless --backfill")

    if args.round_num and args.session:
        targets = [(args.round_num, args.session)]
    elif args.round_num:
        targets = [(r, c) for r, c in iter_past_sessions(args.year) if r == args.round_num]
    else:
        targets = list(iter_past_sessions(args.year))

    for round_num, code in targets:
        result = ingest_session(args.year, round_num, code, force=args.force)
        print(json.dumps(result))


if __name__ == "__main__":
    main()
