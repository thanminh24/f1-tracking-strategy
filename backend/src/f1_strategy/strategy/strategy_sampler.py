"""Sample plausible remaining strategies per car for Monte Carlo rollouts.

Behavior-model path (quality=ok): per-lap pit probability from the GBM, first
Bernoulli success picks the pit lap, compound from the classifier. Heuristic
fallback: typical stint lengths with noise. One draw = one FixedStrategy per car.
"""

import numpy as np
import pandas as pd

from f1_strategy.sim.strategies import FixedStrategy
from f1_strategy.strategy.behavior_model import COMPOUND_CLASSES, PIT_FEATURES, BehaviorModel

TYPICAL_STINT = {"SOFT": 18, "MEDIUM": 24, "HARD": 30}
MAX_FUTURE_STOPS = 2


def _heuristic_pit_lap(lap: int, age: float, compound: str, total: int,
                       rng: np.random.Generator) -> int | None:
    target = lap + max(1, TYPICAL_STINT.get(compound, 24) - int(age)) + int(rng.normal(0, 2))
    return target if lap < target <= total - 3 else None


def _heuristic_compound(laps_left: int, rng: np.random.Generator) -> str:
    if laps_left > 25:
        return "HARD"
    return "HARD" if rng.random() < 0.4 else ("MEDIUM" if rng.random() < 0.7 else "SOFT")


def _behavior_pit_lap(bm: BehaviorModel, car: dict, lap: int, total: int,
                      rng: np.random.Generator) -> int | None:
    """First future lap where a Bernoulli draw against P(pit|features) fires."""
    horizon = range(lap + 1, total - 2)
    if not len(list(horizon)):
        return None
    rows = []
    for fut in horizon:
        age = car["age"] + (fut - lap)
        rows.append({
            "tire_age": age,
            "age_vs_typical": age - TYPICAL_STINT.get(car["compound"], 24),
            "race_frac": fut / total, "laps_left": total - fut,
            "position": car["position"], "stint": car["stint"],
            "comp_soft": float(car["compound"] == "SOFT"),
            "comp_medium": float(car["compound"] == "MEDIUM"),
            "comp_hard": float(car["compound"] == "HARD"),
        })
    feats = pd.DataFrame(rows)[PIT_FEATURES]
    probs = np.clip(bm.pit_probs(feats), 0.0, 1.0)
    fires = rng.random(len(probs)) < probs
    if not fires.any():
        return None
    return int(lap + 1 + int(np.argmax(fires)))


def _behavior_compound(bm: BehaviorModel, car: dict, pit_lap: int, total: int,
                       rng: np.random.Generator) -> str:
    feats = pd.DataFrame([{
        "tire_age": car["age"] + (pit_lap - car["lap"]),
        "age_vs_typical": car["age"] - TYPICAL_STINT.get(car["compound"], 24),
        "race_frac": pit_lap / total, "laps_left": total - pit_lap,
        "position": car["position"], "stint": car["stint"],
        "comp_soft": float(car["compound"] == "SOFT"),
        "comp_medium": float(car["compound"] == "MEDIUM"),
        "comp_hard": float(car["compound"] == "HARD"),
    }])[PIT_FEATURES]
    p = np.asarray(bm.compound_probs(feats)).reshape(-1)
    return COMPOUND_CLASSES[int(rng.choice(len(COMPOUND_CLASSES), p=p / p.sum()))]


def sample_draw(cars: list[dict], lap: int, total: int, behavior: BehaviorModel | None,
                rng: np.random.Generator) -> dict[str, FixedStrategy]:
    """One strategy draw for the whole field. `cars`: dicts with car_id, compound,
    age, position, stint, lap. Returns car_id → FixedStrategy of FUTURE stops."""
    use_model = behavior is not None and behavior.usable and behavior.pit is not None
    draw: dict[str, FixedStrategy] = {}
    for car in cars:
        stops: list[tuple[int, str]] = []
        cur = dict(car)
        for _ in range(MAX_FUTURE_STOPS):
            base_lap = stops[-1][0] if stops else lap
            view = {**cur, "age": 0.0 if stops else cur["age"], "lap": base_lap,
                    "compound": stops[-1][1] if stops else cur["compound"]}
            pit_lap = (
                _behavior_pit_lap(behavior, view, base_lap, total, rng)
                if use_model else
                _heuristic_pit_lap(base_lap, view["age"], view["compound"], total, rng)
            )
            if pit_lap is None:
                break
            compound = (
                _behavior_compound(behavior, view, pit_lap, total, rng)
                if use_model else _heuristic_compound(total - pit_lap, rng)
            )
            stops.append((pit_lap, compound))
        draw[car["car_id"]] = FixedStrategy(car["compound"], stops)
    return draw
