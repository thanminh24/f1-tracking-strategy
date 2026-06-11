"""Safety-car hazard model: per-lap P(SC deploys).

Logistic regression on archive race laps (features: lap-1 flag, race fraction,
wetness) when enough SC deployments exist; otherwise falls back to the
calibrated per-track base hazard ("prior" mode). Artifact:
data/models/sc_hazard_{season}.json — always loadable, never crashes serving.
"""

import json
import logging
from dataclasses import asdict, dataclass, field

import numpy as np

from f1_strategy.archive.db import query_df
from f1_strategy.config import get_settings

log = logging.getLogger(__name__)

MIN_DEPLOYMENTS_TO_FIT = 10  # below this a logistic fit is noise — use prior


@dataclass
class SCHazardModel:
    season: int
    mode: str = "prior"  # prior | fitted
    coefs: list[float] = field(default_factory=list)  # [intercept, lap1, race_frac, wet]
    n_deployments: int = 0
    version: str = "sc-hazard-v1"

    def prob_next_lap(self, lap: int, total_laps: int, base_hazard: float,
                      wet: bool = False) -> float:
        """P(SC deploys next lap). Prior mode scales the calibrated track hazard."""
        if self.mode == "fitted" and self.coefs:
            x = np.array([1.0, float(lap <= 1), lap / max(total_laps, 1), float(wet)])
            return float(1 / (1 + np.exp(-np.dot(self.coefs, x))))
        return float(np.clip(base_hazard * (8.0 if lap <= 1 else 1.0), 0.0, 0.5))

    def prob_within(self, n: int, lap: int, total_laps: int, base_hazard: float,
                    wet: bool = False) -> float:
        """P(at least one SC in the next n laps) — independent-hazard approximation."""
        p_none = 1.0
        for k in range(n):
            p_none *= 1 - self.prob_next_lap(lap + k, total_laps, base_hazard, wet)
        return float(1 - p_none)

    def save(self) -> None:
        path = get_settings().models_dir / f"sc_hazard_{self.season}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=1))

    @classmethod
    def load(cls, season: int) -> "SCHazardModel":
        path = get_settings().models_dir / f"sc_hazard_{season}.json"
        if not path.exists():
            return cls(season=season)  # prior fallback — serving never blocks on training
        return cls(**json.loads(path.read_text()))


def _deployment_table(season: int):
    """Per (session, lap) rows with SC-deploy label (first lap of each SC episode)."""
    df = query_df(
        "SELECT session_key, lap_number, "
        "max(CASE WHEN track_status LIKE '%4%' THEN 1 ELSE 0 END) sc "
        "FROM laps WHERE session_key LIKE ? GROUP BY session_key, lap_number "
        "ORDER BY session_key, lap_number",
        [f"{season}_%_R"],
    )
    if df.empty:
        return df
    # deploy = SC on this lap but not the previous one (episode start)
    df["prev_sc"] = df.groupby("session_key")["sc"].shift(1, fill_value=0)
    df["deploy"] = ((df["sc"] == 1) & (df["prev_sc"] == 0)).astype(int)
    return df[df["prev_sc"] == 0]  # green-lap exposure set


def fit_sc_hazard(season: int) -> SCHazardModel:
    """Fit (or fall back) and save the season hazard model."""
    df = _deployment_table(season)
    n_dep = int(df["deploy"].sum()) if not df.empty else 0
    if n_dep < MIN_DEPLOYMENTS_TO_FIT:
        log.warning("only %d SC deployments in %s archive — using prior mode", n_dep, season)
        model = SCHazardModel(season=season, mode="prior", n_deployments=n_dep)
        model.save()
        return model

    from sklearn.linear_model import LogisticRegression  # deferred heavy import

    total = df.groupby("session_key")["lap_number"].transform("max")
    X = np.column_stack(
        [
            (df["lap_number"] <= 1).astype(float),
            df["lap_number"] / total,
            np.zeros(len(df)),  # wetness joins when weather features land in the table
        ]
    )
    lr = LogisticRegression().fit(X, df["deploy"])
    model = SCHazardModel(
        season=season, mode="fitted",
        coefs=[float(lr.intercept_[0]), *[float(c) for c in lr.coef_[0]]],
        n_deployments=n_dep,
    )
    model.save()
    return model
