"""Cross-session analytics datasets consumed by simulator calibration (phase 6).

Clean-lap rules (quality here decides calibration quality downstream):
- race sessions only, timed + accurate laps, not deleted
- green-flag only (FastF1 track_status '1')
- exclude in-laps / out-laps
- traffic flag: gap to car ahead < 1.5s at lap start (kept as a column, filterable)
"""

import pandas as pd

from f1_strategy.archive.db import query_df

# Lap-start gap below which a lap is considered traffic-affected (dirty air / DRS train).
TRAFFIC_GAP_MS = 1500


def stint_deg_dataset(circuit: str | None = None) -> pd.DataFrame:
    """Clean racing laps with tire age + fuel proxy, for deg-curve fitting."""
    sql = """
        WITH race_laps AS (
            SELECT l.*, s.circuit, s.year AS season, s.total_laps
            FROM laps l
            JOIN sessions s USING (session_key)
            WHERE s.session_type = 'R'
        ),
        gapped AS (
            SELECT *,
                lap_start_ms - lag(lap_start_ms) OVER (
                    PARTITION BY session_key, lap_number ORDER BY position
                ) AS gap_ahead_ms
            FROM race_laps
        )
        SELECT session_key, season, circuit, car_id, team, compound,
               tyre_life AS tire_age, lap_number,
               lap_number::DOUBLE / nullif(total_laps, 0) AS race_frac,
               lap_time_ms,
               coalesce(gap_ahead_ms < ?, false) AS in_traffic
        FROM gapped
        WHERE lap_time_ms IS NOT NULL
          AND is_accurate
          AND NOT coalesce(deleted, false)
          AND track_status = '1'
          AND pit_in_ms IS NULL AND pit_out_ms IS NULL
          AND compound NOT IN ('NAN', 'UNKNOWN', 'NONE')
    """
    params: list = [TRAFFIC_GAP_MS]
    if circuit:
        sql += " AND circuit = ?"
        params.append(circuit)
    return query_df(sql, params)


def pit_loss_per_track() -> pd.DataFrame:
    """Median total pit time (in-lap pit entry → out-lap pit exit) per circuit×season."""
    return query_df(
        """
        SELECT s.circuit, s.year AS season,
               median(p.total_pit_ms) AS median_pit_ms,
               count(*) AS n_stops
        FROM pit_stops p
        JOIN sessions s USING (session_key)
        WHERE s.session_type = 'R' AND p.total_pit_ms IS NOT NULL
          AND p.total_pit_ms BETWEEN 10000 AND 60000  -- drop red-flag / damage outliers
        GROUP BY s.circuit, s.year
        ORDER BY s.circuit, s.year
        """
    )


def sc_history() -> pd.DataFrame:
    """SC/VSC deployments per race session, with deploy lap — for hazard fitting."""
    return query_df(
        """
        SELECT rc.session_key, s.circuit, s.year AS season, s.total_laps,
               rc.lap AS deploy_lap, rc.message,
               CASE WHEN rc.message ILIKE '%VIRTUAL%' THEN 'VSC' ELSE 'SC' END AS kind
        FROM race_control rc
        JOIN sessions s USING (session_key)
        WHERE s.session_type = 'R'
          AND rc.category = 'SafetyCar'
          AND rc.message ILIKE '%DEPLOYED%'
        ORDER BY rc.session_key, deploy_lap
        """
    )
