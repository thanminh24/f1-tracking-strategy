"""LiveSource interface + archive-backed ReplaySource.

The v2 SignalR live adapter implements the same LiveSource interface so
everything above this module works unchanged for real live sessions.
"""

import asyncio
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

import pandas as pd
from pydantic import BaseModel

from f1_strategy.archive import queries
from f1_strategy.models import RaceState
from f1_strategy.replay.timeline_builder import RaceTimeline

TICK_INTERVAL_S = 1.0
SPEEDS = (0.5, 1.0, 2.0, 5.0, 10.0, 25.0, 100.0)


class ReplayStatus(BaseModel):
    session_key: str
    playing: bool
    speed: float
    t_session_s: float
    finished: bool


class LiveSource(ABC):
    """Stream of RaceState ticks — implemented by replay (now) and SignalR live (v2)."""

    @abstractmethod
    def states(self) -> AsyncIterator[RaceState]: ...


def build_timeline(session_key: str) -> RaceTimeline:
    laps = queries.get_laps(session_key)
    if laps.empty:
        raise ValueError(f"session not in archive: {session_key}")
    meta = queries.get_session_meta(session_key)
    _tl_raw = meta["total_laps"].iloc[0] if not meta.empty else None
    total_laps = int(_tl_raw) if _tl_raw is not None and pd.notna(_tl_raw) else None
    results = queries.get_results(session_key)
    finish_positions = {
        str(r["car_id"]): int(r["position"])
        for _, r in results.iterrows()
        if pd.notna(r["position"])
    }
    return RaceTimeline(session_key, laps, total_laps, finish_positions)


class ReplaySource(LiveSource):
    """Replays a RaceTimeline as wall-clock-paced ticks with play/pause/speed/seek."""

    def __init__(self, timeline: RaceTimeline, speed: float = 1.0):
        self.timeline = timeline
        self.t = timeline.t_start  # virtual session time, ms
        self.speed = speed
        self.playing = True
        self._wake = asyncio.Event()

    # -- controls (called by session manager from WS messages) ------------
    def play(self) -> None:
        self.playing = True
        self._wake.set()

    def pause(self) -> None:
        self.playing = False

    def set_speed(self, speed: float) -> None:
        self.speed = min(max(speed, 0.1), 500.0)

    def seek_lap(self, lap: int) -> None:
        """Jump so the leader is at the start of `lap`. Deterministic via state_at."""
        for car in sorted(self.timeline.cars, key=lambda c: c.lap_numbers[-1], reverse=True):
            mask = car.lap_numbers == lap
            if mask.any():
                self.t = float(car.starts[mask.argmax()])
                self._wake.set()
                return

    @property
    def finished(self) -> bool:
        return self.t >= self.timeline.t_end

    def status(self) -> ReplayStatus:
        return ReplayStatus(
            session_key=self.timeline.session_key, playing=self.playing,
            speed=self.speed, t_session_s=round(self.t / 1000, 1), finished=self.finished,
        )

    def current_state(self) -> RaceState:
        return self.timeline.state_at(self.t)

    async def states(self) -> AsyncIterator[RaceState]:
        """Tick loop with absolute deadlines (no sleep-drift accumulation)."""
        loop = asyncio.get_event_loop()
        next_deadline = loop.time()
        while not self.finished:
            if not self.playing:
                self._wake.clear()
                await self._wake.wait()
                next_deadline = loop.time()
            yield self.timeline.state_at(self.t)
            self.t += TICK_INTERVAL_S * 1000 * self.speed
            next_deadline += TICK_INTERVAL_S
            delay = next_deadline - loop.time()
            if delay > 0:
                await asyncio.sleep(delay)
            else:
                next_deadline = loop.time()  # fell behind; reset cadence
        yield self.timeline.state_at(self.timeline.t_end)
