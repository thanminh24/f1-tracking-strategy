"""Baseline inventory and metric contract for strategy-model tournaments.

This phase is intentionally read-only for archive/model artifacts. It creates a
reproducible snapshot of what can be evaluated before any challenger model is
trained.
"""

import json
import re
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

from f1_strategy.archive.db import query_df
from f1_strategy.config import Settings, get_settings

POINTS_BY_POSITION = {
    1: 25,
    2: 18,
    3: 15,
    4: 12,
    5: 10,
    6: 8,
    7: 6,
    8: 4,
    9: 2,
    10: 1,
}
PROMOTION_GATES = {
    "head_to_head_win_rate": 0.55,
    "mean_finish_position_gain": 0.25,
    "expected_points_gain_pct": 0.03,
    "invalid_strategy_rate": 0.0,
    "p95_inference_ms": 50.0,
}


@dataclass(frozen=True)
class RaceSessionSummary:
    session_key: str
    year: int
    round: int
    event_name: str
    circuit: str
    total_laps: int | None
    date_utc: str | None


@dataclass(frozen=True)
class CalibrationSummary:
    season: int
    circuit: str
    path: str
    confidence: str | None = None
    total_laps: int | None = None


@dataclass(frozen=True)
class PpoCheckpointSummary:
    season: int
    circuit: str
    checkpoint_path: str
    eval_path: str | None = None
    eval_metrics: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class BaselineMetricContract:
    metrics: list[str]
    promotion_gates: dict[str, float]
    baselines: list[str]


@dataclass(frozen=True)
class BaselineReport:
    race_sessions: list[RaceSessionSummary]
    calibrations: list[CalibrationSummary]
    ppo_checkpoints: list[PpoCheckpointSummary]
    behavior_meta: dict[str, Any]
    sc_hazard_models: list[str]
    metric_contract: BaselineMetricContract
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def expected_points_from_positions(positions: list[int]) -> float:
    """Mean F1 points from finishing positions."""
    if not positions:
        return 0.0
    return sum(POINTS_BY_POSITION.get(int(pos), 0) for pos in positions) / len(positions)


def collect_baseline_report(settings: Settings | None = None) -> BaselineReport:
    """Collect current archive/model inventory without training or simulation."""
    settings = settings or get_settings()
    warnings: list[str] = []
    race_sessions = _collect_race_sessions(warnings)
    calibrations = _collect_calibrations(settings, warnings)
    ppo_checkpoints = _collect_ppo_checkpoints(settings, warnings)
    behavior_meta = _read_json(settings.models_dir / "behavior_meta.json", warnings) or {}
    sc_hazard_models = sorted(p.name for p in settings.models_dir.glob("sc_hazard_*.json"))

    return BaselineReport(
        race_sessions=race_sessions,
        calibrations=calibrations,
        ppo_checkpoints=ppo_checkpoints,
        behavior_meta=behavior_meta,
        sc_hazard_models=sc_hazard_models,
        metric_contract=BaselineMetricContract(
            metrics=[
                "mean_finish_position",
                "expected_points",
                "head_to_head_win_rate",
                "invalid_action_rate",
                "mean_pit_count",
                "strategy_reasonableness_rate",
                "p50_inference_ms",
                "p95_inference_ms",
            ],
            promotion_gates=PROMOTION_GATES,
            baselines=[
                "ppo_current",
                "rsrl_single_track",
                "rsrl_multi_track",
                "mc_best_action",
                "behavior_heuristic",
                "fixed_one_stop",
                "fixed_two_stop",
            ],
        ),
        warnings=warnings,
    )


def write_baseline_report(
    output_dir: Path | None = None,
    settings: Settings | None = None,
) -> tuple[Path, Path, BaselineReport]:
    """Write JSON and Markdown baseline reports; return both paths and data."""
    settings = settings or get_settings()
    report = collect_baseline_report(settings)
    output = output_dir or settings.data_dir / "model_reports"
    output.mkdir(parents=True, exist_ok=True)
    json_path = output / "baseline_inventory.json"
    md_path = output / "baseline_inventory.md"
    json_path.write_text(json.dumps(report.to_dict(), indent=2, sort_keys=True))
    md_path.write_text(render_baseline_markdown(report))
    return json_path, md_path, report


