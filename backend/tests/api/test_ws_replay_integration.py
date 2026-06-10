"""WebSocket integration: two clients get ticks; controls work."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from f1_strategy.api.app import app
from f1_strategy.config import get_settings

BAHRAIN_24 = "2024_1_R"

pytestmark = pytest.mark.skipif(
    not (get_settings().parquet_dir / "laps").exists(),
    reason="parquet archive not ingested yet",
)


def test_archive_rest_endpoints():
    client = TestClient(app)
    assert 2024 in client.get("/api/seasons").json()
    results = client.get(f"/api/sessions/{BAHRAIN_24}/results").json()
    assert len(results) == 20
    laps = client.get(f"/api/sessions/{BAHRAIN_24}/laps").json()
    assert len(laps) > 1000


def test_two_ws_clients_receive_ticks_and_controls_apply():
    client = TestClient(app)
    with client.websocket_connect(f"/ws/replay/{BAHRAIN_24}") as ws1, \
         client.websocket_connect(f"/ws/replay/{BAHRAIN_24}") as ws2:
        first1 = ws1.receive_json()
        first2 = ws2.receive_json()
        assert first1["type"] == "race_state"
        assert first2["type"] == "race_state"
        assert len(first1["data"]["cars"]) == 20

        ws1.send_json({"type": "control", "action": "speed", "value": 100})
        ws1.send_json({"type": "control", "action": "seek", "value": 25})
        # drain a few messages; replay_status should reflect the speed change
        saw_speed = False
        for _ in range(20):
            msg = ws1.receive_json()
            if msg["type"] == "replay_status" and msg["data"]["speed"] == 100:
                saw_speed = True
                break
        assert saw_speed


def test_unknown_session_rejected():
    client = TestClient(app)
    with pytest.raises(WebSocketDisconnect):
        with client.websocket_connect("/ws/replay/1999_1_R") as ws:
            ws.receive_json()
