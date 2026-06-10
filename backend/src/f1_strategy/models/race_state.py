"""Core race-state models shared by ingestion, replay, sim, and API.

Series-agnostic invariants: variable car count (never assume 20), optional
multi-class / refueling fields, extensible track-status values. Do not add
F1-only assumptions here — put those in F1-specific adapters instead.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class CarStatus(StrEnum):
    RUNNING = "running"
    PITTING = "pitting"  # on in-lap or out-lap
    IN_PIT = "in_pit"
    OUT = "out"  # retired / DSQ
    FINISHED = "finished"


class TrackStatus(StrEnum):
    """Extensible track condition. WEC-style additions (slow zone, FCY) welcome."""

    GREEN = "green"
    YELLOW_ZONE = "yellow_zone"
    VSC = "vsc"
    SC = "sc"
    RED = "red"


class TireState(BaseModel):
    compound: str  # free string ("SOFT", "MEDIUM", ...) — not enum-locked across series
    age_laps: int = 0
    stint: int = 1


class RaceControlMsg(BaseModel):
    t_session_s: float
    lap: int | None = None
    category: str  # e.g. "Flag", "SafetyCar", "Other"
    message: str


class WeatherState(BaseModel):
    air_temp_c: float | None = None
    track_temp_c: float | None = None
    humidity_pct: float | None = None
    rainfall: bool | None = None
    wind_speed_ms: float | None = None


class CarState(BaseModel):
    car_id: str  # driver/car number as string (series-agnostic key)
    driver_code: str | None = None  # e.g. "VER"
    team: str | None = None
    position: int
    lap: int
    lap_fraction: float = Field(0.0, ge=0.0, le=1.0)  # progress within current lap
    gap_leader_s: float | None = None
    interval_s: float | None = None
    last_lap_ms: int | None = None
    best_lap_ms: int | None = None
    tire: TireState | None = None
    pit_stops: int = 0
    status: CarStatus = CarStatus.RUNNING
    # Series extensions — None for F1:
    car_class: str | None = None  # multi-class series (Hypercar/LMGT3...)
    fuel_state: dict | None = None  # refueling series


class RaceState(BaseModel):
    """One tick of session state. The unit streamed by LiveSource implementations."""

    session_key: str  # "{year}_{round}_{session}" e.g. "2024_1_R"
    t_session_s: float
    leader_lap: int
    total_laps: int | None = None  # None for time-certain races
    track_status: TrackStatus = TrackStatus.GREEN
    cars: list[CarState]  # variable length — series-agnostic
    weather: WeatherState | None = None
    rc_messages: list[RaceControlMsg] = Field(default_factory=list)  # new since last tick
