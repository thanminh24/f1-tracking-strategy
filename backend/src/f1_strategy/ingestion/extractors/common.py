"""Shared normalization helpers for extractors."""

import pandas as pd


def td_to_ms(series: pd.Series) -> pd.Series:
    """Timedelta series → nullable Int64 milliseconds."""
    return (series.dt.total_seconds() * 1000).round().astype("Int64")


def nullable_int(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce").astype("Int64")


def nullable_bool(series: pd.Series) -> pd.Series:
    return series.astype("boolean")
