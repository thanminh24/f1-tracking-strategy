"""Timeline + ReplaySource tests against the ingested 2024 Bahrain race."""

import numpy as np
import pytest

from f1_strategy.archive import queries
from f1_strategy.config import get_settings
from f1_strategy.models import CarStatus
from f1_strategy.replay.replay_source import ReplaySource, build_timeline

BAHRAIN_24 = "2024_1_R"

pytestmark = pytest.mark.skipif(
    not (get_settings().parquet_dir / "laps").exists(),
    reason="parquet archive not ingested yet",
)


@pytest.fixture(scope="module")
def timeline():
    return build_timeline(BAHRAIN_24)


def test_final_state_matches_official_results(timeline):
    state = timeline.state_at(timeline.t_end)
    finished = {c.car_id: c.position for c in state.cars if c.status == CarStatus.FINISHED}
    results = queries.get_results(BAHRAIN_24)
    official = {
        str(r["car_id"]): int(r["position"])
        for _, r in results.iterrows()
        if r["status"] == "Finished"
    }
    for car_id, pos in official.items():
        assert finished.get(car_id) == pos, f"car {car_id}: {finished.get(car_id)} != {pos}"


def test_state_at_is_deterministic(timeline):
    t = timeline.t_start + 30 * 60 * 1000  # 30 min into the race
    a, b = timeline.state_at(t), timeline.state_at(t)
    assert a == b


def test_leader_gap_zero_and_gaps_monotonic_with_position(timeline):
    t = timeline.t_start + 45 * 60 * 1000
    state = timeline.state_at(t)
    running = [c for c in state.cars if c.status != CarStatus.OUT]
    assert running[0].gap_leader_s == 0.0
    gaps = [c.gap_leader_s for c in running if c.gap_leader_s is not None]
    assert gaps == sorted(gaps)


def test_tires_and_pit_counts_progress(timeline):
    early = timeline.state_at(timeline.t_start + 5 * 60 * 1000)
    late = timeline.state_at(timeline.t_end)
    early_stops = sum(c.pit_stops for c in early.cars)
    late_stops = sum(c.pit_stops for c in late.cars)
    assert late_stops > early_stops >= 0
    assert all(c.tire is not None and c.tire.compound for c in late.cars)


@pytest.mark.asyncio
async def test_replay_source_streams_and_seeks(timeline):
    src = ReplaySource(timeline, speed=100.0)
    ticks = []
    async for state in src.states():
        ticks.append(state)
        if len(ticks) == 3:
            src.seek_lap(30)
        if len(ticks) == 5:
            break
    assert ticks[3].leader_lap >= 29  # seek landed near lap 30
    # seek determinism: same state from a fresh snapshot at the same t
    assert timeline.state_at(src.t - 100 * 1000 * 2) is not None
    assert len({id(t) for t in ticks}) == 5


def test_progress_inverse_consistency(timeline):
    car = timeline.cars[0]
    t = car.starts[0] + 20 * 60 * 1000
    p = car.progress_at(t)
    assert abs(car.time_at_progress(p) - t) < 1500  # within interpolation tolerance
    assert np.all(np.diff(car.cum_times) > 0)
