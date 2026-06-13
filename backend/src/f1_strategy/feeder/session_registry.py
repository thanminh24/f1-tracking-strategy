"""FeederRegistry: one FeederSession per session_key with fan-out queues.

Mirrors session_manager.py but operates on IFeeder instances so archive and
live sources share identical broadcast / subscription / prediction logic.
The source for a session can be switched at runtime via set_source().
"""

import asyncio
import logging
import os

from f1_strategy.feeder.archive_feeder import ArchiveFeeder
from f1_strategy.feeder.live_feeder import LiveFeeder
from f1_strategy.feeder.livef1_feeder import LiveF1Feeder
from f1_strategy.feeder.protocol import IFeeder
from f1_strategy.strategy.prediction_service import PredictionService

log = logging.getLogger(__name__)

QUEUE_MAX = 60  # ~1 min of 1Hz ticks; slow clients drop oldest rather than stall others


def _predictions_enabled() -> bool:
    return os.environ.get("F1_PREDICTIONS", "1") != "0"


class FeederSession:
    """Pump loop + subscriber fan-out for a single IFeeder instance."""

    def __init__(self, feeder: IFeeder) -> None:
        self.feeder = feeder
        self.subscribers: set[asyncio.Queue] = set()
        self.pump_task: asyncio.Task | None = None
        self.predictor = (
            PredictionService(feeder.session_key) if _predictions_enabled() else None
        )
        self._pred_lap = -1
        self._pred_task: asyncio.Task | None = None
        self.last_prediction: dict | None = None

    def start(self) -> None:
        self.pump_task = asyncio.create_task(self._pump())

    async def _pump(self) -> None:
        try:
            async for state in self.feeder.ticks():
                self._broadcast({"type": "race_state", "data": state.model_dump(mode="json")})
                self._broadcast({"type": "replay_status", "data": self.feeder.status()})
                # Broadcast per-driver telemetry when available (LiveF1Feeder only).
                # Truncate to last 60 samples per driver (~15s at 4Hz) to bound message size.
                if hasattr(self.feeder, "get_telemetry"):
                    telem = self.feeder.get_telemetry()
                    if telem:
                        trimmed = {k: v[-60:] for k, v in telem.items()}
                        self._broadcast({"type": "telemetry", "data": trimmed})
                self._maybe_predict(state)
        except Exception:
            log.exception("feeder pump died: %s", self.feeder.session_key)

    def _maybe_predict(self, state) -> None:
        """One off-thread prediction per new lap; skip while one is in flight."""
        if (
            self.predictor is None
            or not self.predictor.available
            or state.leader_lap == self._pred_lap
            or (self._pred_task is not None and not self._pred_task.done())
        ):
            return
        self._pred_lap = state.leader_lap
        self._pred_task = asyncio.create_task(self._predict_and_broadcast(state))

    async def _predict_and_broadcast(self, state) -> None:
        try:
            pred = await asyncio.to_thread(self.predictor.predict, state)
        except Exception:
            log.exception(
                "prediction failed: %s lap %s", self.feeder.session_key, state.leader_lap
            )
            return
        if pred is not None:
            self.last_prediction = {"type": "predictions", "data": pred.model_dump(mode="json")}
            self._broadcast(self.last_prediction)

    def _broadcast(self, msg: dict) -> None:
        for q in self.subscribers:
            if q.full():
                q.get_nowait()  # drop oldest for laggards
            q.put_nowait(msg)

    def subscribe(self) -> asyncio.Queue:
        """Return a queue pre-seeded with snapshot messages for immediate render."""
        q: asyncio.Queue = asyncio.Queue(maxsize=QUEUE_MAX)
        self.subscribers.add(q)
        snapshot = self.feeder.current_state()
        if snapshot is not None:
            q.put_nowait({"type": "race_state", "data": snapshot.model_dump(mode="json")})
        q.put_nowait({"type": "replay_status", "data": self.feeder.status()})
        if self.last_prediction is not None:
            q.put_nowait(self.last_prediction)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self.subscribers.discard(q)

    def handle_control(self, action: str, value: float | int | None = None) -> None:
        if action == "play":
            self.feeder.play()
        elif action == "pause":
            self.feeder.pause()
        elif action == "speed" and value is not None:
            self.feeder.set_speed(float(value))
        elif action == "seek" and value is not None:
            self.feeder.seek_lap(int(value))


class FeederRegistry:
    """Maps session_key → active FeederSession; supports runtime source switching."""

    def __init__(self) -> None:
        self._sessions: dict[str, FeederSession] = {}
        self._sources: dict[str, str] = {}  # session_key → "archive" | "live"

    def get_source(self, session_key: str) -> str:
        return self._sources.get(session_key, "archive")

    def set_source(self, session_key: str, source: str) -> None:
        """Switch the active source; tears down the existing session so the next
        get_or_create() instantiates a fresh feeder of the requested type.

        Valid sources: "archive" | "live" (OpenF1) | "livef1" (F1 SignalR fallback)
        """
        if source not in ("archive", "live", "livef1"):
            raise ValueError(f"unknown source: {source!r}")
        if self._sources.get(session_key) == source:
            return
        self._sources[session_key] = source
        sess = self._sessions.pop(session_key, None)
        if sess and sess.pump_task:
            sess.pump_task.cancel()

    def get_or_create(self, session_key: str) -> FeederSession:
        source = self._sources.get(session_key, "archive")
        sess = self._sessions.get(session_key)
        # create fresh session when absent or pump has died
        if sess is None or (sess.pump_task and sess.pump_task.done()):
            if source == "live":
                feeder: IFeeder = LiveFeeder(session_key)
            elif source == "livef1":
                feeder = LiveF1Feeder(session_key)
            else:
                feeder = ArchiveFeeder(session_key)
            sess = FeederSession(feeder)
            sess.start()
            self._sessions[session_key] = sess
        return sess

    def release(self, session_key: str, q: asyncio.Queue) -> None:
        sess = self._sessions.get(session_key)
        if not sess:
            return
        sess.unsubscribe(q)
        # tear down pump when last subscriber leaves
        if not sess.subscribers and sess.pump_task:
            sess.pump_task.cancel()
            del self._sessions[session_key]


# Module-level singleton used by ws_feeder and routes_source.
registry = FeederRegistry()
