"""Deterministic dev fixture feeder.

Provides a replay-like but self-contained stream so the UI can be exercised when
there is no live race and no archive downloaded locally.
"""

from __future__ import annotations

import asyncio
import math
import time
from collections.abc import AsyncIterator

from f1_strategy.models.race_state import (
    CarState,
    RaceControlMsg,
    RaceState,
    TireState,
    TrackStatus,
    WeatherState,
)

_GRID = [
    ("1", "VER", "red-bull", "1A225D"),
    ("4", "NOR", "mclaren", "FF8700"),
    ("16", "LEC", "ferrari", "DC0000"),
    ("81", "PIA", "mclaren", "FF8700"),
    ("63", "RUS", "mercedes", "27F4D2"),
    ("44", "HAM", "ferrari", "DC0000"),
    ("14", "ALO", "aston-martin", "229971"),
    ("55", "SAI", "williams", "1868DB"),
    ("22", "TSU", "rb", "6692FF"),
    ("27", "HUL", "sauber", "00E701"),
]
_TOTAL_LAPS = 57
_TRACK_LENGTH_M = 5412.0


def _driver_list() -> dict[str, dict]:
    return {
        car_id: {
            "RacingNumber": car_id,
            "BroadcastName": code,
            "Tla": code,
            "TeamName": team.replace("-", " ").title(),
            "TeamColour": color,
        }
        for car_id, code, team, color in _GRID
    }


