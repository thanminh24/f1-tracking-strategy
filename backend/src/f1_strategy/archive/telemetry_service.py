"""On-demand car telemetry via FastF1. First fetch hits network (seconds);
processed traces are cached as parquet under data/telemetry_cache/."""

import logging
from functools import lru_cache

import fastf1
import pandas as pd

from f1_strategy.config import get_settings

log = logging.getLogger(__name__)

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
    tel = lap_row.get_telemetry()
    df = pd.DataFrame(
        {
            "t_ms": (tel["Time"].dt.total_seconds() * 1000).round().astype("Int64"),
            "distance_m": tel["Distance"].astype(float),
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
    d = get_settings().telemetry_cache_dir / session_key
    d.mkdir(parents=True, exist_ok=True)
    cpath = d / "track_outline.parquet"
    if cpath.exists():
        return pd.read_parquet(cpath)

    year, round_num, code = session_key.split("_")
    session = _load_session(int(year), int(round_num), code)
    fastest = session.laps.pick_fastest()
    pos = fastest.get_pos_data()
    # ~4Hz is plenty for an outline; downsample by stride
    stride = max(1, len(pos) // 800)
    df = pd.DataFrame(
        {"x": pos["X"].astype(float), "y": pos["Y"].astype(float)}
    ).iloc[::stride].reset_index(drop=True)
    df.to_parquet(cpath, index=False)
    return df
