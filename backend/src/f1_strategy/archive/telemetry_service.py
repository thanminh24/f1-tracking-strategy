"""On-demand car telemetry via FastF1. First fetch hits network (seconds);
processed traces are cached as parquet under data/telemetry_cache/."""

import logging
import re
from datetime import datetime
from functools import lru_cache

import fastf1
import pandas as pd

from f1_strategy.config import get_settings

log = logging.getLogger(__name__)

# Guards for path traversal: session keys must be "{year}_{round}_{code}"
_SESSION_KEY_RE = re.compile(r"^\d{4}_\d{1,2}_[A-Z0-9]+$")
# Circuit names: letters, digits, spaces, hyphens only
_CIRCUIT_NAME_RE = re.compile(r"^[A-Za-z0-9 _\-]{1,80}$")


def _validate_session_key(session_key: str) -> None:
    if not _SESSION_KEY_RE.match(session_key):
        raise ValueError(f"Invalid session key: {session_key!r}")

API_HZ_COLUMNS = ["t_ms", "distance_m", "speed_kmh", "rpm", "gear", "throttle", "brake", "drs"]


@lru_cache(maxsize=4)  # FastF1 sessions are heavy (~100MB+); keep a tiny LRU
def _load_session(year: int, round_num: int, code: str):
    settings = get_settings()
    settings.ensure_dirs()
    fastf1.Cache.enable_cache(str(settings.fastf1_cache_dir))
    session = fastf1.get_session(year, round_num, code)
    session.load(laps=True, telemetry=True, weather=False, messages=False)
    return session


def _cache_path(session_key: str, car_id: str, lap: int):
    _validate_session_key(session_key)
    d = get_settings().telemetry_cache_dir / session_key
    d.mkdir(parents=True, exist_ok=True)
    return d / f"car_{car_id}_lap_{lap}.parquet"


def get_lap_telemetry(session_key: str, car_id: str, lap: int) -> pd.DataFrame:
    """Speed/throttle/brake/gear trace for one car's lap, ~original sample rate."""
    cpath = _cache_path(session_key, car_id, lap)
    if cpath.exists():
        return pd.read_parquet(cpath)

    year, round_num, code = session_key.split("_")
    session = _load_session(int(year), int(round_num), code)
    lap_row = session.laps.pick_drivers(car_id).pick_laps(lap)
    single = lap_row.iloc[0]

    # Full telemetry merges car + GPS position data.  Some circuits/sessions lack
    # position data — fall back to car data with speed-integrated distance so the
    # endpoint still returns useful data instead of a 404.
    try:
        tel = single.get_telemetry()
        distance_col = tel["Distance"].astype(float)
    except Exception:
        log.warning(
            "pos_data unavailable for %s car %s lap %d — using car_data fallback",
            session_key,
            car_id,
            lap,
        )
        tel = single.get_car_data().add_distance()
        distance_col = tel["Distance"].astype(float)

    df = pd.DataFrame(
        {
            "t_ms": (tel["Time"].dt.total_seconds() * 1000).round().astype("Int64"),
            "distance_m": distance_col,
            "speed_kmh": tel["Speed"].astype(float),
            "rpm": tel["RPM"].astype(float),
            "gear": tel["nGear"].astype("Int64"),
            "throttle": tel["Throttle"].astype(float),
            "brake": tel["Brake"].astype(bool),
            "drs": tel["DRS"].astype("Int64"),
        }
    ).reset_index(drop=True)
    df.to_parquet(cpath, index=False)
    return df


def get_track_outline(session_key: str) -> pd.DataFrame:
    """X/Y path of the fastest lap — decorative track map geometry, cached."""
    _validate_session_key(session_key)
    d = get_settings().telemetry_cache_dir / session_key
    d.mkdir(parents=True, exist_ok=True)
    cpath = d / "track_outline.parquet"
    if cpath.exists():
        return pd.read_parquet(cpath)

    year, round_num, code = session_key.split("_")
    session = _load_session(int(year), int(round_num), code)
    df = _extract_outline_from_session(session)
    df.to_parquet(cpath, index=False)
    return df


def _extract_outline_from_session(session) -> pd.DataFrame:
    """Extract fastest-lap position data from a loaded FastF1 session."""
    fastest = session.laps.pick_fastest()
    pos = fastest.get_pos_data()
    stride = max(1, len(pos) // 800)
    return pd.DataFrame(
        {"x": pos["X"].astype(float), "y": pos["Y"].astype(float)}
    ).iloc[::stride].reset_index(drop=True)


def get_circuit_outline(circuit: str) -> pd.DataFrame:
    """Track outline by circuit short name — circuit-level disk cache.

    Used for live sessions where no local session key exists.
    Searches current year then prior year for a matching FastF1 event.
    """
    if not _CIRCUIT_NAME_RE.match(circuit):
        raise ValueError(f"Invalid circuit name: {circuit!r}")
    safe_name = circuit.replace(" ", "_").replace("/", "_")
    cpath = get_settings().telemetry_cache_dir / f"circuit_{safe_name}" / "track_outline.parquet"
    cpath.parent.mkdir(parents=True, exist_ok=True)
    if cpath.exists():
        return pd.read_parquet(cpath)

    settings = get_settings()
    fastf1.Cache.enable_cache(str(settings.fastf1_cache_dir))

    circuit_lower = circuit.lower()
    year = datetime.now().year

    def _find_round(yr: int) -> int | None:
        schedule = fastf1.get_event_schedule(yr, include_testing=False)
        # FastF1 "Location" matches the circuit short name (e.g. "Catalunya")
        for col in ("Location", "EventName", "OfficialEventName"):
            if col not in schedule.columns:
                continue
            mask = schedule[col].str.lower().str.contains(circuit_lower, na=False)
            if mask.any():
                return int(schedule.loc[mask].iloc[0]["RoundNumber"])
        return None

    # Try multiple (year, session_type) combinations to find one with GPS data.
    # Current-year Race may not exist yet mid-season; prior-year Race is most reliable.
    candidates: list[tuple[int, str]] = []
    for yr in (year, year - 1, year - 2):
        rn = _find_round(yr)
        if rn is not None:
            for code in ("R", "Q", "FP3", "FP2", "FP1"):
                candidates.append((yr, rn, code))

    last_exc: Exception | None = None
    for yr, rn, code in candidates:
        try:
            session = _load_session(yr, rn, code)
            df = _extract_outline_from_session(session)
            df.to_parquet(cpath, index=False)
            log.info("Cached circuit outline for %r (%d R%d %s)", circuit, yr, rn, code)
            return df
        except Exception as exc:
            log.debug("get_circuit_outline: %d R%d %s failed: %s", yr, rn, code, exc)
            last_exc = exc

    raise ValueError(
        f"Circuit {circuit!r}: no session with GPS data in {year}/{year-1}/{year-2}"
    ) from last_exc
