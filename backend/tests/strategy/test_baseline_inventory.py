import json

from f1_strategy.config import Settings
from f1_strategy.strategy.evaluation.baseline import (
    collect_baseline_report,
    expected_points_from_positions,
    write_baseline_report,
)


def test_expected_points_from_positions():
    assert expected_points_from_positions([1, 2, 11]) == (25 + 18) / 3
    assert expected_points_from_positions([]) == 0.0


def test_collect_baseline_report_from_filesystem_inventory(tmp_path):
    data_dir = tmp_path / "data"
    calibration_dir = data_dir / "calibration" / "2024"
    models_dir = data_dir / "models"
    calibration_dir.mkdir(parents=True)
    models_dir.mkdir(parents=True)
    (calibration_dir / "Sakhir.json").write_text(json.dumps({
        "season": 2024,
        "circuit": "Sakhir",
        "total_laps": 57,
        "confidence": "fitted",
    }))
    (models_dir / "ppo_2024_Sakhir.zip").write_text("placeholder")
    (models_dir / "ppo_2024_Sakhir_eval.json").write_text(json.dumps({
        "ppo_mean_position": 5.4,
        "head_to_head_win_rate": 0.6,
    }))
    (models_dir / "behavior_meta.json").write_text(json.dumps({
        "version": "behavior-v1",
        "quality": "ok",
    }))
    (models_dir / "sc_hazard_2024.json").write_text("{}")

    report = collect_baseline_report(Settings(data_dir=data_dir))

    assert report.calibrations[0].circuit == "Sakhir"
    assert report.ppo_checkpoints[0].eval_metrics["ppo_mean_position"] == 5.4
    assert report.behavior_meta["quality"] == "ok"
    assert report.sc_hazard_models == ["sc_hazard_2024.json"]
    assert "ppo_current" in report.metric_contract.baselines


def test_write_baseline_report_outputs_json_and_markdown(tmp_path):
    data_dir = tmp_path / "data"
    output_dir = tmp_path / "reports"
    settings = Settings(data_dir=data_dir)

    json_path, md_path, report = write_baseline_report(output_dir, settings)

    assert json_path.exists()
    assert md_path.exists()
    assert json.loads(json_path.read_text())["metric_contract"]["promotion_gates"]
    assert "Strategy Model Baseline Inventory" in md_path.read_text()
    assert report.metric_contract.promotion_gates["head_to_head_win_rate"] == 0.55
