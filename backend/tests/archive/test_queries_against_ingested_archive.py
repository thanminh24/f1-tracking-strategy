"""Archive query tests against the real ingested lake.
Skipped when 2024_1_R hasn't been ingested (run `f1-ingest --year 2024 --round 1`)."""

import pytest

from f1_strategy.archive import analytics, queries
from f1_strategy.config import get_settings

BAHRAIN_24 = "2024_1_R"

pytestmark = pytest.mark.skipif(
    not (get_settings().parquet_dir / "laps").exists(),
    reason="parquet archive not ingested yet",
)


def test_list_seasons_contains_2024():
    assert 2024 in queries.list_seasons()


def test_bahrain_2024_known_facts():
    """Validate against published results: VER (car 1) won, 57 laps, 20 classified."""
    results = queries.get_results(BAHRAIN_24)
    assert len(results) == 20
    winner = results[results["position"] == 1].iloc[0]
    assert winner["car_id"] == "1" and winner["driver_code"] == "VER"

    laps = queries.get_laps(BAHRAIN_24)
    assert laps["lap_number"].max() == 57
    assert laps["car_id"].nunique() == 20


def test_stints_and_pits_consistent():
    stints = queries.get_stints(BAHRAIN_24)
    pits = queries.get_pit_stops(BAHRAIN_24)
    # every car has stints; stop count = stints - 1 per car (no red flags in that race)
    per_car_stints = stints.groupby("car_id").size()
    per_car_pits = pits.groupby("car_id").size()
    for car, n_stints in per_car_stints.items():
        if car in per_car_pits.index:
            assert per_car_pits[car] <= n_stints  # in-lap without out-lap possible on retirement


def test_deg_dataset_filters_dirty_laps():
    df = analytics.stint_deg_dataset(circuit="Sakhir")
    assert not df.empty
    assert (df["lap_time_ms"] > 80000).all()  # no pit-affected short/zero laps
    assert {"compound", "tire_age", "in_traffic", "season"} <= set(df.columns)
    # clean laps < all timed laps for the same circuit across all seasons
    from f1_strategy.archive.db import query_df
    all_sakhir = query_df(
        "SELECT lap_time_ms FROM laps l JOIN sessions s USING (session_key) "
        "WHERE s.circuit = 'Sakhir' AND s.session_type = 'R'"
    )
    assert len(df) < all_sakhir["lap_time_ms"].notna().sum()


def test_pit_loss_estimate_sane():
    df = analytics.pit_loss_per_track()
    bahrain = df[(df["circuit"] == "Sakhir") & (df["season"] == 2024)]
    assert len(bahrain) == 1
    # Bahrain pit loss (entry→exit) is ~20-30s territory
    assert 15000 < bahrain.iloc[0]["median_pit_ms"] < 40000
