"""Team pit-behavior model: P(pit this lap) + next-compound classifier (LightGBM).

Trained from archive race laps. Quality gate per plan: shipped as "ok" only when
it beats the modal-stint-length baseline on a holdout; otherwise the artifact is
marked "fallback" and the MC engine samples heuristic stint-length strategies.
Artifacts: data/models/behavior_pit.txt, behavior_compound.txt, behavior_meta.json.
"""

import json
import logging

import numpy as np
import pandas as pd

from f1_strategy.archive.db import query_df
from f1_strategy.config import get_settings

log = logging.getLogger(__name__)

VERSION = "behavior-v1"
PIT_FEATURES = ["tire_age", "age_vs_typical", "race_frac", "laps_left", "position",
                "stint", "comp_soft", "comp_medium", "comp_hard"]
COMPOUND_CLASSES = ["SOFT", "MEDIUM", "HARD"]
MIN_RACES_FOR_HOLDOUT = 8


def build_pit_training_table(seasons: list[int] | None = None) -> pd.DataFrame:
    """One row per car-lap of every archived race; label = pitted at end of this lap."""
    df = query_df(
        "SELECT l.session_key, l.car_id, l.lap_number, l.stint, l.position, l.compound, "
        "l.tyre_life AS tire_age, (l.pit_in_ms IS NOT NULL)::int AS pitted, s.total_laps "
        "FROM laps l JOIN sessions s USING (session_key) WHERE s.session_type = 'R'"
    )
    if df.empty:
        return df
    if seasons:
        df = df[df["session_key"].str.split("_").str[0].astype(int).isin(seasons)]
    df = df[df["compound"].isin(COMPOUND_CLASSES)].dropna(subset=["lap_number", "tire_age"])
    df["race_frac"] = df["lap_number"] / df["total_laps"].clip(lower=1)
    df["laps_left"] = df["total_laps"] - df["lap_number"]
    # typical stint length per compound across the archive (modal-stint baseline anchor)
    typical = df[df["pitted"] == 1].groupby("compound")["tire_age"].median()
    df["age_vs_typical"] = df["tire_age"] - df["compound"].map(typical).fillna(20.0)
    for c in COMPOUND_CLASSES:
        df[f"comp_{c.lower()}"] = (df["compound"] == c).astype(float)
    # next compound chosen (label for the compound classifier, defined on pit laps)
    df = df.sort_values(["session_key", "car_id", "lap_number"])
    df["next_compound"] = df.groupby(["session_key", "car_id"])["compound"].shift(-1)
    return df.reset_index(drop=True)


def _modal_stint_baseline(df: pd.DataFrame) -> np.ndarray:
    """Naive baseline: P(pit) keyed on tire-age bucket alone (the 'modal stint' rule)."""
    rate = df.groupby(df["tire_age"].clip(0, 40))["pitted"].mean()
    return df["tire_age"].clip(0, 40).map(rate).fillna(rate.mean()).to_numpy()


def fit_behavior_model(seasons: list[int] | None = None) -> dict:
    """Fit + persist both models; returns the metadata dict (incl. quality verdict)."""
    import lightgbm as lgb
    from sklearn.metrics import log_loss, roc_auc_score

    df = build_pit_training_table(seasons)
    if df.empty or df["pitted"].sum() < 20:
        meta = {"version": VERSION, "quality": "fallback", "reason": "insufficient data",
                "n_rows": int(len(df)), "n_pits": int(df["pitted"].sum()) if len(df) else 0}
        _save_meta(meta)
        return meta

    races = sorted(df["session_key"].unique())
    holdout_keys = races[-max(1, len(races) // 5):] if len(races) >= MIN_RACES_FOR_HOLDOUT else []
    train = df[~df["session_key"].isin(holdout_keys)]
    test = df[df["session_key"].isin(holdout_keys)] if holdout_keys else train  # in-sample

    pit_model = lgb.LGBMClassifier(n_estimators=200, num_leaves=15, learning_rate=0.05,
                                   min_child_samples=10, verbose=-1)
    pit_model.fit(train[PIT_FEATURES], train["pitted"])
    p_model = pit_model.predict_proba(test[PIT_FEATURES])[:, 1]
    p_base = _modal_stint_baseline(test)
    auc_model = float(roc_auc_score(test["pitted"], p_model))
    auc_base = float(roc_auc_score(test["pitted"], p_base))
    quality = "ok" if (holdout_keys and auc_model > auc_base) else "fallback"

    pits = train[(train["pitted"] == 1) & train["next_compound"].isin(COMPOUND_CLASSES)]
    comp_model = lgb.LGBMClassifier(n_estimators=100, num_leaves=15, learning_rate=0.05,
                                    min_child_samples=5, verbose=-1)
    comp_model.fit(pits[PIT_FEATURES], pits["next_compound"].map(COMPOUND_CLASSES.index))

    mdir = get_settings().models_dir
    mdir.mkdir(parents=True, exist_ok=True)
    pit_model.booster_.save_model(str(mdir / "behavior_pit.txt"))
    comp_model.booster_.save_model(str(mdir / "behavior_compound.txt"))
    meta = {
        "version": VERSION, "quality": quality,
        "auc_model": auc_model, "auc_baseline": auc_base,
        "log_loss": float(log_loss(test["pitted"], np.clip(p_model, 1e-6, 1 - 1e-6))),
        "holdout": "time-split" if holdout_keys else "in-sample (too few races)",
        "n_rows": int(len(df)), "n_pits": int(df["pitted"].sum()),
        "n_races": len(races), "holdout_races": holdout_keys,
    }
    _save_meta(meta)
    log.info("behavior model: quality=%s auc=%.3f (baseline %.3f)", quality, auc_model, auc_base)
    return meta


def _save_meta(meta: dict) -> None:
    mdir = get_settings().models_dir
    mdir.mkdir(parents=True, exist_ok=True)
    (mdir / "behavior_meta.json").write_text(json.dumps(meta, indent=1))


class BehaviorModel:
    """Inference wrapper; degrades to heuristic sampling when quality=fallback."""

    def __init__(self) -> None:
        import lightgbm as lgb

        mdir = get_settings().models_dir
        meta_path = mdir / "behavior_meta.json"
        self.meta = json.loads(meta_path.read_text()) if meta_path.exists() else {
            "version": VERSION, "quality": "fallback", "reason": "not trained"}
        self.pit = lgb.Booster(model_file=str(mdir / "behavior_pit.txt")) \
            if (mdir / "behavior_pit.txt").exists() else None
        self.compound = lgb.Booster(model_file=str(mdir / "behavior_compound.txt")) \
            if (mdir / "behavior_compound.txt").exists() else None
        # plan gate: model drives MC sampling ONLY when it beat the baseline on holdout;
        # fallback quality keeps artifacts on disk but routes sampling to heuristics
        self.usable = self.meta.get("quality") == "ok" and self.pit is not None

    def pit_probs(self, features: pd.DataFrame) -> np.ndarray:
        if self.pit is None:
            raise RuntimeError("behavior pit model not trained")
        return self.pit.predict(features[PIT_FEATURES])

    def compound_probs(self, features: pd.DataFrame) -> np.ndarray:
        """(n, 3) probs over COMPOUND_CLASSES."""
        if self.compound is None:
            raise RuntimeError("behavior compound model not trained")
        return self.compound.predict(features[PIT_FEATURES])
