"""Derive stint summaries from the normalized laps frame (pure pandas — testable offline)."""

import pandas as pd


def extract_stints(laps_df: pd.DataFrame) -> pd.DataFrame:
    if laps_df.empty:
        return pd.DataFrame()
    valid = laps_df.dropna(subset=["stint", "lap_number"])
    rows = []
    for (car_id, stint), g in valid.groupby(["car_id", "stint"], sort=True):
        # Clean laps for pace stats: no pit-in/out, timed
        clean = g[g["pit_in_ms"].isna() & g["pit_out_ms"].isna() & g["lap_time_ms"].notna()]
        rows.append(
            {
                "session_key": g["session_key"].iloc[0],
                "car_id": car_id,
                "stint": int(stint),
                "compound": g["compound"].mode().iat[0] if not g["compound"].empty else None,
                "start_lap": int(g["lap_number"].min()),
                "end_lap": int(g["lap_number"].max()),
                "n_laps": len(g),
                "n_clean_laps": len(clean),
                "avg_clean_lap_ms": (
                    int(clean["lap_time_ms"].mean()) if len(clean) else None
                ),
                "tyre_life_start": (
                    int(g["tyre_life"].min()) if g["tyre_life"].notna().any() else None
                ),
            }
        )
    return pd.DataFrame(rows)
