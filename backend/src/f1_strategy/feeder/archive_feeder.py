"""ArchiveFeeder: wraps ReplaySource to satisfy IFeeder.

Thin delegation layer — all replay logic (timeline building, seek, speed,
tick loop) lives in ReplaySource. This class just adapts the interface.
"""

from collections.abc import AsyncIterator

from f1_strategy.models import RaceState
from f1_strategy.replay.replay_source import ReplaySource, build_timeline


class ArchiveFeeder:
    is_live: bool = False

    def __init__(self, session_key: str) -> None:
        self.session_key = session_key
        self._source = ReplaySource(build_timeline(session_key))

    # -- IFeeder interface ---------------------------------------------------

    async def ticks(self) -> AsyncIterator[RaceState]:
        async for state in self._source.states():
            yield state

    def current_state(self) -> RaceState | None:
        return self._source.current_state()

    def status(self) -> dict:
        s = self._source.status()
        return {**s.model_dump(), "source": "archive"}

    def play(self) -> None:
        self._source.play()

    def pause(self) -> None:
        self._source.pause()

    def set_speed(self, speed: float) -> None:
        self._source.set_speed(speed)

    def seek_lap(self, lap: int) -> None:
        self._source.seek_lap(lap)

    # -- extra for registry snapshot check -----------------------------------

    @property
    def finished(self) -> bool:
        return self._source.finished
