"""Model validation: serialization round-trips and series-agnostic guarantees."""

from f1_strategy.models import (
    CarState,
    CarStatus,
    RaceState,
    TireState,
    TrackStatus,
    make_session_key,
)


def _car(n: int, car_class: str | None = None, fuel: dict | None = None) -> CarState:
    return CarState(
        car_id=str(n),
        position=n,
        lap=10,
        tire=TireState(compound="MEDIUM", age_laps=5, stint=1),
        car_class=car_class,
        fuel_state=fuel,
    )


def make_state(n_cars: int, **car_kwargs) -> RaceState:
    return RaceState(
        session_key=make_session_key(2024, 1, "R"),
        t_session_s=1234.5,
        leader_lap=10,
        total_laps=57,
        track_status=TrackStatus.GREEN,
        cars=[_car(i + 1, **car_kwargs) for i in range(n_cars)],
    )


def test_f1_grid_round_trip():
    state = make_state(22)
    restored = RaceState.model_validate_json(state.model_dump_json())
    assert restored == state
    assert len(restored.cars) == 22


def test_multiclass_60_car_grid_round_trip():
    """Series-agnostic proof: 60 cars, classes, fuel state — schema must not care."""
    state = make_state(60, car_class="HYPERCAR", fuel={"level_l": 60.0, "max_l": 90.0})
    restored = RaceState.model_validate_json(state.model_dump_json())
    assert len(restored.cars) == 60
    assert restored.cars[0].car_class == "HYPERCAR"
    assert restored.cars[0].fuel_state == {"level_l": 60.0, "max_l": 90.0}


def test_optional_fields_default_none():
    state = make_state(1)
    car = state.cars[0]
    assert car.car_class is None
    assert car.fuel_state is None
    assert car.gap_leader_s is None
    assert car.status == CarStatus.RUNNING
    assert state.weather is None
    assert state.rc_messages == []


def test_session_key_format():
    assert make_session_key(2025, 12, "Q") == "2025_12_Q"


def test_track_status_values_extensible_strings():
    # str-enum so future series can compare/serialize as plain strings
    assert TrackStatus.SC.value == "sc"
    assert RaceState.model_validate(
        make_state(2).model_dump() | {"track_status": "vsc"}
    ).track_status == TrackStatus.VSC
