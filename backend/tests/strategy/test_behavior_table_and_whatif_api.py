"""Behavior training table (archive-dependent) + what-if endpoint validation."""

import pytest
from fastapi.testclient import TestClient

from f1_strategy.api.app import app
from f1_strategy.config import get_settings

BAHRAIN_24 = "2024_1_R"
archive_present = (get_settings().parquet_dir / "laps").exists()
calibrated = (get_settings().calibration_dir / "2024" / "Sakhir.json").exists()


@pytest.mark.skipif(not archive_present, reason="parquet archive not ingested yet")
def test_training_table_features_and_labels():
    from f1_strategy.strategy.behavior_model import PIT_FEATURES, build_pit_training_table

    df = build_pit_training_table()
    assert not df.empty
    assert set(PIT_FEATURES) <= set(df.columns)
    assert df["pitted"].sum() > 0
    assert df["race_frac"].between(0, 1.2).all()
    # compound classifier labels exist on pit laps
    pits = df[df["pitted"] == 1]
    assert pits["next_compound"].notna().any()


def test_whatif_rejects_unknown_session():
    client = TestClient(app)
    resp = client.post("/api/whatif", json={
        "session_key": "2031_99_R", "lap": 10, "car_id": "1", "action": "PIT_SOFT"})
    assert resp.status_code in (404, 502)


@pytest.mark.skipif(not (archive_present and calibrated),
                    reason="needs ingested Bahrain + Sakhir calibration")
def test_whatif_round_trip_returns_distributions():
    client = TestClient(app)
    resp = client.post("/api/whatif", json={
        "session_key": BAHRAIN_24, "lap": 20, "car_id": "1", "action": "PIT_HARD"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["baseline"]["position_dist"] and body["forced"]["position_dist"]
    assert body["meta"]["n_rollouts"] > 0
    assert isinstance(body["delta_expected_position"], float)


@pytest.mark.skipif(not (archive_present and calibrated),
                    reason="needs ingested Bahrain + Sakhir calibration")
def test_prediction_service_emits_full_field_payload():
    from f1_strategy.api.routes_whatif import _state_at_lap
    from f1_strategy.strategy.prediction_service import PredictionService

    svc = PredictionService(BAHRAIN_24)
    assert svc.available
    pred = svc.predict(_state_at_lap(BAHRAIN_24, 20))
    assert pred is not None
    assert pred.lap >= 19 and len(pred.cars) >= 10
    assert 0 <= pred.sc_prob_1lap <= pred.sc_prob_5laps <= 1
    assert pred.meta.n_rollouts > 0
    assert pred.meta.model_versions["sc_hazard"].startswith("sc-hazard")
    car = pred.cars[0]
    assert abs(sum(car.outcome.position_dist.values()) - 1.0) < 1e-6
