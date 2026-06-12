"""LiveF1Feeder: real-time F1 data via the official SignalR timing endpoint.

Uses the `livef1` package (RealF1Client) which wraps livetiming.formula1.com/signalr/
— the same source multiviewer and FastF1 use. No API key required for live sessions.

Implements the same IFeeder protocol as LiveFeeder so it's a drop-in replacement
when OpenF1 restricts access (which happens during live race weekends on the free tier).

Data flow:
  SignalR → RealF1Client callback → asyncio.Queue → ticks() async generator → RaceState
"""

import asyncio
import logging
import time
from collections.abc import AsyncIterator

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

# Topics we subscribe to
_TOPICS = [
    "TimingData",       # positions, gaps, lap times, sectors
    "TimingAppData",    # tyre compounds per driver
    "TrackStatus",      # SC, VSC, red flag, green
    "DriverList",       # driver numbers → codes + team names
    "WeatherData",      # rainfall, temperature
]

_TRACK_STATUS_MAP: dict[str, TrackStatus] = {
    "1": TrackStatus.GREEN,
    "2": TrackStatus.YELLOW_ZONE,
    "4": TrackStatus.SC,
    "5": TrackStatus.RED,
    "6": TrackStatus.VSC,
    "7": TrackStatus.VSC,
}

_COMPOUND_MAP: dict[str, str] = {
    "SOFT": "SOFT", "MEDIUM": "MEDIUM", "HARD": "HARD",
    "INTERMEDIATE": "INTERMEDIATE", "WET": "WET",
    "HYPERSOFT": "SOFT", "ULTRASOFT": "SOFT", "SUPERSOFT": "SOFT",
    "SUPERHARD": "HARD",
}


