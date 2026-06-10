"""WebSocket endpoint: replay tick stream + control messages.

Protocol:
  server → client: {"type": "race_state"|"replay_status", "data": {...}}
  client → server: {"type": "control", "action": "play"|"pause"|"speed"|"seek", "value": x}
"""

import asyncio
import contextlib
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from f1_strategy.archive import queries
from f1_strategy.archive.db import refresh_views
from f1_strategy.replay.session_manager import manager

log = logging.getLogger(__name__)
router = APIRouter(tags=["replay"])


@router.websocket("/ws/replay/{session_key}")
async def ws_replay(websocket: WebSocket, session_key: str) -> None:
    await websocket.accept()
    try:
        if not queries.session_has_laps(session_key):
            await asyncio.to_thread(queries.ensure_session, session_key)
            refresh_views()
        session = manager.get_or_create(session_key)
    except ValueError as exc:  # not in archive
        await websocket.close(code=4404, reason=str(exc))
        return
    except Exception:
        log.exception("session load failed: %s", session_key)
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
        done, pending = await asyncio.wait(
            {send_task, recv_task}, return_when=asyncio.FIRST_EXCEPTION
        )
        for task in done:  # surface unexpected errors (disconnects are normal)
            exc = task.exception()
            if exc and not isinstance(exc, WebSocketDisconnect):
                log.warning("ws task error on %s: %r", session_key, exc)
    finally:
        for task in (send_task, recv_task):
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task
        manager.release(session_key, queue)
