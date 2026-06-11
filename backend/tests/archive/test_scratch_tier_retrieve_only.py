"""Scratch tier file-system behavior: tier-targeted writes, purge helpers,
and DuckDB views unioning archive + scratch partitions."""

import pandas as pd
import pytest

from f1_strategy.archive import db
from f1_strategy.archive.queries import session_has_laps, session_in_archive
from f1_strategy.config import get_settings
from f1_strategy.ingestion.parquet_writer import write_entity
from f1_strategy.ingestion.scratch_tier import (
    purge_scratch,
    purge_scratch_session,
    session_in_scratch,
)

ARCHIVED_KEY = "2024_1_R"
SCRATCH_KEY = "2024_2_R"


def _laps_df(session_key: str) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "session_key": [session_key] * 2,
            "car_id": ["1", "16"],
            "lap_number": [1, 1],
            "lap_time_ms": [95000, 95500],
        }
    )


@pytest.fixture
def tmp_data_dir(tmp_path, monkeypatch):
    """Isolated data dir; resets cached settings + this thread's DuckDB conn."""
    monkeypatch.setenv("F1_DATA_DIR", str(tmp_path))
    get_settings.cache_clear()
    db._local.conn = None
    yield tmp_path
    get_settings.cache_clear()
    db._local.conn = None


def test_write_entity_targets_requested_tier(tmp_data_dir):
    scratch = get_settings().scratch_parquet_dir
    rows = write_entity("laps", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=scratch)

    assert rows == 2
    assert (scratch / "laps" / "year=2024" / f"session_key={SCRATCH_KEY}" / "data.parquet").exists()
    assert not (get_settings().parquet_dir / "laps").exists()  # archive untouched
    assert session_in_scratch(SCRATCH_KEY)
    assert not session_in_archive(SCRATCH_KEY)
    assert session_has_laps(SCRATCH_KEY)  # servable via either tier


def test_purge_scratch_session_removes_only_that_session(tmp_data_dir):
    scratch = get_settings().scratch_parquet_dir
    write_entity("laps", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=scratch)
    write_entity("laps", 2024, "2024_3_R", _laps_df("2024_3_R"), root=scratch)

    removed = purge_scratch_session(SCRATCH_KEY)

    assert removed == 1
    assert not session_in_scratch(SCRATCH_KEY)
    assert session_in_scratch("2024_3_R")


def test_purge_scratch_drops_everything_and_recreates_root(tmp_data_dir):
    scratch = get_settings().scratch_parquet_dir
    write_entity("laps", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=scratch)
    write_entity("stints", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=scratch)

    removed = purge_scratch()

    assert removed == 2  # one partition per entity
    assert scratch.exists() and not any(scratch.iterdir())


def test_duckdb_views_union_archive_and_scratch(tmp_data_dir):
    write_entity("laps", 2024, ARCHIVED_KEY, _laps_df(ARCHIVED_KEY))  # archive tier
    write_entity(
        "laps", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=get_settings().scratch_parquet_dir
    )
    db.refresh_views()

    keys = set(db.query_df("SELECT DISTINCT session_key FROM laps")["session_key"])

    assert keys == {ARCHIVED_KEY, SCRATCH_KEY}


def test_query_self_heals_after_external_scratch_purge(tmp_data_dir):
    """A purge from another process (make clean-scratch) leaves registered view
    globs matching zero files; query_df must re-register and retry, not 500."""
    write_entity("laps", 2024, ARCHIVED_KEY, _laps_df(ARCHIVED_KEY))
    write_entity(
        "laps", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=get_settings().scratch_parquet_dir
    )
    db.refresh_views()
    db.query_df("SELECT count(*) FROM laps")  # views now reference both tiers

    purge_scratch()  # simulates external purge: no refresh_views() on this conn

    keys = set(db.query_df("SELECT DISTINCT session_key FROM laps")["session_key"])
    assert keys == {ARCHIVED_KEY}


def test_refresh_views_picks_up_new_scratch_partitions(tmp_data_dir):
    write_entity("laps", 2024, ARCHIVED_KEY, _laps_df(ARCHIVED_KEY))
    db.refresh_views()
    assert set(db.query_df("SELECT DISTINCT session_key FROM laps")["session_key"]) == {
        ARCHIVED_KEY
    }

    # a scratch partition appears later (viewer retrieve) — refresh must expose it
    write_entity(
        "laps", 2024, SCRATCH_KEY, _laps_df(SCRATCH_KEY), root=get_settings().scratch_parquet_dir
    )
    db.refresh_views()

    keys = set(db.query_df("SELECT DISTINCT session_key FROM laps")["session_key"])
    assert keys == {ARCHIVED_KEY, SCRATCH_KEY}
