"""Replay session registry: one ReplaySource per session_key, fan-out to N clients.

Each subscriber gets an asyncio.Queue of JSON-ready dicts. The pump task runs the
ReplaySource tick loop once and broadcasts; auto-teardown when the last client leaves.
"""

import asyncio
import logging

from f1_strategy.replay.replay_source import ReplaySource, build_timeline

log = logging.getLogger(__name__)

QUEUE_MAX = 60  # ~1 min of ticks; slow clients drop oldest rather than stall others


class ReplaySession:
    def __init__(self, session_key: str):
        self.session_key = session_key
        self.source = ReplaySource(build_timeline(session_key))
        self.subscribers: set[asyncio.Queue] = set()
        self.pump_task: asyncio.Task | None = None

    def start(self) -> None:
        self.pump_task = asyncio.create_task(self._pump())

    async def _pump(self) -> None:
        try:
            async for state in self.source.states():
                msg = {"type": "race_state", "data": state.model_dump(mode="json")}
                self._broadcast(msg)
                self._broadcast(
                    {"type": "replay_status", "data": self.source.status().model_dump()}
                )
        except Exception:
            log.exception("replay pump died: %s", self.session_key)

    def _broadcast(self, msg: dict) -> None:
        for q in self.subscribers:
            if q.full():
                q.get_nowait()  # drop oldest for laggards
            q.put_nowait(msg)

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX)
        self.subscribers.add(q)
        # immediate snapshot so new clients render without waiting for next tick
        q.put_nowait(
            {"type": "race_state", "data": self.source.current_state().model_dump(mode="json")}
        )
        q.put_nowait({"type": "replay_status", "data": self.source.status().model_dump()})
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def handle_control(self, action: str, value: float | int | None = None) -> None:
        if action == "play":
            self.source.play()
        elif action == "pause":
            self.source.pause()
        elif action == "speed" and value is not None:
            self.source.set_speed(float(value))
        elif action == "seek" and value is not None:
            self.source.seek_lap(int(value))


class SessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, ReplaySession] = {}

    def get_or_create(self, session_key: str) -> ReplaySession:
        sess = self._sessions.get(session_key)
        if sess is None or (sess.pump_task and sess.pump_task.done() and sess.source.finished):
            sess = ReplaySession(session_key)
            sess.start()
            self._sessions[session_key] = sess
        return sess

    def release(self, session_key: str, q: asyncio.Queue) -> None:
        sess = self._sessions.get(session_key)
        if not sess:
            return
        sess.unsubscribe(q)
        if not sess.subscribers and sess.pump_task:
            sess.pump_task.cancel()
            del self._sessions[session_key]


manager = SessionManager()
