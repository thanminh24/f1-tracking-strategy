from fastapi.testclient import TestClient

from f1_strategy.api.app import create_app


def test_transcribe_unavailable_without_asr_group():
    client = TestClient(create_app())

    response = client.post(
        "/api/team-radio/transcribe",
        json={"audio_url": "https://example.com/radio.mp3"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "unavailable"
    assert payload["text"] is None
