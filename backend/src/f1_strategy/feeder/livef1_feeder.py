"""LiveF1Feeder: real-time F1 data via SignalR Core (livetiming.formula1.com/signalrcore).

No authentication or F1TV subscription required — only the free public timing endpoint.
Implements the same IFeeder protocol as ArchiveFeeder so it's a drop-in replacement.

Data flow:
  SignalRCore → on_snapshot/on_update callbacks → asyncio.Queue
  → _apply() handler → accumulated per-driver state + raw topic state
  → _build_state() → RaceState (broadcast to WebSocket clients)
"""

import asyncio
import logging
import re
import time
from collections import defaultdict, deque
from collections.abc import AsyncIterator
from typing import Any

from f1_strategy.feeder.signalr_core_client import merge
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

_LAPS_REMAINING_RE = re.compile(r"(\d+)\s+LAPS?\s+REMAINING", re.IGNORECASE)

_TRACK_STATUS_MAP: dict[str, TrackStatus] = {
    "1": TrackStatus.GREEN,
    "2": TrackStatus.YELLOW_ZONE,
    "3": TrackStatus.YELLOW_ZONE,
    "4": TrackStatus.SC,
    "5": TrackStatus.RED,
    "6": TrackStatus.VSC,
    "7": TrackStatus.VSC,
}

_COMPOUND_MAP: dict[str, str] = {
    "SOFT": "SOFT", "MEDIUM": "MEDIUM", "HARD": "HARD",
    "INTERMEDIATE": "INTER", "WET": "WET",
    "HYPERSOFT": "SOFT", "ULTRASOFT": "SOFT", "SUPERSOFT": "SOFT",
    "SUPERHARD": "HARD",
}


