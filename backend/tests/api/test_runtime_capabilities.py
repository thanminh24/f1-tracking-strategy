from fastapi.testclient import TestClient

from f1_strategy.api.app import create_app


def test_capabilities_surface_fixture_and_sources():
    client = TestClient(create_app())

    payload = client.get("/api/capabilities").json()

    assert payload["features"]["fixture"] is True
    assert payload["features"]["radio_asr"] is False
    assert payload["sources"]["fixture"] is True
    assert payload["providers"]["fixture"] == "enabled"
    assert "models" in payload


def test_source_endpoint_lists_fixture():
    client = TestClient(create_app())

    payload = client.get("/api/sessions/fixture/source").json()

    assert payload["source"] == "fixture"
    assert "fixture" in payload["available_sources"]
    assert payload["fixture_available"] is True
