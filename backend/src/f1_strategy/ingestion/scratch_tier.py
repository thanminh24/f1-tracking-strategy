"""Scratch parquet tier: purgeable storage for viewer-retrieved sessions.

Same {entity}/year=YYYY/session_key=KEY layout as the archive lake, but never
treated as durable — the archive grows only via explicit CLI ingest, and archive
ingest evicts the session's scratch copy before writing so the unioned DuckDB
views never see duplicate rows.
"""

import logging
import shutil

from f1_strategy.config import get_settings

log = logging.getLogger(__name__)


def session_in_scratch(session_key: str) -> bool:
    """Fast file-system check mirroring the archive's laps-partition probe."""
    root = get_settings().scratch_parquet_dir
    return any(root.glob(f"laps/year=*/session_key={session_key}/data.parquet"))


def session_in_any_scratch() -> bool:
    """True when ANY viewer-retrieved session exists — calibration warns on this."""
    root = get_settings().scratch_parquet_dir
    return root.exists() and any(root.glob("*/year=*/session_key=*"))


def purge_scratch_session(session_key: str) -> int:
    """Remove one session's partitions from every entity. Returns dirs removed."""
    root = get_settings().scratch_parquet_dir
    removed = 0
    for pdir in root.glob(f"*/year=*/session_key={session_key}"):
        shutil.rmtree(pdir, ignore_errors=True)
        removed += 1
    if removed:
        log.info("evicted scratch copy of %s (%d partitions)", session_key, removed)
    return removed


def purge_scratch() -> int:
    """Drop the entire scratch tier. Returns session partitions removed."""
    root = get_settings().scratch_parquet_dir
    count = sum(1 for _ in root.glob("*/year=*/session_key=*")) if root.exists() else 0
    if root.exists():
        shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True, exist_ok=True)
    return count