class LiveF1Feeder:
    """IFeeder backed by F1 official SignalR Core timing stream (no auth required)."""

    is_live: bool = True

    def __init__(self, session_key: str) -> None:
        self.session_key = session_key

        # Per-driver accumulated state
        self._positions: dict[str, int] = {}
        self._gaps: dict[str, str] = {}
        self._intervals: dict[str, str] = {}
        self._laps: dict[str, int] = {}
        self._last_laps: dict[str, int] = {}
        self._best_laps: dict[str, int] = {}
        self._compounds: dict[str, str] = {}
        self._tyre_ages: dict[str, int] = {}
        self._tyre_stints: dict[str, int] = {}
        self._pit_stops: dict[str, int] = {}
        self._was_in_pit: dict[str, bool] = {}
        self._driver_codes: dict[str, str] = {}
        self._driver_teams: dict[str, str] = {}
        self._positions_xy: dict[str, tuple[float, float]] = {}
        self._telemetry: dict[str, deque] = defaultdict(lambda: deque(maxlen=300))

        # Session state
        self._track_status: TrackStatus = TrackStatus.GREEN
        self._weather: WeatherState = WeatherState()
        self._rc_messages: list[RaceControlMsg] = []
        self._rc_msg_count: int = 0
        self._total_laps: int | None = None
        self._finished: bool = False
        # Guard: ignore "SESSION ENDED/CHEQUERED" in the historical snapshot;
        # those messages belong to prior sessions and must not terminate this feeder.
        self._snapshot_processed: bool = False

        # Full merged topic state — surfaced as extended live fields in RaceState
        self._raw_state: dict[str, Any] = {}

        # Session identity for reconnect-on-change
        self._session_name: str = ""
        self._session_changed: bool = False

        self._state: RaceState | None = None
        self._queue: asyncio.Queue = asyncio.Queue(maxsize=500)
        self._t_start: float = 0.0
        self._bg_task: asyncio.Task | None = None

    # ── IFeeder interface ────────────────────────────────────────────────────

    async def ticks(self) -> AsyncIterator[RaceState]:
        self._t_start = time.monotonic()

        while not self._finished:
            self._session_changed = False
            self._bg_task = asyncio.create_task(self._run_signalr_core())
            log.info("LiveF1Feeder: SignalR Core task started for %s", self.session_key)

            try:
                while not self._finished and not self._session_changed:
                    deadline = asyncio.get_event_loop().time() + 1.0
                    while True:
                        remaining = deadline - asyncio.get_event_loop().time()
                        if remaining <= 0:
                            break
                        try:
                            msg = await asyncio.wait_for(
                                self._queue.get(), timeout=remaining
                            )
                            self._apply(msg)
                        except TimeoutError:
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

            if self._session_changed and not self._finished:
                log.info("LiveF1Feeder: session changed, reconnecting in 3s")
                await asyncio.sleep(3.0)

        # Session ended — keep streaming last known state so WebSocket stays open
        # and clients see final standings. Pump is cancelled when last client disconnects.
        log.info("LiveF1Feeder: session finished, holding final state for %s", self.session_key)
        while True:
            if self._state is not None:
                yield self._state
            await asyncio.sleep(2.0)

    def current_state(self) -> RaceState | None:
        return self._state

    def status(self) -> dict:
        return {
            "source": "livef1_signalr_core",
            "playing": True,
            "speed": 1.0,
            "t_session_s": self._state.t_session_s if self._state else 0.0,
            "finished": self._finished,
        }

    def play(self) -> None: pass
    def pause(self) -> None: pass
    def set_speed(self, _: float) -> None: pass
    def seek_lap(self, _: int) -> None: pass

    @property
    def finished(self) -> bool:
        return self._finished

    def get_telemetry(self) -> dict[str, list[dict]]:
        return {dn: list(buf) for dn, buf in self._telemetry.items() if buf}

    # ── SignalR Core background task ─────────────────────────────────────────

    async def _run_signalr_core(self) -> None:
        from f1_strategy.feeder.signalr_core_client import listen as signalr_listen

        async def on_snapshot(snapshot: dict) -> None:
            await self._queue.put({"_type": "snapshot", "data": snapshot})

        async def on_update(topic: str, delta: Any, utc: str) -> None:
            await self._queue.put({"_type": "update", "topic": topic, "delta": delta})

        try:
            await signalr_listen(on_snapshot, on_update)
        except Exception as exc:
            log.error("LiveF1Feeder: SignalR Core error: %s", exc, exc_info=True)

    # ── State accumulation ───────────────────────────────────────────────────

    def _apply(self, msg: dict) -> None:
        msg_type = msg.get("_type")
        if msg_type == "snapshot":
            snapshot: dict = msg["data"]
            for topic, data in snapshot.items():
                self._raw_state[topic] = data
            for topic, data in snapshot.items():
                self._apply_topic(topic, data, is_snapshot=True)
            self._snapshot_processed = True

        elif msg_type == "update":
            topic: str = msg["topic"]
            delta: Any = msg["delta"]
            if topic not in self._raw_state:
                # For .z topics the initial delta may be a bare list; store it as-is
                self._raw_state[topic] = delta if isinstance(delta, (dict, list)) else {}
            else:
                self._raw_state[topic] = merge(self._raw_state[topic], delta)
            self._apply_topic(topic, self._raw_state[topic], is_snapshot=False)

    def _apply_topic(self, topic: str, data: Any, is_snapshot: bool) -> None:  # noqa: ARG002
        # .z topics arrive as list (bare frame list) on updates but dict on snapshot;
        # handle both here and bail early only for non-dict other topics
        if not isinstance(data, (dict, list)):
            return
        try:
            # Non-.z topics always send dicts; skip list payloads for them
            if isinstance(data, list) and not topic.endswith(".z"):
                return
            if topic == "TimingData":
                for dn, rec in (data.get("Lines") or {}).items():
                    if isinstance(rec, dict):
                        self._apply_timing_driver(str(dn), rec)

            elif topic == "TimingAppData":
                for dn, rec in (data.get("Lines") or {}).items():
                    if isinstance(rec, dict):
                        self._apply_tyre_driver(str(dn), rec)

            elif topic == "TrackStatus":
                self._apply_track_status(data)

            elif topic == "DriverList":
                for dn, rec in data.items():
                    if isinstance(rec, dict):
                        self._apply_driver(str(dn), rec)

            elif topic == "WeatherData":
                self._apply_weather(data)

            elif topic == "RaceControlMessages":
                full_msgs = data.get("Messages") or []
                if isinstance(full_msgs, list):
                    for m in full_msgs[self._rc_msg_count:]:
                        if isinstance(m, dict):
                            self._apply_race_control_msg(m)
                    self._rc_msg_count = len(full_msgs)

            elif topic == "Position.z":
                self._apply_position_z(data)

            elif topic == "CarData.z":
                self._apply_cardata_z(data)

            elif topic == "LapCount":
                tc = data.get("TotalLaps")
                if tc is not None:
                    try:
                        self._total_laps = int(tc)
                    except (ValueError, TypeError):
                        pass

            elif topic == "SessionInfo":
                self._apply_session_info(data)

        except Exception as exc:
            log.debug("LiveF1Feeder: apply_topic %s failed: %s", topic, exc)

    # ── Per-topic handlers ───────────────────────────────────────────────────

    @staticmethod
    def _parse_laptime(val: object) -> int | None:
        if val is None:
            return None
        s = str(val).strip()
        if not s or s in ("---", "--", ""):
            return None
        try:
            if ":" in s:
                mins, secs = s.split(":", 1)
                return int(float(mins) * 60_000 + float(secs) * 1_000)
            return int(float(s) * 1_000)
        except (ValueError, TypeError):
            return None

    @staticmethod
    def _nested(rec: dict, *keys: str) -> Any:
        v: Any = rec
        for k in keys:
            if not isinstance(v, dict):
                return None
            v = v.get(k)
        return v

    def _apply_timing_driver(self, dn: str, rec: dict) -> None:
        pos = rec.get("Position")
        if pos is not None:
            try:
                self._positions[dn] = int(pos)
            except (ValueError, TypeError):
                pass

        gap = rec.get("GapToLeader") or ""
        if gap:
            self._gaps[dn] = str(gap)

        interval = (
            self._nested(rec, "IntervalToPositionAhead", "Value")
            or rec.get("GapToNext")
            or ""
        )
        if interval:
            self._intervals[dn] = str(interval)

        laps = rec.get("NumberOfLaps")
        if laps is not None:
            try:
                self._laps[dn] = int(laps)
            except (ValueError, TypeError):
                pass

        last_val = self._nested(rec, "LastLapTime", "Value") or rec.get("LastLapTime")
        if last_val and not isinstance(last_val, dict):
            ms = self._parse_laptime(last_val)
            if ms:
                self._last_laps[dn] = ms

        best_val = self._nested(rec, "BestLapTime", "Value") or rec.get("BestLapTime")
        if best_val and not isinstance(best_val, dict):
            ms = self._parse_laptime(best_val)
            if ms:
                self._best_laps[dn] = ms

        in_pit = rec.get("InPit")
        if in_pit is not None:
            in_pit_now = in_pit is True or in_pit == 1
            was = self._was_in_pit.get(dn, False)
            if in_pit_now and not was:
                self._pit_stops[dn] = self._pit_stops.get(dn, 0) + 1
            self._was_in_pit[dn] = in_pit_now

    def _apply_tyre_driver(self, dn: str, rec: dict) -> None:
        stints = rec.get("Stints") or {}
        items = list(stints.items()) if isinstance(stints, dict) else list(enumerate(stints))
        if not items:
            return
        try:
            latest_idx, latest = max(items, key=lambda kv: int(kv[0]))
        except (ValueError, TypeError):
            return
        if not isinstance(latest, dict):
            return
        compound = latest.get("Compound") or ""
        if compound:
            self._compounds[dn] = _COMPOUND_MAP.get(compound.upper(), compound.upper())
        age = latest.get("TotalLaps")
        if age is not None:
            try:
                self._tyre_ages[dn] = int(age)
            except (ValueError, TypeError):
                pass
        try:
            self._tyre_stints[dn] = int(latest_idx) + 1
        except (ValueError, TypeError):
            pass

    def _apply_track_status(self, data: dict) -> None:
        code = str(data.get("Status") or "1")
        self._track_status = _TRACK_STATUS_MAP.get(code, TrackStatus.GREEN)
        msg = str(data.get("Message") or "")
        if self._snapshot_processed and (
            "CHEQUERED" in msg.upper() or "FINISHED" in msg.upper()
        ):
            self._finished = True

    def _apply_driver(self, dn: str, rec: dict) -> None:
        code = rec.get("Tla") or rec.get("NameAcronym") or ""
        team = rec.get("TeamName") or ""
        if code:
            self._driver_codes[dn] = str(code)
        if team:
            self._driver_teams[dn] = str(team).lower()

    def _apply_weather(self, data: dict) -> None:
        def _f(k: str) -> float | None:
            v = data.get(k)
            try:
                return float(v) if v is not None else None
            except (ValueError, TypeError):
                return None

        rainfall_raw = data.get("Rainfall")
        rainfall = bool(
            rainfall_raw and str(rainfall_raw) not in ("0", "false", "False", "")
        )
        self._weather = WeatherState(
            air_temp_c=_f("AirTemp"),
            track_temp_c=_f("TrackTemp"),
            humidity_pct=_f("Humidity"),
            rainfall=rainfall,
            wind_speed_ms=_f("WindSpeed"),
        )

    def _apply_race_control_msg(self, msg: dict) -> None:
        text = str(msg.get("Message") or "")
        if not text:
            return
        flag = str(msg.get("Flag") or "").upper()
        text_upper = text.upper()

        if "SAFETY CAR" in text_upper or flag in ("SC", "SAFETY CAR"):
            category = "SafetyCar"
        elif "VIRTUAL" in text_upper or flag == "VSC":
            category = "SafetyCar"
        elif flag in ("RED", "CHEQUERED", "GREEN", "YELLOW", "DOUBLE YELLOW"):
            category = "Flag"
        elif "DRS" in text_upper:
            category = "DRS"
        else:
            category = "Other"

        lap = msg.get("Lap")
        self._rc_messages.append(RaceControlMsg(
            t_session_s=time.monotonic() - self._t_start,
            lap=int(lap) if lap is not None and str(lap).isdigit() else None,
            category=category,
            message=text,
        ))
        if len(self._rc_messages) > 20:
            self._rc_messages = self._rc_messages[-20:]

        # Only mark finished from live updates, not from historical snapshot messages
        if self._snapshot_processed and (
            "CHEQUERED" in text_upper or "SESSION ENDED" in text_upper
        ):
            self._finished = True

        m = _LAPS_REMAINING_RE.search(text)
        if m and self._laps:
            remaining = int(m.group(1))
            leader_lap = max(self._laps.values(), default=0)
            self._total_laps = leader_lap + remaining

    def _apply_position_z(self, data) -> None:
        # Snapshot delivers {"Position": [frame, ...]}, update delivers bare [frame, ...]
        if isinstance(data, dict):
            frames = data.get("Position") or []
        elif isinstance(data, list):
            frames = data
        else:
            return
        for frame in frames:
            if not isinstance(frame, dict):
                continue
            entries = frame.get("Entries") or {}
            for dn, entry in entries.items():
                if not isinstance(entry, dict):
                    continue
                x, y = entry.get("X"), entry.get("Y")
                if x is not None and y is not None:
                    try:
                        self._positions_xy[str(dn)] = (float(x), float(y))
                    except (TypeError, ValueError):
                        pass

    def _apply_cardata_z(self, data) -> None:
        # Snapshot delivers {"Entries": [frame, ...]}, update delivers bare [frame, ...]
        if isinstance(data, dict):
            entries = data.get("Entries") or []
        elif isinstance(data, list):
            entries = data
        else:
            return
        now = time.monotonic() - self._t_start
        for frame in entries:
            if not isinstance(frame, dict):
                continue
            for dn, car in (frame.get("Cars") or {}).items():
                ch = car.get("Channels") or {} if isinstance(car, dict) else {}
                try:
                    self._telemetry[str(dn)].append({
                        "t":        now,
                        "rpm":      int(ch.get("0", 0)),   # channel 0 = RPM
                        "speed":    int(ch.get("2", 0)),   # channel 2 = speed km/h
                        "gear":     int(ch.get("3", 0)),   # channel 3 = gear
                        "throttle": int(ch.get("4", 0)),   # channel 4 = throttle %
                        "brake":    int(ch.get("5", 0)),   # channel 5 = brake %
                        "drs":      int(ch.get("45", 0)),  # channel 45 = DRS state
                    })
                except (TypeError, ValueError):
                    pass

    def _apply_session_info(self, data: dict) -> None:
        name = data.get("Name") or ""
        if name:
            if self._session_name and name != self._session_name:
                log.info(
                    "LiveF1Feeder: session name '%s'→'%s', reconnecting",
                    self._session_name, name,
                )
                self._session_name = name
                self._session_changed = True
            else:
                self._session_name = name

    # ── State builder ────────────────────────────────────────────────────────

    def _gap_to_seconds(self, gap: str) -> float | None:
        if not gap:
            return None
        s = gap.strip().lstrip("+").strip()
        if s.endswith("L"):
            return None
        try:
            return float(s)
        except ValueError:
            return None

    def _build_state(self) -> RaceState:
        all_drivers = set(self._positions) | set(self._laps) | set(self._driver_codes)
        cars: list[CarState] = []
        for dn in all_drivers:
            tire = TireState(
                compound=self._compounds.get(dn, "MEDIUM"),
                age_laps=self._tyre_ages.get(dn, 0),
                stint=self._tyre_stints.get(dn, 1),
            )
            xy = self._positions_xy.get(dn)
            cars.append(CarState(
                car_id=dn,
                driver_code=self._driver_codes.get(dn),
                team=self._driver_teams.get(dn),
                position=self._positions.get(dn, 0),
                lap=self._laps.get(dn, 0),
                lap_fraction=0.0,
                gap_leader_s=self._gap_to_seconds(self._gaps.get(dn, "")),
                interval_s=self._gap_to_seconds(self._intervals.get(dn, "")),
                last_lap_ms=self._last_laps.get(dn),
                best_lap_ms=self._best_laps.get(dn),
                tire=tire,
                pit_stops=self._pit_stops.get(dn, 0),
                status=CarStatus.RUNNING,
                x=xy[0] if xy else None,
                y=xy[1] if xy else None,
            ))
        cars.sort(key=lambda c: (c.position or 99))
        leader_lap = max((c.lap for c in cars), default=0)

        raw_td  = self._raw_state.get("TimingData") or {}
        raw_tad = self._raw_state.get("TimingAppData") or {}
        raw_ts  = self._raw_state.get("TimingStats") or {}
        raw_ec  = self._raw_state.get("ExtrapolatedClock") or {}
        raw_cp  = self._raw_state.get("ChampionshipPrediction") or {}
        raw_lc  = self._raw_state.get("LapCount") or {}
        raw_dl  = self._raw_state.get("DriverList") or {}
        raw_tr  = self._raw_state.get("TeamRadio") or {}
        raw_si  = self._raw_state.get("SessionInfo") or {}

        return RaceState(
            session_key=self.session_key,
            t_session_s=time.monotonic() - self._t_start,
            leader_lap=leader_lap,
            total_laps=self._total_laps,
            track_status=self._track_status,
            cars=cars,
            rc_messages=list(self._rc_messages),
            weather=self._weather,
            driver_list=raw_dl or None,
            live_timing=raw_td.get("Lines") or None,
            live_timing_session_part=raw_td.get("SessionPart"),
            live_timing_app=raw_tad.get("Lines") or None,
            live_timing_stats=raw_ts.get("Lines") or None,
            extrapolated_clock=raw_ec or None,
            championship=raw_cp or None,
            lap_count=raw_lc or None,
            team_radio_captures=(raw_tr.get("Captures") or None),
            session_info=raw_si or None,
        )
