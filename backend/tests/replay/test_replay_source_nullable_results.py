"""Regression coverage for nullable archive metadata/results in practice sessions."""

import pandas as pd

from f1_strategy.replay import replay_source


class CapturingTimeline:
    def __init__(
        self,
        session_key: str,
        laps: pd.DataFrame,
        total_laps: int | None,
        finish_positions: dict[str, int],
    ) -> None:
        self.session_key = session_key
        self.laps = laps
        self.total_laps = total_laps
        self.finish_positions = finish_positions


def test_build_timeline_skips_nullable_result_positions(monkeypatch):
    laps = pd.DataFrame(
        {
            "car_id": ["1"],
            "lap_number": [1],
            "lap_start_ms": [0],
            "lap_time_ms": [90_000],
        }
    )
    meta = pd.DataFrame({"total_laps": pd.Series([pd.NA], dtype="Int64")})
    results = pd.DataFrame(
        {
            "car_id": ["1", "2"],
            "position": pd.Series([pd.NA, 1], dtype="Int64"),
        }
    )

    monkeypatch.setattr(replay_source.queries, "get_laps", lambda _: laps)
    monkeypatch.setattr(replay_source.queries, "get_session_meta", lambda _: meta)
    monkeypatch.setattr(replay_source.queries, "get_results", lambda _: results)
    monkeypatch.setattr(replay_source, "RaceTimeline", CapturingTimeline)

    timeline = replay_source.build_timeline("2026_2_FP1")

    assert timeline.total_laps is None
    assert timeline.finish_positions == {"2": 1}
