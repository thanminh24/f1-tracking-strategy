"""PPO checkpoint season-fallback: a circuit trained on any season stays loadable
even when the resolved race season has no exact checkpoint (e.g. São Paulo, whose
only dry-calibrated model is 2025)."""

from f1_strategy.strategy.ppo_agent.policy import _latest_available_model_season


def _touch(models_dir, season: int, circuit: str) -> None:
    (models_dir / f"ppo_{season}_{circuit}.zip").write_bytes(b"")


def test_exact_season_preferred(tmp_path):
    _touch(tmp_path, 2024, "Monaco")
    _touch(tmp_path, 2025, "Monaco")
    assert _latest_available_model_season(tmp_path, 2024, "Monaco") == 2024


def test_falls_back_to_latest_past_season(tmp_path):
    _touch(tmp_path, 2024, "Monaco")
    # 2026 race, only 2024 model exists → use 2024
    assert _latest_available_model_season(tmp_path, 2026, "Monaco") == 2024


def test_falls_forward_when_only_later_season_trained(tmp_path):
    # São Paulo 2024 was wet (no dry calibration); only a 2025 model exists.
    _touch(tmp_path, 2025, "São Paulo")
    assert _latest_available_model_season(tmp_path, 2024, "São Paulo") == 2025


def test_no_model_returns_none(tmp_path):
    _touch(tmp_path, 2024, "Monaco")
    assert _latest_available_model_season(tmp_path, 2024, "Interlagos") is None


def test_circuit_name_with_underscores_and_digits(tmp_path):
    # guards the stem-slicing against circuits whose names break naive splits
    _touch(tmp_path, 2024, "Spa-Francorchamps")
    assert _latest_available_model_season(tmp_path, 2025, "Spa-Francorchamps") == 2024
