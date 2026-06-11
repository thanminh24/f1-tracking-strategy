"""On-demand session loading: archive first, then scratch, FastF1 fetch (into the
purgeable scratch tier — never the archive) only when neither tier has the session."""

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from f1_strategy.api.app import app
from f1_strategy.archive import queries


def test_ensure_session_uses_existing_archive(monkeypatch):
    called = False

    def fail_ingest(*args, **kwargs):
        nonlocal called
        called = True
        raise AssertionError("ingest should not run")

    monkeypatch.setattr(queries, "session_in_archive", lambda key: True)
    monkeypatch.setattr(queries, "ingest_session", fail_ingest)

    result = queries.ensure_session("2024_1_R")

    assert result == {"session_key": "2024_1_R", "status": "available", "source": "archive"}
    assert not called


def test_ensure_session_serves_existing_scratch_copy(monkeypatch):
    monkeypatch.setattr(queries, "session_in_archive", lambda key: False)
    monkeypatch.setattr(queries, "session_in_scratch", lambda key: True)
    monkeypatch.setattr(
        queries, "ingest_session", lambda *a, **k: (_ for _ in ()).throw(AssertionError)
    )

    result = queries.ensure_session("2024_1_R")

    assert result == {"session_key": "2024_1_R", "status": "available", "source": "scratch"}


def test_ensure_session_fetches_into_scratch_when_missing(monkeypatch):
    captured = {}

    def fake_ingest(year, round_num, session, force=False, dest="archive"):
        captured["dest"] = dest
        return {"session_key": f"{year}_{round_num}_{session}", "status": "ok"}

    monkeypatch.setattr(queries, "session_in_archive", lambda key: False)
    monkeypatch.setattr(queries, "session_in_scratch", lambda key: False)
    monkeypatch.setattr(queries, "ingest_session", fake_ingest)

    result = queries.ensure_session("2024_1_R")

    assert result == {"session_key": "2024_1_R", "status": "available", "source": "fastf1"}
    assert captured["dest"] == "scratch"  # viewer fetch must never grow the archive


def test_ensure_session_force_never_overrides_archive(monkeypatch):
    monkeypatch.setattr(queries, "session_in_archive", lambda key: True)
    monkeypatch.setattr(
        queries, "ingest_session", lambda *a, **k: (_ for _ in ()).throw(AssertionError)
    )

    result = queries.ensure_session("2024_1_R", force=True)

    assert result["source"] == "archive"


def test_ensure_session_canonicalizes_key(monkeypatch):
    monkeypatch.setattr(queries, "session_in_archive", lambda key: key == "2024_1_R")

    result = queries.ensure_session("2024_01_r")

    assert result == {"session_key": "2024_1_R", "status": "available", "source": "archive"}


def test_ensure_endpoint_rejects_bad_session_key():
    client = TestClient(app)

    response = client.post("/api/sessions/not-a-key/ensure")

    assert response.status_code == 400


def test_ws_rejects_bad_session_key():
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/replay/not-a-key") as ws:
            ws.receive_json()
    except WebSocketDisconnect as exc:
        assert exc.code == 4404


def test_ws_reports_unavailable_session_load(monkeypatch):
    monkeypatch.setattr(queries, "session_has_laps", lambda key: False)

    def fail_load(key):
        raise RuntimeError("network secret path")

    monkeypatch.setattr(queries, "ensure_session", fail_load)
    client = TestClient(app)

    try:
        with client.websocket_connect("/ws/replay/2024_99_R") as ws:
            ws.receive_json()
    except WebSocketDisconnect as exc:
        assert exc.code == 1011
