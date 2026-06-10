"""Calibration parameter artifacts: data/calibration/{season}/{circuit}.json.

2026 is fitted separately from 2024-25 (regulation change) — never pool across
the reg boundary. Low-sample fits carry confidence metadata for consumers.
"""

import json
from dataclasses import asdict, dataclass, field
from pathlib import Path

from f1_strategy.config import get_settings

# Literature-prior compound deltas (ms offset vs MEDIUM, ms/lap deg slope) used
# when archive sample is too thin to fit (esp. INTERMEDIATE/WET — excluded from v1 fits).
DEFAULT_COMPOUNDS = {
    "SOFT": {"offset_ms": -400.0, "deg_ms_per_lap": 90.0},
    "MEDIUM": {"offset_ms": 0.0, "deg_ms_per_lap": 55.0},
    "HARD": {"offset_ms": 500.0, "deg_ms_per_lap": 35.0},
    "INTERMEDIATE": {"offset_ms": 8000.0, "deg_ms_per_lap": 60.0},
    "WET": {"offset_ms": 15000.0, "deg_ms_per_lap": 40.0},
}


@dataclass
class CompoundParams:
    offset_ms: float
    deg_ms_per_lap: float
    n_samples: int = 0  # 0 = literature prior, not fitted


@dataclass
class SimParams:
    season: int
    circuit: str
    total_laps: int
    base_lap_ms: float  # reference clean lap on MEDIUM, fresh tires, full fuel burn mid-race
    fuel_ms_per_lap: float  # lap-time gain per lap of fuel burned
    pit_loss_ms: float  # race-time cost of a stop (in+out lap delta vs clean)
    sc_hazard_per_lap: float  # P(SC deploy) on a green lap
    sc_lap1_multiplier: float  # lap-1 chaos factor on hazard
    sc_pace_factor: float  # lap-time multiplier while SC out
    traffic_penalty_ms: float  # dirty-air cost when within threshold of car ahead
    overtake_pace_threshold_ms: float  # min pace delta to pass without DRS train
    noise_sigma_ms: float
    compounds: dict[str, CompoundParams] = field(default_factory=dict)
    driver_offsets_ms: dict[str, float] = field(default_factory=dict)  # car_id → pace delta
    confidence: str = "fitted"  # fitted | pooled | prior
    lap1_extra_ms: float = 8000.0  # standing start + first-lap congestion penalty

    def compound(self, name: str) -> CompoundParams:
        if name in self.compounds:
            return self.compounds[name]
        d = DEFAULT_COMPOUNDS.get(name, DEFAULT_COMPOUNDS["MEDIUM"])
        return CompoundParams(d["offset_ms"], d["deg_ms_per_lap"], 0)

    def save(self) -> Path:
        path = get_settings().calibration_dir / str(self.season) / f"{self.circuit}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(asdict(self), indent=1))
        return path

    @classmethod
    def load(cls, season: int, circuit: str) -> "SimParams":
        path = get_settings().calibration_dir / str(season) / f"{circuit}.json"
        raw = json.loads(path.read_text())
        raw.setdefault("lap1_extra_ms", 8000.0)
        raw["compounds"] = {k: CompoundParams(**v) for k, v in raw["compounds"].items()}
        return cls(**raw)
