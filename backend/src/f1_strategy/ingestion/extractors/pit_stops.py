"""Derive pit stops from the normalized laps frame (pure pandas — testable offline).

A stop = pit_in on lap N joined with pit_out on the same car's next lap.
total_pit_ms includes pit-lane travel; per-track stationary loss is fitted
later in archive analytics, this is the raw observable.
"""

import pandas as pd


def extract_pit_stops(laps_df: pd.DataFrame) -> pd.DataFrame:
    if laps_df.empty:
        return pd.DataFrame()
    rows = []
    for car_id, g in laps_df.dropna(subset=["lap_number"]).groupby("car_id"):
        g = g.sort_values("lap_number")
        in_laps = g[g["pit_in_ms"].notna()]
        for _, lap in in_laps.iterrows():
            nxt = g[g["lap_number"] == lap["lap_number"] + 1]
            has_out = len(nxt) and nxt["pit_out_ms"].notna().any()
            out_ms = nxt["pit_out_ms"].iloc[0] if has_out else None
            new_compound = nxt["compound"].iloc[0] if len(nxt) else None
            rows.append(
                {
                    "session_key": lap["session_key"],
                    "car_id": car_id,
                    "lap_in": int(lap["lap_number"]),
                    "pit_in_ms": int(lap["pit_in_ms"]),
                    "pit_out_ms": int(out_ms) if pd.notna(out_ms) and out_ms is not None else None,
                    "total_pit_ms": (
                        int(out_ms - lap["pit_in_ms"])
                        if pd.notna(out_ms) and out_ms is not None
                        else None
                    ),
                    "old_compound": lap["compound"],
                    "new_compound": new_compound,
                }
            )
    return pd.DataFrame(rows)
