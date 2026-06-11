"""CLI: f1-calibrate [--season 2024] [--circuit Sakhir] — fits SimParams artifacts."""

import argparse
import logging

from f1_strategy.archive.db import query_df
from f1_strategy.ingestion.scratch_tier import session_in_any_scratch
from f1_strategy.sim.calibration.fit_lap_time_model import fit_circuit_season

log = logging.getLogger(__name__)


def calibrate(season: int | None = None, circuit: str | None = None) -> list[str]:
    if session_in_any_scratch():
        log.warning(
            "scratch tier (data/scratch_parquet) is non-empty: viewer-retrieved "
            "sessions WILL be included in calibration fits. Run `make clean-scratch` "
            "first if models should train on deliberately archived data only."
        )
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


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    parser = argparse.ArgumentParser(prog="f1-calibrate")
    parser.add_argument("--season", type=int)
    parser.add_argument("--circuit")
    args = parser.parse_args()
    saved = calibrate(args.season, args.circuit)
    print(f"calibrated {len(saved)} circuit×season artifacts")


if __name__ == "__main__":
    main()
