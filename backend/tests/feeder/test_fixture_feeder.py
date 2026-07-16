import pytest

from f1_strategy.feeder.fixture_feeder import FixtureFeeder
from f1_strategy.feeder.session_registry import FeederRegistry


@pytest.mark.asyncio
async def test_fixture_feeder_is_deterministic_from_same_seedless_start():
    left = FixtureFeeder("fixture")
    right = FixtureFeeder("fixture")

    left_tick = left.ticks()
    right_tick = right.ticks()

    first_left = await anext(left_tick)
    first_right = await anext(right_tick)
    second_left = await anext(left_tick)
    second_right = await anext(right_tick)

    assert first_left.model_dump() == first_right.model_dump()
    assert second_left.model_dump() == second_right.model_dump()
    assert second_left.cars[0].lap_fraction == second_right.cars[0].lap_fraction


@pytest.mark.asyncio
async def test_fixture_registry_source_boots_fixture_feeder():
    registry = FeederRegistry()
    registry.set_source("fixture", "fixture")
    session = registry.get_or_create("fixture")

    assert session.feeder.session_key == "fixture"
    assert session.feeder.status()["source"] == "fixture"
    if session.pump_task is not None:
        session.pump_task.cancel()


def test_fixture_session_key_defaults_to_fixture_source():
    registry = FeederRegistry()
    assert registry.get_source("fixture") == "fixture"
    assert registry.get_source("live") == "livef1"


@pytest.mark.asyncio
async def test_fixture_get_or_create_without_explicit_set_source():
    registry = FeederRegistry()
    session = registry.get_or_create("fixture")

    assert session.feeder.status()["source"] == "fixture"
    if session.pump_task is not None:
        session.pump_task.cancel()
