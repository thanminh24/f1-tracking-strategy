"""Typed archive queries. DataFrame returns for internal consumers;
API layer converts to Pydantic at the boundary."""

import pandas as pd

from f1_strategy.archive.db import query_df


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