def render_baseline_markdown(report: BaselineReport) -> str:
    """Human-readable baseline snapshot for plan review."""
    lines = [
        "# Strategy Model Baseline Inventory",
        "",
        "## Coverage",
        "",
        f"- Race sessions: {len(report.race_sessions)}",
        f"- Calibrations: {len(report.calibrations)}",
        f"- PPO checkpoints: {len(report.ppo_checkpoints)}",
        f"- SC hazard models: {len(report.sc_hazard_models)}",
        f"- Behavior model quality: {report.behavior_meta.get('quality', 'unknown')}",
        "",
        "## Promotion Gates",
        "",
    ]
    for key, value in report.metric_contract.promotion_gates.items():
        lines.append(f"- `{key}`: {value}")
    lines.extend(["", "## Baselines", ""])
    for baseline in report.metric_contract.baselines:
        lines.append(f"- `{baseline}`")
    lines.extend(["", "## PPO Checkpoints", ""])
    for ckpt in report.ppo_checkpoints:
        status = "eval" if ckpt.eval_path else "no eval"
        mean = ckpt.eval_metrics.get("ppo_mean_position")
        suffix = f", mean P{mean:.2f}" if isinstance(mean, int | float) else ""
        lines.append(f"- {ckpt.season} {ckpt.circuit}: {status}{suffix}")
    if report.warnings:
        lines.extend(["", "## Warnings", ""])
        lines.extend(f"- {warning}" for warning in report.warnings)
    lines.extend(["", "Unresolved questions:", "- Exact train/test split selected in Phase 04."])
    return "\n".join(lines) + "\n"


def _collect_race_sessions(warnings: list[str]) -> list[RaceSessionSummary]:
    try:
        df = query_df(
            "SELECT session_key, year, round, event_name, circuit, total_laps, date_utc "
            "FROM sessions WHERE session_type = 'R' ORDER BY year, round"
        )
    except Exception as exc:
        warnings.append(f"Could not query race sessions: {type(exc).__name__}: {exc}")
        return []
    out = []
    for row in df.to_dict("records"):
        out.append(RaceSessionSummary(
            session_key=str(row["session_key"]),
            year=int(row["year"]),
            round=int(row["round"]),
            event_name=str(row.get("event_name") or ""),
            circuit=str(row.get("circuit") or ""),
            total_laps=_optional_int(row.get("total_laps")),
            date_utc=None if row.get("date_utc") is None else str(row.get("date_utc")),
        ))
    return out


def _collect_calibrations(
    settings: Settings,
    warnings: list[str],
) -> list[CalibrationSummary]:
    out: list[CalibrationSummary] = []
    for path in sorted(settings.calibration_dir.glob("*/*.json")):
        try:
            season = int(path.parent.name)
        except ValueError:
            warnings.append(f"Skipping calibration with non-season directory: {path}")
            continue
        raw = _read_json(path, warnings) or {}
        out.append(CalibrationSummary(
            season=season,
            circuit=path.stem,
            path=str(path),
            confidence=raw.get("confidence"),
            total_laps=_optional_int(raw.get("total_laps")),
        ))
    return out


def _collect_ppo_checkpoints(
    settings: Settings,
    warnings: list[str],
) -> list[PpoCheckpointSummary]:
    out: list[PpoCheckpointSummary] = []
    for path in sorted(settings.models_dir.glob("ppo_*.zip")):
        parsed = _parse_ppo_artifact(path)
        if parsed is None:
            warnings.append(f"Skipping PPO checkpoint with unexpected name: {path.name}")
            continue
        season, circuit = parsed
        eval_path = path.with_name(f"ppo_{season}_{circuit}_eval.json")
        eval_metrics = _read_json(eval_path, warnings) if eval_path.exists() else {}
        out.append(PpoCheckpointSummary(
            season=season,
            circuit=circuit,
            checkpoint_path=str(path),
            eval_path=str(eval_path) if eval_path.exists() else None,
            eval_metrics=eval_metrics or {},
        ))
    return out


def _parse_ppo_artifact(path: Path) -> tuple[int, str] | None:
    match = re.fullmatch(r"ppo_(\d{4})_(.+)", path.stem)
    if not match:
        return None
    return int(match.group(1)), match.group(2)


def _read_json(path: Path, warnings: list[str]) -> dict[str, Any] | None:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return None
    except Exception as exc:
        warnings.append(f"Could not read JSON {path}: {type(exc).__name__}: {exc}")
        return None


def _optional_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None
