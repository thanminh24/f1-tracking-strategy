"""DuckDB read layer over the Parquet lake. Views are recreated per connection —
the lake on disk is the source of truth, nothing is materialized.

Views union two tiers: the durable archive (data/parquet) and the purgeable
scratch tier (data/scratch_parquet) holding viewer-retrieved sessions.
"""

import threading

import duckdb

from f1_strategy.config import get_settings

ENTITIES = ["sessions", "laps", "stints", "pit_stops", "weather", "race_control", "results"]

_local = threading.local()
# Bumped by refresh_views(); threads whose connection predates the bump
# re-register lazily so new partitions are visible across the threadpool.
_views_version = 0
_views_lock = threading.Lock()


def get_conn() -> duckdb.DuckDBPyConnection:
    """Thread-local in-memory DuckDB with views over the parquet lake."""
    conn = getattr(_local, "conn", None)
    if conn is None:
        conn = duckdb.connect(":memory:")
        _register_views(conn)
        _local.conn = conn
    elif getattr(_local, "views_version", -1) != _views_version:
        _register_views(conn)
    return conn


def _entity_patterns(entity: str) -> list[str]:
    """Glob per tier, skipping tiers with no files (empty globs error in DuckDB)."""
    settings = get_settings()
    patterns = []
    for root in (settings.parquet_dir, settings.scratch_parquet_dir):
        entity_dir = root / entity
        if entity_dir.exists() and any(entity_dir.rglob("*.parquet")):
            patterns.append(str(entity_dir / "**" / "*.parquet"))
    return patterns


def _register_views(conn: duckdb.DuckDBPyConnection) -> None:
    # Snapshot before scanning the filesystem: a concurrent refresh_views() bump
    # leaves this thread stamped stale, forcing re-registration on next get_conn().
    version = _views_version
    for entity in ENTITIES:
        patterns = _entity_patterns(entity)
        if not patterns:
            # nothing ingested/retrieved for this entity yet — queries surface a
            # missing-view error instead of crashing registration for the rest
            conn.execute(f"DROP VIEW IF EXISTS {entity}")
            continue
        pattern_list = ", ".join(f"'{p}'" for p in patterns)
        # hive_partitioning exposes year/session_key partition cols; union_by_name
        # tolerates schema drift across seasons and tiers
        conn.execute(
            f"CREATE OR REPLACE VIEW {entity} AS "
            f"SELECT * FROM read_parquet([{pattern_list}], "
            f"hive_partitioning=true, union_by_name=true)"
        )
    _local.views_version = version


def refresh_views() -> None:
    """Pick up newly written partitions: re-register on this thread now,
    other threads re-register lazily on their next get_conn()."""
    global _views_version
    with _views_lock:
        _views_version += 1
    conn = getattr(_local, "conn", None)
    if conn is not None:
        _register_views(conn)


def query_df(sql: str, params: list | None = None):
    """Run SQL, return pandas DataFrame. Missing-data errors surface as-is,
    except stale globs (e.g. scratch tier purged by another process), where the
    registered pattern no longer matches any file — re-register and retry once."""
    try:
        return get_conn().execute(sql, params or []).df()
    except duckdb.IOException as exc:
        if "No files found" not in str(exc):
            raise
        refresh_views()
        return get_conn().execute(sql, params or []).df()
