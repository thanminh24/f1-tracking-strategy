"""Partitioned Parquet writer: data/parquet/{entity}/year=YYYY/session_key=KEY/data.parquet."""

import shutil
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from f1_strategy.config import get_settings


def partition_dir(entity: str, year: int, session_key: str) -> Path:
    root = get_settings().parquet_dir
    return root / entity / f"year={year}" / f"session_key={session_key}"


def write_entity(
    entity: str, year: int, session_key: str, df: pd.DataFrame, force: bool = False
) -> int:
    """Write one entity partition. Returns rows written (0 = empty frame, partition removed)."""
    pdir = partition_dir(entity, year, session_key)
    if pdir.exists() and force:
        shutil.rmtree(pdir)
    if df is None or df.empty:
        return 0
    pdir.mkdir(parents=True, exist_ok=True)
    pq.write_table(pa.Table.from_pandas(df, preserve_index=False), pdir / "data.parquet")
    return len(df)
