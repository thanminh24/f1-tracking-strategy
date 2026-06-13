"""PredictionSet wire schema — everything probabilistic, every payload carries
its sample basis (n_rollouts, model versions) so the UI can show confidence.
"""

from pydantic import BaseModel, Field


class OutcomeProbs(BaseModel):
    win: float
    podium: float
    points: float
    expected_position: float
    # finishing-position distribution: position (1-based, str keys for JSON) → prob
    position_dist: dict[str, float] = Field(default_factory=dict)


class ModelRecommendation(BaseModel):
    recommended_action: str | None = None
    action_probs: dict[str, float] = Field(default_factory=dict)
    inference_ms: float = 0.0
    version: str = "unknown"
    # Top feature-group drivers for this recommendation (from perturbation importance).
    # Each entry: {group, action, probability_delta}. Empty when explanation is unavailable.
    top_factors: list[dict] = Field(default_factory=list)


class CarPrediction(BaseModel):
    car_id: str
    recommended_action: str | None = None  # STAY | PIT_SOFT | PIT_MEDIUM | PIT_HARD
    action_probs: dict[str, float] = Field(default_factory=dict)
    # Optional per-model recommendations for challenger/shadow policies.
    model_recommendations: dict[str, ModelRecommendation] = Field(default_factory=dict)
    # lap (str keys for JSON) → P(pits that lap), from sampled rival strategies
    pit_window_probs: dict[str, float] = Field(default_factory=dict)
    next_compound_probs: dict[str, float] = Field(default_factory=dict)
    outcome: OutcomeProbs


class PredictionMeta(BaseModel):
    n_rollouts: int
    model_versions: dict[str, str] = Field(default_factory=dict)
    compute_ms: float = 0.0


class PredictionSet(BaseModel):
    """Per-lap prediction payload multiplexed into the replay WS stream."""

    session_key: str
    lap: int
    cars: list[CarPrediction]
    sc_prob_1lap: float
    sc_prob_5laps: float
    meta: PredictionMeta


class WhatIfRequest(BaseModel):
    session_key: str
    lap: int
    car_id: str
    action: str  # PIT_SOFT | PIT_MEDIUM | PIT_HARD | STAY_N (stay out N more laps)
    stay_laps: int = Field(5, ge=1, le=30)  # STAY_N: pit deferred this many laps onto MEDIUM


class WhatIfResponse(BaseModel):
    session_key: str
    lap: int
    car_id: str
    action: str
    baseline: OutcomeProbs
    forced: OutcomeProbs
    delta_expected_position: float  # negative = forced action gains places
    meta: PredictionMeta
