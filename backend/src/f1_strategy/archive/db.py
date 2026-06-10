"""DuckDB read layer over the Parquet lake. Views are recreated per connection —
the lake on disk is the source of truth, nothing is materialized."""

import threading

import duckdb

from f1_strategy.config import get_settings

ENTITIES = ["sessions", "laps", "stints", "pit_stops", "weather", "race_control", "results"]

_local = threading.local()


def get_conn() -> duckdb.DuckDBPyConnection:
    """Thread-local in-memory DuckDB with views over the parquet lake."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = duckdb.connect(":memory:")
        _register_views(conn)
        _local.conn = conn
    return conn


def _register_views(conn: duckdb.DuckDBPyConnection) -> None:
    root = get_settings().parquet_dir
    for entity in ENTITIES:
        pattern = root / entity / "**" / "*.parquet"
        # hive_partitioning exposes year/session_key partition cols; union_by_name
        # tolerates schema drift across seasons
        conn.execute(
            f"CREATE OR REPLACE VIEW {entity} AS "
            f"SELECT * FROM read_parquet('{pattern}', "
            f"hive_partitioning=true, union_by_name=true)"
        )


def refresh_views() -> None:
    """Re-register views (picks up newly ingested partitions on this thread's conn)."""
    conn = getattr(_local, "conn", None)
    if conn is not None:
        _register_views(conn)


def query_df(sql: str, params: list | None = None):
    """Run SQL, return pandas DataFrame. Missing-partition errors surface as-is."""
    return get_conn().execute(sql, params or []).df()
