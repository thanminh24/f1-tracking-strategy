"""LiveFeeder: polls OpenF1 (https://openf1.org) at 1s cadence.

Parses the free, no-auth public API into RaceState ticks. Controls are
intentional no-ops — live sources have no playback concept.

session_key format accepted:
  "live"       → auto-detect current race session from OpenF1
  "2024_1_R"   → resolve year=2024, round=1 from OpenF1 sessions list
  "12345"      → treat as raw OpenF1 numeric session_key (for testing)
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator

from f1_strategy.feeder.openf1_client import OF1RaceControl, OpenF1Client
from f1_strategy.models.race_state import (
    CarState,
    CarStatus,
    RaceControlMsg,
    RaceState,
    TireState,
    TrackStatus,
    WeatherState,
)

log = logging.getLogger(__name__)

_FLAG_MAP: dict[str, TrackStatus] = {
    "GREEN": TrackStatus.GREEN,
    "YELLOW": TrackStatus.YELLOW_ZONE,
    "DOUBLE YELLOW": TrackStatus.YELLOW_ZONE,
    "VIRTUAL SAFETY CAR": TrackStatus.VSC,
    "SAFETY CAR": TrackStatus.SC,
    "RED": TrackStatus.RED,
    "CHEQUERED": TrackStatus.GREEN,  # race over — keep green for display
}

# Compound name normalization (OpenF1 uses uppercase strings like "SOFT")
_COMPOUND_MAP: dict[str, str] = {
    "SOFT": "SOFT",
    "MEDIUM": "MEDIUM",
    "HARD": "HARD",
    "INTERMEDIATE": "INTERMEDIATE",
    "WET": "WET",
    "HYPERSOFT": "SOFT",
    "ULTRASOFT": "SOFT",
    "SUPERSOFT": "SOFT",
    "SUPERHARD": "HARD",
}


def _track_status_from_rc(messages: list[OF1RaceControl]) -> TrackStatus:
    """Derive current track status from the most recent flag race-control message."""
    for msg in reversed(messages):
        if msg.flag:
            status = _FLAG_MAP.get(msg.flag.upper())
            if status is not None:
                return status
    return TrackStatus.GREEN


def _assemble(
    positions: list,
    stints: list,
    pits: list,
    rc: list,
    drivers: list,
    session_key: str,
    t_session_s: float,
) -> tuple[RaceState, bool]:
    """Null-safe: missing/empty fields degrade gracefully to defaults."""
    driver_info = {d.driver_number: d for d in drivers}

    # Latest stint per driver
    by_driver_stints: dict[int, list] = {}
    for s in stints:
        by_driver_stints.setdefault(s.driver_number, []).append(s)

    # Pit-stop count per driver
    pit_counts: dict[int, int] = {}
    for p in pits:
        pit_counts[p.driver_number] = pit_counts.get(p.driver_number, 0) + 1

    cars: list[CarState] = []
    leader_lap = 0
    for pos in positions:
        dn = pos.driver_number
        drv = driver_info.get(dn)
        lap = pos.lap_number or 0
        leader_lap = max(leader_lap, lap)

        # Current stint → tire
        tire: TireState | None = None
        drv_stints = sorted(by_driver_stints.get(dn, []), key=lambda s: s.stint_number)
        if drv_stints:
            latest = drv_stints[-1]
            compound = _COMPOUND_MAP.get(
                (latest.compound or "").upper(),
                latest.compound or "MEDIUM",
            )
            age = lap - (latest.lap_start or 1) + latest.tyre_age_at_start + 1
            tire = TireState(compound=compound, age_laps=max(0, age), stint=latest.stint_number)

        status = (
            CarStatus.PITTING
            if pit_counts.get(dn, 0) > 0 and lap == 0
            else CarStatus.RUNNING
        )
        cars.append(
            CarState(
                car_id=str(dn),
                driver_code=drv.name_acronym if drv else None,
                team=(drv.team_name or "").lower() if drv else None,
                position=pos.position or 0,
                lap=lap,
                lap_fraction=0.0,
                gap_leader_s=None,
                tire=tire,
                pit_stops=pit_counts.get(dn, 0),
                status=status,
            )
        )

    cars.sort(key=lambda c: (c.position or 99))
    track_status = _track_status_from_rc(rc)

    # Chequered flag → finished
    finished = any(
        m.flag and "CHEQUERED" in m.flag.upper()
        for m in rc
    )

    rc_msgs = [
        RaceControlMsg(
            t_session_s=t_session_s,
            lap=m.lap_number,
            category=m.category or "Other",
            message=m.message,
        )
        for m in rc[-5:]  # only last 5 messages per tick to avoid spam
    ]

    state = RaceState(
        session_key=session_key,
        t_session_s=t_session_s,
        leader_lap=leader_lap,
        track_status=track_status,
        cars=cars,
        rc_messages=rc_msgs,
        weather=WeatherState(),
    )
    return state, finished


class LiveFeeder:
    is_live: bool = True

    def __init__(self, session_key: str) -> None:
        self.session_key = session_key
        self._client = OpenF1Client()
        self._state: RaceState | None = None
        self._finished = False
        self._of1_key: int | None = None  # resolved on first tick

    async def _resolve_openf1_key(self) -> int | None:
        """Map our session_key format to OpenF1's numeric session_key."""
        key = self.session_key

        # Raw numeric string ("12345") — used for testing historical sessions
        if key.isdigit():
            return int(key)

        # Auto-detect any active session (Race, Practice, Qualifying)
        if key == "live":
            session = await self._client.current_live_session()
            if session:
                log.info(
                    "LiveFeeder: auto-detected OpenF1 session_key=%d (%s)",
                    session.session_key,
                    session.session_type,
                )
                return session.session_key
            log.warning("LiveFeeder: no active session found in OpenF1")
            return None

        # Our format "YYYY_RR_S" → year + round
        parts = key.split("_")
        if len(parts) >= 2 and parts[0].isdigit() and parts[1].isdigit():
            year, round_num = int(parts[0]), int(parts[1])
            session = await self._client.find_session(year, round_num)
            if session:
                log.info(
                    "LiveFeeder: resolved %s → OpenF1 session_key=%d",
                    key,
                    session.session_key,
                )
                return session.session_key
            log.warning("LiveFeeder: could not resolve %s in OpenF1", key)

        return None

    async def ticks(self) -> AsyncIterator[RaceState]:
        self._of1_key = await self._resolve_openf1_key()
        if self._of1_key is None:
            log.warning(
                "LiveFeeder: no OpenF1 session resolved for %s — yielding nothing",
                self.session_key,
            )
            return

        # Pre-fetch driver roster once (rarely changes during a session)
        drivers = await self._client.drivers(self._of1_key)
        t_start = time.monotonic()

        log.info(
            "LiveFeeder: polling OpenF1 session_key=%d for %s",
            self._of1_key,
            self.session_key,
        )
        while not self._finished:
            t0 = time.monotonic()
            positions, stints, pits, rc = await asyncio.gather(
                self._client.positions(self._of1_key),
                self._client.stints(self._of1_key),
                self._client.pit(self._of1_key),
                self._client.race_control(self._of1_key),
            )

            if not positions:
                # No data yet (pre-race / brief outage) — keep polling
                await asyncio.sleep(1.0)
                continue

            t_session = time.monotonic() - t_start
            state, finished_flag = _assemble(
                positions,
                stints,
                pits,
                rc,
                drivers,
                self.session_key,
                t_session,
            )
            if finished_flag:
                self._finished = True

            self._state = state
            yield state

            elapsed = time.monotonic() - t0
            await asyncio.sleep(max(0.0, 1.0 - elapsed))

        log.info("LiveFeeder: session %s finished (chequered flag)", self.session_key)

    def current_state(self) -> RaceState | None:
        return self._state

    def status(self) -> dict:
        return {
            "source": "live",
            "playing": True,
            "speed": 1.0,
            "t_session_s": self._state.t_session_s if self._state else 0.0,
            "finished": self._finished,
        }

    @property
    def finished(self) -> bool:
        return self._finished

    # Live sources have no playback concept — all controls are no-ops.
    def play(self) -> None: pass
    def pause(self) -> None: pass
    def set_speed(self, _speed: float) -> None: pass
    def seek_lap(self, _lap: int) -> None: pass