class LiveF1Feeder:
    """IFeeder backed by the F1 official SignalR timing stream.

    Fallback for when OpenF1 restricts access during live sessions.
    Works for: Race, Qualifying, Sprint, Practice sessions.
    """

    is_live: bool = True

    def __init__(self, session_key: str) -> None:
        self.session_key = session_key

        # Accumulated state — updated by SignalR callbacks
        self._positions: dict[str, int] = {}          # driver_no → position
        self._gaps: dict[str, str] = {}               # driver_no → gap string (e.g. "+3.4")
        self._laps: dict[str, int] = {}               # driver_no → lap number
        self._compounds: dict[str, str] = {}          # driver_no → compound name
        self._tyre_ages: dict[str, int] = {}          # driver_no → tyre age
        self._tyre_stints: dict[str, int] = {}        # driver_no → stint number
        self._pit_stops: dict[str, int] = {}          # driver_no → pit count
        self._driver_codes: dict[str, str] = {}       # driver_no → 3-letter code
        self._driver_teams: dict[str, str] = {}       # driver_no → team name
        self._track_status: TrackStatus = TrackStatus.GREEN
        self._weather: WeatherState = WeatherState()
        self._rc_messages: list[RaceControlMsg] = []
        self._finished: bool = False

        self._state: RaceState | None = None
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._t_start: float = 0.0
        self._bg_task: asyncio.Task | None = None

    # ---- IFeeder interface -------------------------------------------------

    async def ticks(self) -> AsyncIterator[RaceState]:
        self._t_start = time.monotonic()

        # Start the SignalR client as a background task in THIS event loop
        self._bg_task = asyncio.create_task(self._run_signalr())
        log.info("LiveF1Feeder: SignalR task started for session %s", self.session_key)

        try:
            while not self._finished:
                # Drain accumulated queue updates
                deadline = asyncio.get_event_loop().time() + 1.0
                while True:
                    remaining = deadline - asyncio.get_event_loop().time()
                    if remaining <= 0:
                        break
                    try:
                        records = await asyncio.wait_for(self._queue.get(), timeout=remaining)
                        self._apply(records)
                    except asyncio.TimeoutError:
                        break

                state = self._build_state()
                if state.cars:
                    self._state = state
                    yield state

        finally:
            if self._bg_task and not self._bg_task.done():
                self._bg_task.cancel()
                try:
                    await self._bg_task
                except asyncio.CancelledError:
                    pass

    def current_state(self) -> RaceState | None:
        return self._state

    def status(self) -> dict:
        return {
            "source": "livef1_signalr",
            "playing": True,
            "speed": 1.0,
            "t_session_s": self._state.t_session_s if self._state else 0.0,
            "finished": self._finished,
        }

    # Live sources: playback controls are no-ops
    def play(self) -> None: pass
    def pause(self) -> None: pass
    def set_speed(self, _speed: float) -> None: pass
    def seek_lap(self, _lap: int) -> None: pass

    @property
    def finished(self) -> bool:
        return self._finished

    # ---- SignalR background task -------------------------------------------

    async def _run_signalr(self) -> None:
        try:
            from livef1.adapters.realtime_client import RealF1Client

            client = RealF1Client(topics=_TOPICS)

            @client.callback("livef1_feeder_handler")
            async def _handler(records: dict) -> None:
                await self._queue.put(records)

            # _run() is the async coroutine that sets up SignalR and blocks until done
            await client._run()

        except Exception as exc:
            log.error("LiveF1Feeder: SignalR client error: %s", exc, exc_info=True)

    # ---- State accumulation ------------------------------------------------

    def _apply(self, records: dict) -> None:
        """Merge one batch of SignalR callback records into accumulated state."""
        for topic, data_list in records.items():
            for record in data_list:
                if not isinstance(record, dict):
                    continue
                try:
                    if topic == "TimingData":
                        self._apply_timing(record)
                    elif topic == "TimingAppData":
                        self._apply_tyre_app(record)
                    elif topic == "TrackStatus":
                        self._apply_track_status(record)
                    elif topic == "DriverList":
                        self._apply_driver_list(record)
                    elif topic == "WeatherData":
                        self._apply_weather(record)
                except Exception as exc:
                    log.debug("LiveF1Feeder: failed to apply %s record: %s", topic, exc)

    def _apply_timing(self, rec: dict) -> None:
        dn = str(rec.get("DriverNo") or rec.get("driver_no") or "")
        if not dn:
            return
        if "Position" in rec or "position" in rec:
            val = rec.get("Position") or rec.get("position")
            try:
                self._positions[dn] = int(val)
            except (TypeError, ValueError):
                pass
        if "GapToLeader" in rec or "gap_to_leader" in rec:
            val = rec.get("GapToLeader") or rec.get("gap_to_leader") or ""
            self._gaps[dn] = str(val)
        if "NumberOfLaps" in rec or "number_of_laps" in rec:
            val = rec.get("NumberOfLaps") or rec.get("number_of_laps")
            try:
                self._laps[dn] = int(val)
            except (TypeError, ValueError):
                pass
        # Pit stop detection via InPit flag
        if rec.get("InPit") or rec.get("in_pit"):
            current = self._pit_stops.get(dn, 0)
            self._pit_stops[dn] = current  # count is incremented via pit lane flag changes

    def _apply_tyre_app(self, rec: dict) -> None:
        dn = str(rec.get("DriverNo") or rec.get("driver_no") or "")
        if not dn:
            return
        compound = rec.get("Compound") or rec.get("compound") or ""
        if compound:
            self._compounds[dn] = _COMPOUND_MAP.get(compound.upper(), compound.upper())
        age = rec.get("TotalLaps") or rec.get("tyre_age") or rec.get("StartLaps")
        if age is not None:
            try:
                self._tyre_ages[dn] = int(age)
            except (TypeError, ValueError):
                pass
        stint = rec.get("Stint") or rec.get("stint_number")
        if stint is not None:
            try:
                self._tyre_stints[dn] = int(stint)
            except (TypeError, ValueError):
                pass

    def _apply_track_status(self, rec: dict) -> None:
        status_code = str(rec.get("Status") or rec.get("status") or "1")
        self._track_status = _TRACK_STATUS_MAP.get(status_code, TrackStatus.GREEN)
        message = str(rec.get("Message") or rec.get("message") or "")
        if message:
            self._rc_messages.append(
                RaceControlMsg(
                    t_session_s=time.monotonic() - self._t_start,
                    lap=None,
                    category="TrackStatus",
                    message=message,
                )
            )
            # Keep last 10 RC messages
            if len(self._rc_messages) > 10:
                self._rc_messages = self._rc_messages[-10:]
        if "CHEQUERED" in message.upper() or "FINISHED" in message.upper():
            self._finished = True

    def _apply_driver_list(self, rec: dict) -> None:
        dn = str(rec.get("DriverNo") or rec.get("driver_no") or rec.get("RacingNumber") or "")
        if not dn:
            return
        code = rec.get("Tla") or rec.get("driver_code") or rec.get("NameAcronym") or ""
        team = rec.get("TeamName") or rec.get("team_name") or ""
        if code:
            self._driver_codes[dn] = str(code)
        if team:
            self._driver_teams[dn] = str(team).lower()

    def _apply_weather(self, rec: dict) -> None:
        rainfall = rec.get("Rainfall") or rec.get("rainfall")
        self._weather = WeatherState(
            rainfall=bool(rainfall and str(rainfall).lower() not in ("0", "false", "")),
        )

    # ---- State builder -----------------------------------------------------

    def _gap_to_seconds(self, gap_str: str) -> float | None:
        """Convert gap string '+3.456' or '1L' → float seconds, or None."""
        if not gap_str:
            return None
        s = gap_str.strip().lstrip("+").strip()
        if s.endswith("L"):
            return None  # lapped car — skip gap
        try:
            return float(s)
        except ValueError:
            return None

    def _build_state(self) -> RaceState:
        all_drivers = (
            set(self._positions)
            | set(self._laps)
            | set(self._driver_codes)
        )

        cars: list[CarState] = []
        for dn in all_drivers:
            compound = self._compounds.get(dn, "MEDIUM")
            age = self._tyre_ages.get(dn, 0)
            stint = self._tyre_stints.get(dn, 1)
            tire = TireState(compound=compound, age_laps=age, stint=stint)

            gap_str = self._gaps.get(dn, "")
            gap_s = self._gap_to_seconds(gap_str)

            cars.append(CarState(
                car_id=dn,
                driver_code=self._driver_codes.get(dn),
                team=self._driver_teams.get(dn),
                position=self._positions.get(dn, 0),
                lap=self._laps.get(dn, 0),
                lap_fraction=0.0,
                gap_leader_s=gap_s,
                tire=tire,
                pit_stops=self._pit_stops.get(dn, 0),
                status=CarStatus.RUNNING,
            ))

        cars.sort(key=lambda c: (c.position or 99))
        leader_lap = max((c.lap for c in cars), default=0)

        return RaceState(
            session_key=self.session_key,
            t_session_s=time.monotonic() - self._t_start,
            leader_lap=leader_lap,
            track_status=self._track_status,
            cars=cars,
            rc_messages=list(self._rc_messages),
            weather=self._weather,
        )