class FixtureFeeder:
    is_live: bool = False

    def __init__(self, session_key: str) -> None:
        self.session_key = session_key
        self._frame = 0
        self._max_frames = 240
        self._started = time.monotonic()
        self._playing = True
        self._speed = 1.0
        self._state = self._build_state(frame=0)

    async def ticks(self) -> AsyncIterator[RaceState]:
        while True:
            if self._playing:
                self._frame = (self._frame + 1) % self._max_frames
                self._state = self._build_state(self._frame)
            yield self._state
            await asyncio.sleep(max(0.1, 1.0 / max(self._speed, 1.0)))

    def current_state(self) -> RaceState | None:
        return self._state

    def status(self) -> dict:
        return {
            "session_key": self.session_key,
            "source": "fixture",
            "playing": self._playing,
            "speed": self._speed,
            "t_session_s": round(self._state.t_session_s, 3),
            "finished": False,
        }

    def play(self) -> None:
        self._playing = True

    def pause(self) -> None:
        self._playing = False

    def set_speed(self, speed: float) -> None:
        self._speed = min(max(float(speed), 0.25), 8.0)

    def seek_lap(self, lap: int) -> None:
        target = min(max(lap - 1, 0), _TOTAL_LAPS - 1)
        frame = int((target / max(_TOTAL_LAPS - 1, 1)) * (self._max_frames - 1))
        self._frame = frame
        self._state = self._build_state(self._frame)

    def _build_state(self, frame: int) -> RaceState:
        phase = frame / self._max_frames
        leader_lap = min(_TOTAL_LAPS, 1 + int(phase * (_TOTAL_LAPS - 1)))
        lap_progress = (phase * _TOTAL_LAPS) % 1.0
        t_session_s = frame * 4.25
        driver_list = _driver_list()
        cars: list[CarState] = []
        live_timing: dict[str, dict] = {}
        live_timing_app: dict[str, dict] = {}
        live_timing_stats: dict[str, dict] = {}
        radio: list[dict] = []

        for index, (car_id, code, team, _color) in enumerate(_GRID, start=1):
            gap = round((index - 1) * 2.15 + math.sin(phase * 8 + index) * 0.35, 3)
            interval = None if index == 1 else round(2.05 + math.cos(phase * 5 + index) * 0.28, 3)
            progress = (lap_progress - index * 0.021) % 1.0
            theta = (progress * math.tau) - math.pi / 2
            x = round(math.cos(theta) * 2100 + math.sin(theta * 2.2) * 180, 2)
            y = round(math.sin(theta) * 1180 + math.cos(theta * 1.4) * 120, 2)
            compound = "MEDIUM" if leader_lap < 18 else "HARD" if leader_lap < 39 else "SOFT"
            tire_age = (leader_lap - 1) % 20 + (index % 3)
            last_lap_ms = 91100 + (index * 73) + int(math.sin(phase * 9 + index) * 210)
            best_lap_ms = 90200 + (index * 51)
            cars.append(
                CarState(
                    car_id=car_id,
                    driver_code=code,
                    team=team,
                    position=index,
                    lap=leader_lap,
                    lap_fraction=round(progress, 4),
                    gap_leader_s=0.0 if index == 1 else gap,
                    interval_s=interval,
                    last_lap_ms=last_lap_ms,
                    best_lap_ms=best_lap_ms,
                    tire=TireState(
                        compound=compound, age_laps=tire_age, stint=1 + leader_lap // 18
                    ),
                    pit_stops=0 if leader_lap < 18 else 1 if leader_lap < 39 else 2,
                    x=x,
                    y=y,
                )
            )
            live_timing[car_id] = {
                "Position": index,
                "NumberOfLaps": leader_lap,
                "GapToLeader": "Leader" if index == 1 else f"+{gap:.3f}",
                "IntervalToPositionAhead": {"Value": None if index == 1 else f"+{interval:.3f}"},
                "LastLapTime": {"Value": f"1:{(last_lap_ms / 1000):06.3f}"[-8:]},
                "BestLapTime": {"Value": f"1:{(best_lap_ms / 1000):06.3f}"[-8:]},
                "Sectors": {
                    "0": {"Segments": {"0": {"Status": 2049}, "1": {"Status": 2049}}},
                    "1": {"Segments": {
                        "0": {"Status": 2049},
                        "1": {"Status": 1 if progress < 0.66 else 2049},
                    }},
                    "2": {"Segments": {"0": {"Status": 0}, "1": {"Status": 0}}},
                },
                "InPit": False,
            }
            live_timing_app[car_id] = {
                "Stints": {
                    "0": {
                        "Compound": compound, "TotalLaps": tire_age,
                        "New": "false", "StartLaps": 1,
                    }
                }
            }
            live_timing_stats[car_id] = {
                "BestSpeeds": {
                    "St": {"Value": 331 - index},
                    "I1": {"Value": 287 - index},
                    "I2": {"Value": 302 - index},
                    "Fl": {"Value": 324 - index},
                }
            }
            if frame % 36 == 0 and index <= 3:
                radio.append(
                    {
                        "Utc": f"2026-06-23T12:{(frame // 36) % 60:02d}:00Z",
                        "RacingNumber": car_id,
                        "Path": f"/fixture/radio/{car_id}/{frame}",
                        "Message": f"{code}, box this lap. Tyres look good, copy.",
                    }
                )

        rc_messages = []
        track_status = TrackStatus.GREEN
        if 72 <= frame < 88:
            track_status = TrackStatus.YELLOW_ZONE
            rc_messages.append(
                RaceControlMsg(
                    t_session_s=t_session_s,
                    lap=leader_lap,
                    category="Flag",
                    message="YELLOW IN SECTOR 2 — DEV FIXTURE INCIDENT",
                )
            )
        elif 150 <= frame < 172:
            track_status = TrackStatus.SC
            rc_messages.append(
                RaceControlMsg(
                    t_session_s=t_session_s,
                    lap=leader_lap,
                    category="SafetyCar",
                    message="SAFETY CAR DEPLOYED — DEV FIXTURE",
                )
            )

        return RaceState(
            session_key=self.session_key,
            t_session_s=t_session_s,
            leader_lap=leader_lap,
            total_laps=_TOTAL_LAPS,
            track_status=track_status,
            cars=cars,
            weather=WeatherState(
                air_temp_c=31.2, track_temp_c=44.8, humidity_pct=52.0, wind_speed_ms=4.6
            ),
            rc_messages=rc_messages,
            driver_list=driver_list,
            live_timing=live_timing,
            live_timing_session_part=None,
            live_timing_app=live_timing_app,
            live_timing_stats=live_timing_stats,
            extrapolated_clock={
                "Utc": None,
                "Remaining": f"{max(0, int((_TOTAL_LAPS - leader_lap) * 90)):02d}:00",
                "Extrapolating": True,
            },
            championship=None,
            lap_count={"CurrentLap": leader_lap, "TotalLaps": _TOTAL_LAPS},
            team_radio_captures=radio or None,
            session_info={
                "Name": "Dev Fixture Grand Prix",
                "Path": "dev-fixture",
                "Meeting": {"Circuit": {"Key": 149, "ShortName": "Fixture Ring"}},
                "Type": "Race",
            },
        )
