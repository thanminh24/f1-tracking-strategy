"""Materialize the Parquet lake into data/archive.duckdb for portable analysis."""

import argparse

import duckdb

from f1_strategy.archive.db import ENTITIES
from f1_strategy.config import get_settings


def build_archive_db(force: bool = False) -> dict[str, int]:
    settings = get_settings()
    settings.ensure_dirs()
    if force and settings.duckdb_path.exists():
        settings.duckdb_path.unlink()

    counts: dict[str, int] = {}
    with duckdb.connect(str(settings.duckdb_path)) as conn:
        for entity in ENTITIES:
            pattern = settings.parquet_dir / entity / "**" / "*.parquet"
            conn.execute(f"DROP TABLE IF EXISTS {entity}")
            conn.execute(
                f"CREATE TABLE {entity} AS "
                f"SELECT * FROM read_parquet('{pattern}', "
                f"hive_partitioning=true, union_by_name=true)"
            )
            counts[entity] = int(conn.execute(f"SELECT count(*) FROM {entity}").fetchone()[0])
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(prog="f1-build-archive-db")
    parser.add_argument("--force", action="store_true", help="replace existing archive.duckdb")
    args = parser.parse_args()
    counts = build_archive_db(force=args.force)
    for entity, count in counts.items():
        print(f"{entity}: {count}")


if __name__ == "__main__":
    main()
