"""Offline tests for pure-pandas extractors (stints, pit stops) using synthetic laps."""

import pandas as pd

from f1_strategy.ingestion.extractors.pit_stops import extract_pit_stops
from f1_strategy.ingestion.extractors.stints import extract_stints


def synthetic_laps() -> pd.DataFrame:
    """Car 1: 6 laps, pits after lap 3 (stint 1 SOFT → stint 2 HARD)."""
    rows = []
    for lap in range(1, 7):
        stint = 1 if lap <= 3 else 2
        rows.append(
            {
                "session_key": "2024_1_R",
                "car_id": "1",
                "driver_code": "VER",
                "team": "Red Bull Racing",
                "lap_number": lap,
                "stint": stint,
                "position": 1,
                "lap_time_ms": 95000 + lap * 100,
                "compound": "SOFT" if stint == 1 else "HARD",
                "tyre_life": lap if stint == 1 else lap - 3,
                "pit_in_ms": 290000 if lap == 3 else None,
                "pit_out_ms": 312000 if lap == 4 else None,
            }
        )
    df = pd.DataFrame(rows)
    df["pit_in_ms"] = df["pit_in_ms"].astype("Int64")
    df["pit_out_ms"] = df["pit_out_ms"].astype("Int64")
    return df


def test_stints_derived_per_compound():
    stints = extract_stints(synthetic_laps())
    assert len(stints) == 2
    s1 = stints[stints["stint"] == 1].iloc[0]
    assert s1["compound"] == "SOFT"
    assert s1["start_lap"] == 1 and s1["end_lap"] == 3
    # lap 3 is the in-lap → excluded from clean laps
    assert s1["n_clean_laps"] == 2
    s2 = stints[stints["stint"] == 2].iloc[0]
    assert s2["compound"] == "HARD"
    assert s2["n_clean_laps"] == 2  # lap 4 is the out-lap


def test_pit_stop_joined_across_laps():
    stops = extract_pit_stops(synthetic_laps())
    assert len(stops) == 1
    stop = stops.iloc[0]
    assert stop["lap_in"] == 3
    assert stop["total_pit_ms"] == 312000 - 290000
    assert stop["old_compound"] == "SOFT"
    assert stop["new_compound"] == "HARD"


def test_empty_input_yields_empty_frames():
    empty = pd.DataFrame()
    assert extract_stints(empty).empty
    assert extract_pit_stops(empty).empty
