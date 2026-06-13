"""Per-lap prediction orchestrator: SC hazard + MC outcomes + PPO recommendations.

One PredictionService per replay session. `predict()` is synchronous and heavy
(hundreds of sim rollouts) — callers run it in a thread. Every failure mode
degrades to None so the replay stream never stalls on the strategy layer.
"""

import logging
import os
import time
from datetime import UTC, datetime

from f1_strategy.archive import queries
from f1_strategy.models import RaceState
from f1_strategy.sim.params import SimParams
from f1_strategy.strategy.behavior_model import BehaviorModel
from f1_strategy.strategy.mc_engine import run_mc
from f1_strategy.strategy.ppo_agent.policy import PPOPolicy
from f1_strategy.strategy.prediction_schema import (
    CarPrediction,
    ModelRecommendation,
    PredictionMeta,
    PredictionSet,
)
from f1_strategy.strategy.rsrl_agent.policy import RSRLPolicy
from f1_strategy.strategy.sc_hazard import SCHazardModel

log = logging.getLogger(__name__)


def _mc_budget() -> tuple[int, int]:
    """(n_draws, rollouts_per_draw) — env-tunable latency/accuracy trade-off."""
    n = int(os.environ.get("F1_MC_ROLLOUTS", "500"))
    draws = max(4, min(20, n // 25))
    return draws, max(1, n // draws)


def resolve_prediction_artifact_key(session_key: str) -> tuple[int, str]:
    """Return (season, circuit) used to load calibration/model artifacts."""
    meta = queries.get_session_meta(session_key)
    if not meta.empty:
        circuit = meta["circuit"].iloc[0]
        season = int(meta["year"].iloc[0])
        circuit_name = "" if circuit is None else str(circuit).strip()
        if circuit_name and circuit_name.lower() not in {"nan", "nat", "none"}:
            return season, circuit_name

    if session_key == "live":
        from f1_strategy.feeder.livef1_schedule_client import get_current_session_sync

        session = get_current_session_sync()
        if session and session.circuit:
            return datetime.now(UTC).year, session.circuit

    raise FileNotFoundError(f"no session metadata for {session_key}")


class PredictionService:
    """Lazily loads per-session artifacts on the FIRST predict() call — which runs
    in a worker thread — so DuckDB/booster/torch loading never blocks the event
    loop on WebSocket connect. Loading is all-or-nothing: any failure leaves the
    service cleanly unavailable instead of half-initialized."""

    def __init__(self, session_key: str):
        self.session_key = session_key
        self.params: SimParams | None = None
        self.behavior: BehaviorModel | None = None
        self.sc_model: SCHazardModel | None = None
        self.ppo: PPOPolicy | None = None
        self.rsrl: RSRLPolicy | None = None
        self._load_attempted = False

    def _load(self) -> None:
        """One-shot artifact load (worker thread; one in-flight predict per session)."""
        if self._load_attempted:
            return
        self._load_attempted = True
        try:
            season, circuit = resolve_prediction_artifact_key(self.session_key)
            params = SimParams.load(season, circuit)
            behavior = BehaviorModel()
            sc_model = SCHazardModel.load(season)
            ppo = PPOPolicy(season, circuit)
            rsrl = _load_rsrl_policy(season, circuit)
        except FileNotFoundError:
            log.info("no calibration for %s — predictions disabled", self.session_key)
            return
        except Exception:
            log.exception("prediction service init failed: %s", self.session_key)
            return
        # commit only after every artifact loaded — no partially-available state
        self.params, self.behavior, self.sc_model, self.ppo = params, behavior, sc_model, ppo
        self.rsrl = rsrl

    @property
    def available(self) -> bool:
        """Optimistic before the first load attempt; truthful afterwards."""
        return self.params is not None or not self._load_attempted

    def predict(self, state: RaceState) -> PredictionSet | None:
        """Full-field PredictionSet for the current lap, or None (degraded/finished)."""
        self._load()
        if self.params is None or state.leader_lap < 1:
            return None
        t0 = time.perf_counter()
        params, lap = self.params, state.leader_lap
        total = state.total_laps or params.total_laps
        wet = bool(state.weather and state.weather.rainfall)
        sc1 = self.sc_model.prob_next_lap(lap + 1, total, params.sc_hazard_per_lap, wet)
        sc5 = self.sc_model.prob_within(5, lap + 1, total, params.sc_hazard_per_lap, wet)

        n_draws, per_draw = _mc_budget()
        try:
            mc = run_mc(state, params, behavior=self.behavior,
                        n_draws=n_draws, rollouts_per_draw=per_draw, seed=lap)
        except Exception:
            log.exception("MC rollouts failed: %s lap %s", self.session_key, lap)
            mc = None
        recs = {}
        try:
            recs = self.ppo.recommend(state, params) if self.ppo else {}
        except Exception:
            log.exception("PPO inference failed: %s lap %s", self.session_key, lap)
        rsrl_recs: dict = {}
        rsrl_seqs: dict = {}
        try:
            if self.rsrl:
                rsrl_recs = self.rsrl.recommend(state, params)
                rsrl_seqs = self.rsrl.sequences_for_state(state, params)
        except Exception:
            log.exception("RSRL inference failed: %s lap %s", self.session_key, lap)

        if mc is None and not recs:
            return None
        cars = []
        for cid in (mc.car_ids if mc else recs.keys()):
            rec = recs.get(cid, {})
            model_recommendations = {}
            if cid in rsrl_recs:
                rsrl_rec = rsrl_recs[cid]
                top_factors: list[dict] = []
                if cid in rsrl_seqs and self.rsrl is not None:
                    try:
                        from f1_strategy.strategy.rsrl_agent.explain import perturbation_importance
                        top_factors = [
                            fi.to_dict()
                            for fi in perturbation_importance(self.rsrl, rsrl_seqs[cid], top_n=3)
                        ]
                    except Exception:
                        log.debug("RSRL explanation failed for car %s", cid)
                model_recommendations["rsrl"] = ModelRecommendation(
                    **rsrl_rec, top_factors=top_factors
                )
            cars.append(CarPrediction(
                car_id=cid,
                recommended_action=rec.get("recommended_action"),
                action_probs=rec.get("action_probs", {}),
                model_recommendations=model_recommendations,
                pit_window_probs=mc.pit_window(cid) if mc else {},
                next_compound_probs=mc.compound_dist(cid) if mc else {},
                outcome=mc.outcome(cid) if mc else _empty_outcome(),
            ))
        return PredictionSet(
            session_key=self.session_key, lap=lap, cars=cars,
            sc_prob_1lap=round(sc1, 4), sc_prob_5laps=round(sc5, 4),
            meta=PredictionMeta(
                n_rollouts=mc.n_rollouts if mc else 0,
                model_versions={
                    "sc_hazard": f"{self.sc_model.version}:{self.sc_model.mode}",
                    "behavior": f"{self.behavior.meta.get('version')}:"
                                f"{self.behavior.meta.get('quality')}",
                    "ppo": self.ppo.version if self.ppo else "none",
                    "rsrl": self.rsrl.version if self.rsrl else "disabled",
                },
                compute_ms=round((time.perf_counter() - t0) * 1000, 1),
            ),
        )


def _empty_outcome():
    from f1_strategy.strategy.prediction_schema import OutcomeProbs

    return OutcomeProbs(win=0.0, podium=0.0, points=0.0, expected_position=0.0)


def _load_rsrl_policy(season: int, circuit: str) -> RSRLPolicy | None:
    if os.environ.get("F1_RSRL_SHADOW") == "0":
        return None
    from f1_strategy.config import get_settings

    models_dir = get_settings().models_dir
    # Try exact season first, then fall back to any available RSRL for same circuit
    for try_season in (season, 2025, 2024):
        path = models_dir / f"rsrl_{try_season}_{circuit}.pt"
        if path.exists():
            if try_season != season:
                log.info("RSRL: no model for %s %s, using %s", season, circuit, try_season)
            return RSRLPolicy(path)
    return None
