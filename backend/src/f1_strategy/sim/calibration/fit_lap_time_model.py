"""Fit per-circuit×season lap-time model components from the archive.

Model per clean lap: lap_ms ~ base + compound_offset + slope_c * tire_age + fuel * laps_to_go
Fitted with Huber-weighted IRLS (robust to traffic/error laps that survived filters).
Sample-size floors trigger pooled fallbacks; everything lands in SimParams artifacts.
"""

import logging

import numpy as np
import pandas as pd

from f1_strategy.archive import analytics, queries
from f1_strategy.archive.db import query_df
from f1_strategy.sim.params import DEFAULT_COMPOUNDS, CompoundParams, SimParams

log = logging.getLogger(__name__)

MIN_LAPS_PER_COMPOUND = 40
MIN_LAPS_PER_DRIVER = 15
FUEL_PRIOR_MS_PER_LAP = 60.0  # ~0.06 s/lap fuel-burn gain, F1 typical
HUBER_K = 1.345


def _huber_irls(X: np.ndarray, y: np.ndarray, iters: int = 8) -> np.ndarray:
    """Huber-weighted iteratively reweighted least squares; returns coefficients."""
    w = np.ones(len(y))
    beta = np.zeros(X.shape[1])
    for _ in range(iters):
        Xw = X * w[:, None]
        beta, *_ = np.linalg.lstsq(Xw.T @ X, Xw.T @ y, rcond=None)
        resid = y - X @ beta
        s = np.median(np.abs(resid)) / 0.6745 + 1e-9
        z = np.abs(resid) / (HUBER_K * s)
        w = np.where(z <= 1, 1.0, 1.0 / z)
    return beta


