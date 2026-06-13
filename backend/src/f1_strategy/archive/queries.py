"""Typed archive queries. DataFrame returns for internal consumers;
API layer converts to Pydantic at the boundary."""

from pathlib import Path

import pandas as pd

from f1_strategy.archive.db import query_df
from f1_strategy.config import get_settings
from f1_strategy.ingestion.pipeline import ingest_session
from f1_strategy.ingestion.scratch_tier import session_in_scratch
from f1_strategy.models.session_meta import (
    canonical_session_key,
    make_session_key,
    parse_session_key,
)


def _entity_partition(entity: str, session_key: str, root: Path | None = None) -> Path:
    canonical = canonical_session_key(session_key)
    year, _, _ = parse_session_key(canonical)
    root = root if root is not None else get_settings().parquet_dir
    return root / entity / f"year={year}" / f"session_key={canonical}"


def session_in_archive(session_key: str) -> bool:
    """Fast file-system check against the durable archive tier."""
    return (_entity_partition("laps", session_key) / "data.parquet").exists()


def session_has_laps(session_key: str) -> bool:
    """Session is locally servable from either tier (archive or scratch)."""
    return session_in_archive(session_key) or session_in_scratch(
        canonical_session_key(session_key)
    )


def ensure_session(session_key: str, force: bool = False) -> dict:
    """Make a session locally servable WITHOUT growing the archive (retrieve-only).

    Order: archive hit → scratch hit → fetch from FastF1 into the scratch tier.
    The archive grows only via the explicit ingest CLI; `force` re-fetches the
    scratch copy but never overrides an archived session (repairs go through
    `f1-ingest --force`).
    """
    year, round_num, session = parse_session_key(session_key)
    canonical = make_session_key(year, round_num, session)
    if session_in_archive(canonical):
        return {"session_key": canonical, "status": "available", "source": "archive"}
    if not force and session_in_scratch(canonical):
        return {"session_key": canonical, "status": "available", "source": "scratch"}

    result = ingest_session(year, round_num, session, force=force, dest="scratch")
    if result["status"] == "ok":
        return {"session_key": canonical, "status": "available", "source": "fastf1"}
    if result["status"] == "skipped" and session_in_archive(canonical):
        # archive marker exists (ingest CLI completed it) — serve from archive
        return {"session_key": canonical, "status": "available", "source": "archive"}
    return result


def list_seasons() -> list[int]:
    df = query_df("SELECT DISTINCT s.year FROM sessions s ORDER BY year")
    return df["year"].astype(int).tolist()


def list_events(year: int) -> pd.DataFrame:
    return query_df(
        "SELECT round, any_value(event_name) event_name, any_value(circuit) circuit, "
        "any_value(country) country, min(date_utc) first_session_utc, "
        "list(session_type ORDER BY date_utc) session_types "
        "FROM sessions s WHERE s.year = ? GROUP BY round ORDER BY round",
        [year],
    )


def get_session_meta(session_key: str) -> pd.DataFrame:
    return query_df("SELECT * FROM sessions WHERE session_key = ?", [session_key])


def get_laps(session_key: str) -> pd.DataFrame:
    return query_df(
        "SELECT car_id, driver_code, team, lap_number, stint, position, lap_time_ms, "
        "lap_start_ms, sector1_ms AS sector_1_ms, "
        "sector2_ms AS sector_2_ms, sector3_ms AS sector_3_ms, "
        "compound, tyre_life, pit_in_ms, pit_out_ms, track_status "
        "FROM laps WHERE session_key = ? ORDER BY car_id, lap_number",
        [session_key],
    )


def get_stints(session_key: str) -> pd.DataFrame:
    return query_df(
        "SELECT * FROM stints WHERE session_key = ? ORDER BY car_id, stint", [session_key]
    )


def get_pit_stops(session_key: str) -> pd.DataFrame:
    return query_df(
        "SELECT * FROM pit_stops WHERE session_key = ? ORDER BY pit_in_ms", [session_key]
    )


def get_results(session_key: str) -> pd.DataFrame:
    return query_df(
        "SELECT * FROM results WHERE session_key = ? ORDER BY position NULLS LAST", [session_key]
    )


def get_weather(session_key: str) -> pd.DataFrame:
    return query_df("SELECT * FROM weather WHERE session_key = ? ORDER BY t_ms", [session_key])


def get_race_control(session_key: str) -> pd.DataFrame:
    return query_df(
        "SELECT * FROM race_control WHERE session_key = ? ORDER BY time_utc", [session_key]
    )
