"""Validation gate: replay real races through the sim with actual strategies/grid/SC laps.

Metrics per race (deterministic sim, noise off):
  (a) per-driver total race time error vs archive
  (b) per-lap RMSE (sim lap times vs real clean laps)
  (c) Spearman rank correlation of finishing order (classified finishers)
Gate: median |race-time error| ≤ 15s AND lap RMSE ≤ 0.8s AND Spearman ≥ 0.85.
"""

import logging
from dataclasses import dataclass

import numpy as np
import pandas as pd
from scipy.stats import spearmanr

from f1_strategy.archive import queries
from f1_strategy.sim.params import SimParams
from f1_strategy.sim.race_sim import RaceSim
from f1_strategy.sim.strategies import FixedStrategy

log = logging.getLogger(__name__)

GATE_RACE_TIME_S = 15.0
GATE_LAP_RMSE_S = 0.8
GATE_SPEARMAN = 0.85


@dataclass
class RaceValidation:
    session_key: str
    circuit: str
    season: int
    median_abs_race_time_err_s: float
    lap_rmse_s: float
    spearman: float
    n_finishers: int


def real_strategies(session_key: str) -> tuple[dict[str, FixedStrategy], dict[str, int]]:
    """Actual stint sequences + grid from the archive."""
    stints = queries.get_stints(session_key)
    results = queries.get_results(session_key)
    strategies = {}
    for car_id, g in stints.groupby("car_id"):
        g = g.sort_values("stint")
        stops = [
            (int(prev["end_lap"]), str(cur["compound"]))
            for (_, prev), (_, cur) in zip(g.iterrows(), g.iloc[1:].iterrows(), strict=False)
        ]
        strategies[str(car_id)] = FixedStrategy(str(g.iloc[0]["compound"]), stops)
    grid = {
        str(r["car_id"]): int(r["grid_position"]) if r["grid_position"] else 20
        for _, r in results.iterrows()
    }
    return strategies, grid


def real_sc_laps(session_key: str) -> list[int]:
    laps = queries.get_laps(session_key)
    sc = laps[laps["track_status"].astype(str).str.contains("4|6", regex=True)]
    return sorted(sc["lap_number"].dropna().astype(int).unique().tolist())


def validate_race(session_key: str) -> RaceValidation | None:
    meta = queries.get_session_meta(session_key)
    if meta.empty:
        return None
    circuit, season = meta["circuit"].iloc[0], int(meta["year"].iloc[0])
    try:
        params = SimParams.load(season, circuit)
    except FileNotFoundError:
        log.warning("no calibration for %s %s", season, circuit)
        return None

    strategies, grid = real_strategies(session_key)
    results = queries.get_results(session_key)
    finished = results[results["status"] == "Finished"]
    car_ids = [c for c in strategies if c in set(finished["car_id"].astype(str))]
    if len(car_ids) < 8:
        return None  # too attrition-heavy to judge the lap model

    sim = RaceSim(
        params, car_ids, grid, {c: strategies[c] for c in car_ids},
        n_rollouts=1, noise=False, sc_laps_override=real_sc_laps(session_key),
        record_laps=True,
    )
    res = sim.run()

    laps = queries.get_laps(session_key)
    real_total = laps.groupby("car_id")["lap_time_ms"].sum()
    errs, rmses = [], []
    for j, cid in enumerate(car_ids):
        if cid in real_total.index:
            errs.append(abs(res.cum_time_ms[0, j] - real_total[cid]) / 1000)
        real_car = laps[laps["car_id"] == cid].sort_values("lap_number")
        rl = real_car["lap_time_ms"].to_numpy(dtype=float)[: params.total_laps]
        sl = res.lap_times_ms[: len(rl), 0, j]
        ok = ~np.isnan(rl)
        if ok.sum() > 10:
            rmses.append(np.sqrt(np.mean((rl[ok] - sl[ok]) ** 2)) / 1000)

    real_pos = {str(r["car_id"]): int(r["position"]) for _, r in finished.iterrows()}
    sim_pos = [int(res.positions[0, j]) for j in range(len(car_ids))]
    rho = spearmanr([real_pos[c] for c in car_ids], sim_pos).statistic

    return RaceValidation(
        session_key, circuit, season,
        float(np.median(errs)), float(np.median(rmses)), float(rho), len(car_ids),
    )


def run_gate(session_keys: list[str]) -> tuple[bool, pd.DataFrame]:
    rows = [v for k in session_keys if (v := validate_race(k)) is not None]
    df = pd.DataFrame([vars(v) for v in rows])
    if df.empty:
        return False, df
    passed = (
        df["median_abs_race_time_err_s"].median() <= GATE_RACE_TIME_S
        and df["lap_rmse_s"].median() <= GATE_LAP_RMSE_S
        and df["spearman"].median() >= GATE_SPEARMAN
    )
    return bool(passed), df
