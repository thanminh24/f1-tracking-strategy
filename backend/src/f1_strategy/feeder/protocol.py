"""IFeeder: structural protocol for archive and live data sources.

Both ArchiveFeeder and LiveFeeder satisfy this interface so all consumer code
(WS endpoint, session registry) is source-agnostic.
"""

from collections.abc import AsyncIterator
from typing import Protocol, runtime_checkable

from f1_strategy.models import RaceState


@runtime_checkable
class IFeeder(Protocol):
    """Async tick source with playback controls. Controls are no-ops on live sources."""

    session_key: str
    is_live: bool

    def ticks(self) -> AsyncIterator[RaceState]:
        """Yield RaceState ticks until the session ends."""
        ...

    def current_state(self) -> RaceState | None:
        """Snapshot for late-joining subscribers. None if no state emitted yet."""
        ...

    def status(self) -> dict:
        """Dict with keys: source, playing, speed, t_session_s, finished."""
        ...

    def play(self) -> None: ...
    def pause(self) -> None: ...
    def set_speed(self, speed: float) -> None: ...
    def seek_lap(self, lap: int) -> None: ...