def fit_circuit_season(circuit: str, season: int) -> SimParams | None:
    """Fit all SimParams for one circuit×season. None if no race data."""
    df = analytics.stint_deg_dataset(circuit=circuit)
    df = df[(df["season"] == season) & (~df["in_traffic"])]
    meta = query_df(
        "SELECT total_laps, session_key FROM sessions "
        "WHERE circuit=? AND year=? AND session_type='R'",
        [circuit, season],
    )
    if df.empty or meta.empty or meta["total_laps"].isna().all():
        return None
    total_laps = int(meta["total_laps"].dropna().iloc[0])
    session_keys = meta["session_key"].tolist()

    # --- compound deg + fuel (joint fit on dry compounds present) -----------
    # Reference = modal compound present (MEDIUM may be absent at some races);
    # stored base is re-normalized to MEDIUM-equivalent via prior offsets so
    # artifacts are comparable across circuits.
    dry = df[df["compound"].isin(["SOFT", "MEDIUM", "HARD"])].copy()
    if len(dry) < MIN_LAPS_PER_COMPOUND:  # fully wet race (e.g. 2024 Brazil) — skip
        log.warning("too few dry laps for %s %s (%d)", circuit, season, len(dry))
        return None
    compounds: dict[str, CompoundParams] = {}
    comp_names = [c for c in ["SOFT", "MEDIUM", "HARD"] if (dry["compound"] == c).sum() >= 1]
    ref = dry["compound"].mode().iat[0]
    confidence = "fitted"
    laps_to_go = (total_laps - dry["lap_number"]).to_numpy(dtype=float)
    age = dry["tire_age"].to_numpy(dtype=float)
    y = dry["lap_time_ms"].to_numpy(dtype=float)
    # design: [1, laps_to_go, onehot_c (offsets vs ref), age*onehot per compound]
    X = [np.ones(len(dry)), laps_to_go]
    for c in comp_names:
        if c != ref:
            X.append((dry["compound"] == c).to_numpy(dtype=float))
    for c in comp_names:
        X.append(age * (dry["compound"] == c).to_numpy(dtype=float))
    beta = _huber_irls(np.column_stack(X), y)
    base_ref, fuel_ms = float(beta[0]), float(beta[1])
    if not (10.0 <= fuel_ms <= 200.0):  # implausible fuel coefficient → prior
        fuel_ms = FUEL_PRIOR_MS_PER_LAP
    # MEDIUM-equivalent base: subtract the reference compound's prior offset
    base_ms = base_ref - DEFAULT_COMPOUNDS[ref]["offset_ms"]
    k = 2
    rel_offsets = {ref: 0.0}
    for c in comp_names:
        if c != ref:
            rel_offsets[c] = float(beta[k])
            k += 1
    for c in comp_names:
        n = int((dry["compound"] == c).sum())
        slope = float(beta[k])
        k += 1
        if n < MIN_LAPS_PER_COMPOUND or not (0.0 <= slope <= 400.0):
            slope = DEFAULT_COMPOUNDS[c]["deg_ms_per_lap"]
            confidence = "pooled"
        # absolute pace of c = base_ref + rel_offset = base_ms + stored offset
        offset = rel_offsets[c] + DEFAULT_COMPOUNDS[ref]["offset_ms"]
        if abs(offset - DEFAULT_COMPOUNDS[c]["offset_ms"]) > 3000:
            offset = DEFAULT_COMPOUNDS[c]["offset_ms"]  # implausible → prior
            confidence = "pooled"
        compounds[c] = CompoundParams(offset, slope, n)

    # --- driver offsets vs field median ------------------------------------
    med_field = dry.groupby("lap_number")["lap_time_ms"].median()
    dry = dry.assign(delta=dry["lap_time_ms"] - dry["lap_number"].map(med_field))
    driver_offsets = {
        str(cid): float(g["delta"].median())
        for cid, g in dry.groupby("car_id")
        if len(g) >= MIN_LAPS_PER_DRIVER
    }

    # --- pit loss: (in+out lap) - 2×clean median ----------------------------
    laps_all = pd.concat([queries.get_laps(k) for k in session_keys])
    clean_med = float(dry["lap_time_ms"].median())
    pit_loss = _pit_loss(laps_all, clean_med)

    # --- SC hazard ----------------------------------------------------------
    sc = analytics.sc_history()
    sc_here = sc[(sc["circuit"] == circuit)]
    n_races_all = int(query_df(
        "SELECT count(*) n FROM sessions WHERE circuit=? AND session_type='R'", [circuit]
    )["n"].iloc[0])
    hazard = (
        len(sc_here[sc_here["kind"] == "SC"]) / max(n_races_all, 1) / total_laps
        if n_races_all else 0.005
    )

    noise_sigma = float((dry["lap_time_ms"] - dry["lap_time_ms"].median()).abs().median() * 1.3)
    return SimParams(
        season=season, circuit=circuit, total_laps=total_laps,
        base_lap_ms=base_ms, fuel_ms_per_lap=fuel_ms, pit_loss_ms=pit_loss,
        sc_hazard_per_lap=float(np.clip(hazard, 0.001, 0.05)), sc_lap1_multiplier=8.0,
        sc_pace_factor=1.45, traffic_penalty_ms=350.0, overtake_pace_threshold_ms=600.0,
        noise_sigma_ms=float(np.clip(noise_sigma, 200.0, 1500.0)),
        compounds=compounds, driver_offsets_ms=driver_offsets, confidence=confidence,
    )


def _pit_loss(laps: pd.DataFrame, clean_med_ms: float) -> float:
    stops = []
    for _, g in laps.groupby("car_id"):
        g = g.sort_values("lap_number")
        for _, row in g[g["pit_in_ms"].notna()].iterrows():
            nxt = g[g["lap_number"] == row["lap_number"] + 1]
            if len(nxt) and pd.notna(row["lap_time_ms"]) and pd.notna(nxt["lap_time_ms"].iloc[0]):
                loss = row["lap_time_ms"] + nxt["lap_time_ms"].iloc[0] - 2 * clean_med_ms
                if 5000 < loss < 60000:
                    stops.append(loss)
    return float(np.median(stops)) if stops else 21000.0
