"""Session ingestion pipeline: FastF1 → extractors → partitioned Parquet.

Resumable: a JSON marker per session under data/parquet/.ingest_log/ records
row counts + status; completed sessions are skipped unless force=True.
"""

import json
import logging
import time
from datetime import UTC, datetime

import fastf1
import pandas as pd
from fastf1.exceptions import RateLimitExceededError

from f1_strategy.config import get_settings
from f1_strategy.ingestion.extractors.laps import extract_laps
from f1_strategy.ingestion.extractors.pit_stops import extract_pit_stops
from f1_strategy.ingestion.extractors.session_extras import (
    extract_race_control,
    extract_results,
    extract_weather,
)
from f1_strategy.ingestion.extractors.stints import extract_stints
from f1_strategy.ingestion.parquet_writer import write_entity
from f1_strategy.ingestion.scratch_tier import purge_scratch_session
from f1_strategy.models.session_meta import make_session_key

log = logging.getLogger(__name__)

# FastF1 schedule session names → short codes used in session_key
SESSION_NAME_TO_CODE = {
    "Practice 1": "FP1",
    "Practice 2": "FP2",
    "Practice 3": "FP3",
    "Qualifying": "Q",
    "Sprint Qualifying": "SQ",
    "Sprint Shootout": "SS",
    "Sprint": "S",
    "Race": "R",
}


def _enable_cache() -> None:
    settings = get_settings()
    settings.ensure_dirs()
    fastf1.Cache.enable_cache(str(settings.fastf1_cache_dir))


def _marker_path(session_key: str):
    p = get_settings().parquet_dir / ".ingest_log"
    p.mkdir(parents=True, exist_ok=True)
    return p / f"{session_key}.json"


def is_ingested(session_key: str) -> bool:
    mp = _marker_path(session_key)
    if not mp.exists():
        return False
    return json.loads(mp.read_text()).get("status") == "ok"


def ingest_session(
    year: int, round_num: int, code: str, force: bool = False, dest: str = "archive"
) -> dict:
    """Ingest one session into the archive (default) or the purgeable scratch tier.

    Archive dest writes a resume marker and evicts any scratch copy of the same
    session (the unioned views must never see duplicate rows). Scratch dest writes
    no markers — scratch presence is checked purely on the file system.
    Returns {session_key, status, rows|error}.
    """
    if dest not in ("archive", "scratch"):
        raise ValueError(f"invalid dest: {dest}")
    session_key = make_session_key(year, round_num, code)
    if not force and is_ingested(session_key):
        return {"session_key": session_key, "status": "skipped"}
    _enable_cache()
    root = get_settings().scratch_parquet_dir if dest == "scratch" else None
    try:
        session = fastf1.get_session(year, round_num, code)
        session.load(laps=True, telemetry=False, weather=True, messages=True)

        laps_df = extract_laps(session, session_key)
        entities = {
            "laps": laps_df,
            "stints": extract_stints(laps_df),
            "pit_stops": extract_pit_stops(laps_df),
            "weather": extract_weather(session, session_key),
            "race_control": extract_race_control(session, session_key),
            "results": extract_results(session, session_key),
            "sessions": _session_meta_df(session, session_key, year, round_num, code),
        }
        if dest == "archive":
            # evict the scratch copy BEFORE archive writes: a partial write must
            # never coexist with scratch partitions or the unioned views would
            # return duplicate rows; scratch is re-fetchable on demand
            purge_scratch_session(session_key)
        rows = {
            name: write_entity(name, year, session_key, df, force=force, root=root)
            for name, df in entities.items()
        }
        result = {"session_key": session_key, "status": "ok", "rows": rows}
    except RateLimitExceededError:
        raise  # caller decides to wait+retry; no marker so resume retries it
    except Exception as exc:  # one bad session must not abort a backfill run
        log.exception("ingest failed: %s", session_key)
        result = {"session_key": session_key, "status": "error", "error": str(exc)}
    result["ingested_at"] = datetime.now(UTC).isoformat()
    if dest == "archive":
        _marker_path(session_key).write_text(json.dumps(result, indent=1))
    return result


def _session_meta_df(session, session_key: str, year: int, round_num: int, code: str):
    ev = session.event
    return pd.DataFrame(
        [
            {
                "session_key": session_key,
                "year": year,
                "round": round_num,
                "event_name": str(ev["EventName"]),
                "session_type": code,
                "circuit": str(ev["Location"]),
                "country": str(ev["Country"]),
                "date_utc": pd.to_datetime(session.date),
                "total_laps": int(session.total_laps) if session.total_laps else None,
            }
        ]
    )


def iter_past_sessions(year: int):
    """Yield (round, code) for sessions already run in `year` (skips testing + future)."""
    _enable_cache()
    schedule = fastf1.get_event_schedule(year, include_testing=False)
    now = pd.Timestamp.now(tz="UTC")
    for _, event in schedule.iterrows():
        for i in range(1, 6):
            name = event.get(f"Session{i}")
            date = event.get(f"Session{i}DateUtc")
            if not name or pd.isna(date):
                continue
            if pd.Timestamp(date, tz="UTC") > now:
                continue
            code = SESSION_NAME_TO_CODE.get(str(name))
            if code:
                yield int(event["RoundNumber"]), code


RATE_LIMIT_WAIT_S = 900  # FastF1 hard limit is 500 calls/h; wait 15 min then resume


def _ingest_with_rate_limit_retry(year: int, round_num: int, code: str, force: bool) -> dict:
    while True:
        try:
            return ingest_session(year, round_num, code, force=force)
        except RateLimitExceededError:
            log.warning("FastF1 rate limit hit — sleeping %ss", RATE_LIMIT_WAIT_S)
            time.sleep(RATE_LIMIT_WAIT_S)


def backfill(start_year: int = 2024, force: bool = False) -> list[dict]:
    """Ingest every completed session from start_year through today.
    Resumable; sleeps through FastF1 rate-limit windows instead of dying."""
    results = []
    current_year = datetime.now(UTC).year
    for year in range(start_year, current_year + 1):
        for round_num, code in iter_past_sessions(year):
            res = _ingest_with_rate_limit_retry(year, round_num, code, force)
            log.info("%s: %s", res["session_key"], res["status"])
            results.append(res)
    return results
