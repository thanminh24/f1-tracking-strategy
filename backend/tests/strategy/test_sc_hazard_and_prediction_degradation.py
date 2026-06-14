"""SC hazard math + prediction-service degraded paths (no archive needed)."""

import numpy as np
import pandas as pd

from f1_strategy.feeder.livef1_schedule_client import ScheduledSession
from f1_strategy.strategy.prediction_service import (
    PredictionService,
    resolve_prediction_artifact_key,
)
from f1_strategy.strategy.sc_hazard import SCHazardModel


def test_prior_mode_scales_track_hazard():
    m = SCHazardModel(season=2024, mode="prior")
    base = 0.005
    assert m.prob_next_lap(1, 57, base) == np.clip(base * 8.0, 0, 0.5)  # lap-1 chaos
    assert m.prob_next_lap(20, 57, base) == base


def test_prob_within_is_monotonic_in_horizon():
    m = SCHazardModel(season=2024, mode="prior")
    p1 = m.prob_within(1, 10, 57, 0.005)
    p5 = m.prob_within(5, 10, 57, 0.005)
    p10 = m.prob_within(10, 10, 57, 0.005)
    assert 0 < p1 < p5 < p10 < 1


def test_fitted_mode_uses_logistic_coefs():
    # intercept-only logit(-3) → sigmoid ≈ 0.0474 regardless of lap
    m = SCHazardModel(season=2024, mode="fitted", coefs=[-3.0, 0.0, 0.0, 0.0])
    assert abs(m.prob_next_lap(20, 57, 0.005) - 1 / (1 + np.exp(3))) < 1e-9


def test_load_missing_artifact_falls_back_to_prior(tmp_path, monkeypatch):
    monkeypatch.setenv("F1_DATA_DIR", str(tmp_path))
    from f1_strategy.config import get_settings

    get_settings.cache_clear()
    try:
        m = SCHazardModel.load(2031)
        assert m.mode == "prior"
    finally:
        get_settings.cache_clear()


def test_prediction_service_degrades_for_unknown_session():
    svc = PredictionService("2031_99_R")  # no meta/calibration anywhere
    assert svc.available  # optimistic until the first (worker-thread) load attempt
    from f1_strategy.models import RaceState

    state = RaceState(session_key="2031_99_R", t_session_s=0.0, leader_lap=5, cars=[])
    assert svc.predict(state) is None
    assert not svc.available  # truthful after the load attempt failed


def test_prediction_artifact_key_uses_archive_metadata(monkeypatch):
    monkeypatch.setattr(
        "f1_strategy.strategy.prediction_service.queries.get_session_meta",
        lambda _session_key: pd.DataFrame([{"year": 2024, "circuit": "Monaco"}]),
    )

    assert resolve_prediction_artifact_key("2024_08_R") == (2024, "Monaco")


def test_prediction_artifact_key_uses_live_schedule_fallback(monkeypatch):
    monkeypatch.setattr(
        "f1_strategy.strategy.prediction_service.queries.get_session_meta",
        lambda _session_key: pd.DataFrame(columns=["year", "circuit"]),
    )
    monkeypatch.setattr(
        "f1_strategy.feeder.livef1_schedule_client.get_current_session_sync",
        lambda: ScheduledSession(
            session_key=1234,
            circuit="Catalunya",
            country="Spanish Grand Prix",
            session_type="Race",
            date_start=None,
            date_end=None,
            status="active",
        ),
    )

    assert resolve_prediction_artifact_key("live") == (2025, "Barcelona")


def test_prediction_artifact_key_uses_latest_same_circuit_live_artifact(tmp_path, monkeypatch):
    monkeypatch.setenv("F1_DATA_DIR", str(tmp_path))
    from f1_strategy.config import get_settings

    get_settings.cache_clear()
    try:
        artifact = tmp_path / "calibration" / "2025" / "Barcelona.json"
        artifact.parent.mkdir(parents=True)
        artifact.write_text("{}")
        monkeypatch.setattr(
            "f1_strategy.strategy.prediction_service.queries.get_session_meta",
            lambda _session_key: pd.DataFrame(columns=["year", "circuit"]),
        )
        monkeypatch.setattr(
            "f1_strategy.feeder.livef1_schedule_client.get_current_session_sync",
            lambda: ScheduledSession(
                session_key=11307,
                circuit="Catalunya",
                country="Spanish Grand Prix",
                session_type="Race",
                date_start=None,
                date_end=None,
                status="active",
            ),
        )

        assert resolve_prediction_artifact_key("live") == (2025, "Barcelona")
    finally:
        get_settings.cache_clear()
