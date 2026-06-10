"""Typed archive queries. DataFrame returns for internal consumers;
API layer converts to Pydantic at the boundary."""

from pathlib import Path

import pandas as pd

from f1_strategy.archive.db import query_df
from f1_strategy.config import get_settings
from f1_strategy.ingestion.pipeline import ingest_session
from f1_strategy.models.session_meta import (
    canonical_session_key,
    make_session_key,
    parse_session_key,
)


def _entity_partition(entity: str, session_key: str) -> Path:
    canonical = canonical_session_key(session_key)
    year, _, _ = parse_session_key(canonical)
    return get_settings().parquet_dir / entity / f"year={year}" / f"session_key={canonical}"


def session_has_laps(session_key: str) -> bool:
    """Fast file-system check used before DuckDB views are queried."""
    return (_entity_partition("laps", session_key) / "data.parquet").exists()


def ensure_session(session_key: str, force: bool = False) -> dict:
    """Ensure a session exists in the local Parquet lake, ingesting it on demand if needed."""
    year, round_num, session = parse_session_key(session_key)
    canonical = make_session_key(year, round_num, session)
    if not force and session_has_laps(canonical):
        return {"session_key": canonical, "status": "available", "source": "archive"}

    result = ingest_session(year, round_num, session, force=force)
    if result["status"] == "ok":
        return {"session_key": canonical, "status": "available", "source": "fastf1"}
    if result["status"] == "skipped" and session_has_laps(canonical):
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
        "SELECT * FROM laps WHERE session_key = ? ORDER BY car_id, lap_number", [session_key]
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
