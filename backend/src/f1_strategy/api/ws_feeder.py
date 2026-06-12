"""WebSocket endpoint backed by IFeeder (archive or live).

Protocol is identical to ws_replay so existing frontend clients need no changes.
  server → client: {"type": "race_state"|"replay_status"|"predictions", "data": {...}}
  client → server: {"type": "control", "action": "play"|"pause"|"speed"|"seek", "value": x}

Route /ws/feed/{session_key} is the primary path.
Route /ws/replay/{session_key} is kept as a backward-compat alias in ws_replay.py.
"""

import asyncio
import contextlib
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from f1_strategy.archive import queries
from f1_strategy.archive.db import refresh_views
from f1_strategy.feeder.session_registry import registry

log = logging.getLogger(__name__)
router = APIRouter(tags=["feeder"])


@router.websocket("/ws/feed/{session_key}")
async def ws_feed(websocket: WebSocket, session_key: str) -> None:
    await websocket.accept()
    try:
        # Archive sessions need local data loaded before the feeder can replay.
        # Live sessions ("live", or any key whose source is "live"/"livef1") connect
        # directly to the timing stream — archive loading would 404 on them.
        source = registry.get_source(session_key)
        if source == "archive":
            if not queries.session_has_laps(session_key):
                await asyncio.to_thread(queries.ensure_session, session_key)
                refresh_views()
        session = registry.get_or_create(session_key)
    except ValueError as exc:
        await websocket.close(code=4404, reason=str(exc))
        return
    except Exception:
        log.exception("feeder session load failed: %s", session_key)
        await websocket.close(code=1011, reason="session load failed")
        return

    queue = session.subscribe()

    async def sender() -> None:
        while True:
            await websocket.send_json(await queue.get())

    async def receiver() -> None:
        while True:
            msg = await websocket.receive_json()
            if msg.get("type") == "control":
                session.handle_control(msg.get("action", ""), msg.get("value"))

    send_task = asyncio.create_task(sender())
    recv_task = asyncio.create_task(receiver())
    try:
        done, _ = await asyncio.wait(
            {send_task, recv_task}, return_when=asyncio.FIRST_EXCEPTION
        )
        for task in done:
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                log.warning("ws_feed task error on %s: %r", session_key, exc)
    finally:
        for task in (send_task, recv_task):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        registry.release(session_key, queue)
