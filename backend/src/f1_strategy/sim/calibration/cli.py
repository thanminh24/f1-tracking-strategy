"""CLI entry points for SimParams calibration.

f1-calibrate  — single season/circuit (existing)
f1-batch-calibrate — all seasons in the archive (new)
"""

import argparse
import logging
import sys

from f1_strategy.archive.db import query_df
from f1_strategy.ingestion.scratch_tier import session_in_any_scratch
from f1_strategy.sim.calibration.fit_lap_time_model import fit_circuit_season

log = logging.getLogger(__name__)


def _warn_scratch() -> None:
    if session_in_any_scratch():
        log.warning(
            "scratch tier (data/scratch_parquet) is non-empty: viewer-retrieved "
            "sessions WILL be included in calibration fits. Run `make clean-scratch` "
            "first if models should train on deliberately archived data only."
        )


def calibrate(season: int | None = None, circuit: str | None = None) -> list[str]:
    _warn_scratch()
    sql = "SELECT DISTINCT s.year AS season, circuit FROM sessions s WHERE session_type='R'"
    params: list = []
    if season:
        sql += " AND s.year = ?"
        params.append(season)
    if circuit:
        sql += " AND circuit = ?"
        params.append(circuit)
    targets = query_df(sql, params)
    saved = []
    for _, row in targets.iterrows():
        sp = fit_circuit_season(row["circuit"], int(row["season"]))
        if sp is None:
            log.warning("no data: %s %s", row["season"], row["circuit"])
            continue
        path = sp.save()
        saved.append(str(path))
        log.info("saved %s (confidence=%s)", path, sp.confidence)
    return saved


def batch_calibrate(seasons: list[int], dry_run: bool = False) -> tuple[list[str], list[str]]:
    """Fit SimParams for every (season, circuit) combination in the archive.

    Returns (saved_paths, failed_targets) so callers can inspect results.
    Never raises — per-circuit errors are caught and accumulated.
    """
    _warn_scratch()

    season_filter = ""
    params: list = []
    if seasons:
        placeholders = ", ".join("?" * len(seasons))
        season_filter = f" AND s.year IN ({placeholders})"
        params.extend(seasons)

    targets = query_df(
        f"SELECT DISTINCT s.year AS season, circuit "
        f"FROM sessions s WHERE session_type='R'{season_filter} "
        f"ORDER BY s.year, circuit",
        params,
    )

    if targets.empty:
        log.warning("no race sessions found for seasons=%s", seasons or "all")
        return [], []

    log.info("batch calibration: %d circuit×season targets", len(targets))
    saved: list[str] = []
    failed: list[str] = []

    header = f"{'Circuit':<25} {'Season':>6} {'Status':<12} {'Confidence':<12} {'Note'}"
    print(header)
    print("-" * len(header))

    for _, row in targets.iterrows():
        circuit, season = row["circuit"], int(row["season"])
        tag = f"{season}/{circuit}"
        if dry_run:
            print(f"{circuit:<25} {season:>6} {'DRY-RUN':<12}")
            continue
        try:
            sp = fit_circuit_season(circuit, season)
            if sp is None:
                failed.append(tag)
                print(f"{circuit:<25} {season:>6} {'NO DATA':<12}")
                continue
            path = sp.save()
            saved.append(str(path))
            print(f"{circuit:<25} {season:>6} {'OK':<12} {sp.confidence:<12}")
        except Exception as exc:  # noqa: BLE001
            failed.append(tag)
            log.exception("calibration failed: %s %s", season, circuit)
            print(f"{circuit:<25} {season:>6} {'ERROR':<12} {exc}")

    print()
    print(f"Done: {len(saved)} saved, {len(failed)} failed.")
    return saved, failed


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(prog="f1-calibrate")
    parser.add_argument("--season", type=int)
    parser.add_argument("--circuit")
    args = parser.parse_args()
    saved = calibrate(args.season, args.circuit)
    print(f"calibrated {len(saved)} circuit×season artifacts")


def batch_main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(
        prog="f1-batch-calibrate",
        description="Fit SimParams for all (season, circuit) combinations in the archive.",
    )
    parser.add_argument(
        "--season", type=int, action="append", dest="seasons", metavar="YEAR",
        help="Season year to include (repeatable). Omit for all seasons.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="List targets without fitting.",
    )
    args = parser.parse_args()
    saved, failed = batch_calibrate(seasons=args.seasons or [], dry_run=args.dry_run)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
