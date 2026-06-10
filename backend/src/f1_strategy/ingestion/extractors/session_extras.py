"""Extractors for weather, race control messages, and results."""

import pandas as pd

from f1_strategy.ingestion.extractors.common import nullable_int, td_to_ms


def extract_weather(session, session_key: str) -> pd.DataFrame:
    w = session.weather_data
    if w is None or len(w) == 0:
        return pd.DataFrame()
    return pd.DataFrame(
        {
            "session_key": session_key,
            "t_ms": td_to_ms(w["Time"]),
            "air_temp_c": w["AirTemp"].astype(float),
            "track_temp_c": w["TrackTemp"].astype(float),
            "humidity_pct": w["Humidity"].astype(float),
            "rainfall": w["Rainfall"].astype(bool),
            "wind_speed_ms": w["WindSpeed"].astype(float),
            "wind_direction_deg": nullable_int(w["WindDirection"]),
        }
    ).reset_index(drop=True)


def extract_race_control(session, session_key: str) -> pd.DataFrame:
    rc = session.race_control_messages
    if rc is None or len(rc) == 0:
        return pd.DataFrame()
    df = pd.DataFrame(
        {
            "session_key": session_key,
            "time_utc": pd.to_datetime(rc["Time"]),
            "lap": nullable_int(rc["Lap"]) if "Lap" in rc.columns else None,
            "category": rc["Category"].astype(str),
            "flag": rc["Flag"].astype(str) if "Flag" in rc.columns else None,
            "scope": rc["Scope"].astype(str) if "Scope" in rc.columns else None,
            "message": rc["Message"].astype(str),
        }
    )
    return df.reset_index(drop=True)


def extract_results(session, session_key: str) -> pd.DataFrame:
    res = session.results
    if res is None or len(res) == 0:
        return pd.DataFrame()
    df = pd.DataFrame(
        {
            "session_key": session_key,
            "car_id": res["DriverNumber"].astype(str),
            "driver_code": res["Abbreviation"].astype(str),
            "full_name": res["FullName"].astype(str) if "FullName" in res.columns else None,
            "team": res["TeamName"].astype(str),
            "grid_position": nullable_int(res["GridPosition"]),
            "position": nullable_int(res["Position"]),
            "classified_position": res["ClassifiedPosition"].astype(str)
            if "ClassifiedPosition" in res.columns
            else None,
            "status": res["Status"].astype(str),
            "points": res["Points"].astype(float),
        }
    )
    return df.reset_index(drop=True)
