"""Archive browse + telemetry REST endpoints. DataFrames → JSON records at the boundary."""

import logging
import math

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Response

from f1_strategy.archive import queries
from f1_strategy.archive.db import refresh_views
from f1_strategy.archive.telemetry_service import (
    get_circuit_outline,
    get_lap_telemetry,
    get_track_outline,
)

router = APIRouter(prefix="/api", tags=["archive"])
log = logging.getLogger(__name__)


def _jsonable(v):
    """numpy/pandas scalars + arrays + NaN/NaT → plain JSON-safe Python."""
    if isinstance(v, np.ndarray):
        return [_jsonable(x) for x in v.tolist()]
    if isinstance(v, list):
        return [_jsonable(x) for x in v]
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, np.floating):
        v = float(v)
    if isinstance(v, float) and math.isnan(v):
        return None
    if isinstance(v, pd.Timestamp):
        return v.isoformat()
    return v


def _records(df: pd.DataFrame) -> list[dict]:
    return [
        {k: _jsonable(v) for k, v in row.items()}
        for row in df.astype(object).where(df.notna(), None).to_dict(orient="records")
    ]


@router.get("/seasons")
def seasons() -> list[int]:
    return queries.list_seasons()


@router.get("/calendar/{year}")
async def calendar(year: int) -> list[dict]:
    from dataclasses import asdict

    from f1_strategy.feeder.fastf1_calendar_client import get_calendar

    events = await get_calendar(year)
    return [asdict(e) for e in events]


@router.get("/events/{year}")
def events(year: int) -> list[dict]:
    return _records(queries.list_events(year))


@router.get("/sessions/{session_key}/laps")
def laps(session_key: str) -> list[dict]:
    return _records(queries.get_laps(session_key))


@router.post("/sessions/{session_key}/ensure")
def ensure_session(session_key: str, force: bool = False) -> dict:
    """Two-way data path: use archive if present, otherwise fetch this session from FastF1."""
    try:
        result = queries.ensure_session(session_key, force=force)
        refresh_views()
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:
        log.exception("session load failed: %s", session_key)
        raise HTTPException(502, "session load failed") from exc
    if result.get("status") == "available":
        return result
    raise HTTPException(502, result.get("error", f"session unavailable: {session_key}"))


@router.get("/sessions/{session_key}/stints")
def stints(session_key: str) -> list[dict]:
    return _records(queries.get_stints(session_key))


@router.get("/sessions/{session_key}/pits")
def pits(session_key: str) -> list[dict]:
    return _records(queries.get_pit_stops(session_key))


@router.get("/sessions/{session_key}/results")
def results(session_key: str) -> list[dict]:
    return _records(queries.get_results(session_key))


@router.get("/sessions/{session_key}/weather")
def weather(session_key: str) -> list[dict]:
    return _records(queries.get_weather(session_key))


@router.get("/sessions/{session_key}/rc")
def race_control(session_key: str) -> list[dict]:
    return _records(queries.get_race_control(session_key))


@router.get("/sessions/{session_key}/track-outline")
def track_outline(session_key: str, response: Response) -> list[dict]:
    try:
        data = get_track_outline(session_key).to_dict(orient="records")
        # Track outline never changes for a given session — cache aggressively.
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
        return data
    except Exception as exc:
        raise HTTPException(404, f"track outline unavailable: {exc}") from exc


@router.get("/circuits/{circuit}/track-outline")
def circuit_track_outline(circuit: str, response: Response) -> list[dict]:
    try:
        data = get_circuit_outline(circuit).to_dict(orient="records")
        response.headers["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=3600"
        return data
    except Exception as exc:
        raise HTTPException(404, f"circuit outline unavailable: {exc}") from exc


@router.get("/sessions/{session_key}/telemetry/{car_id}/{lap}")
def lap_telemetry(session_key: str, car_id: str, lap: int) -> list[dict]:
    try:
        return _records(get_lap_telemetry(session_key, car_id, lap))
    except Exception as exc:
        raise HTTPException(404, f"telemetry unavailable: {exc}") from exc
