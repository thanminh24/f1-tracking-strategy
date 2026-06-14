from f1_strategy.feeder.livef1_feeder import LiveF1Feeder


def test_estimate_lap_fraction_from_list_sectors():
    timing = {
        "Sectors": [
            {"Segments": [{"Status": 2049}, {"Status": 2049}]},
            {"Segments": [{"Status": 1}, {"Status": 0}]},
        ]
    }

    assert LiveF1Feeder._estimate_lap_fraction(timing) == 0.625


def test_estimate_lap_fraction_orders_dict_segments_numerically():
    timing = {
        "Sectors": {
            "0": {"Segments": {"1": {"Status": 2049}, "0": {"Status": 2049}}},
            "1": {"Segments": {"1": {"Status": 0}, "0": {"Status": 2048}}},
        }
    }

    assert LiveF1Feeder._estimate_lap_fraction(timing) == 0.75


def test_build_state_uses_sector_progress_when_live_position_missing():
    feeder = LiveF1Feeder("live")
    feeder._positions["44"] = 1
    feeder._laps["44"] = 12
    feeder._driver_codes["44"] = "HAM"
    feeder._timing_driver_state["44"] = {
        "Sectors": [
            {"Segments": [{"Status": 2049}, {"Status": 2049}]},
            {"Segments": [{"Status": 2049}, {"Status": 0}]},
        ]
    }

    state = feeder._build_state()

    assert state.cars[0].car_id == "44"
    assert state.cars[0].x is None
    assert state.cars[0].lap_fraction == 0.75
