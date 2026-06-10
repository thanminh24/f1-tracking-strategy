"""Extract normalized lap rows from a loaded FastF1 session."""

import pandas as pd

from f1_strategy.ingestion.extractors.common import nullable_bool, nullable_int, td_to_ms


def extract_laps(session, session_key: str) -> pd.DataFrame:
    laps = session.laps
    if laps is None or len(laps) == 0:
        return pd.DataFrame()
    df = pd.DataFrame(
        {
            "session_key": session_key,
            "car_id": laps["DriverNumber"].astype(str),
            "driver_code": laps["Driver"].astype(str),
            "team": laps["Team"].astype(str),
            "lap_number": nullable_int(laps["LapNumber"]),
            "stint": nullable_int(laps["Stint"]),
            "position": nullable_int(laps["Position"]),
            "lap_time_ms": td_to_ms(laps["LapTime"]),
            "sector1_ms": td_to_ms(laps["Sector1Time"]),
            "sector2_ms": td_to_ms(laps["Sector2Time"]),
            "sector3_ms": td_to_ms(laps["Sector3Time"]),
            "compound": laps["Compound"].astype(str).str.upper(),
            "tyre_life": nullable_int(laps["TyreLife"]),
            "fresh_tyre": nullable_bool(laps["FreshTyre"]),
            "lap_start_ms": td_to_ms(laps["LapStartTime"]),
            "pit_in_ms": td_to_ms(laps["PitInTime"]),
            "pit_out_ms": td_to_ms(laps["PitOutTime"]),
            # FastF1 TrackStatus: digit string, may combine codes (e.g. "45" = SC+yellow)
            "track_status": laps["TrackStatus"].astype(str),
            "deleted": nullable_bool(laps["Deleted"]) if "Deleted" in laps.columns else False,
            "is_accurate": nullable_bool(laps["IsAccurate"]),
        }
    )
    return df.reset_index(drop=True)
