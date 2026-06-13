// Mirrors backend strategy/prediction_schema.py — everything probabilistic.

export interface OutcomeProbs {
  win: number;
  podium: number;
  points: number;
  expected_position: number;
  position_dist: Record<string, number>; // position → prob
}

export interface FeatureImportance {
  group: string;
  action: string;
  probability_delta: number;
}

export interface ModelRecommendation {
  recommended_action: string | null;
  action_probs: Record<string, number>;
  inference_ms: number;
  version: string;
  top_factors: FeatureImportance[]; // top feature drivers; empty when unavailable
}

export interface CarPrediction {
  car_id: string;
  recommended_action: string | null; // STAY | PIT_SOFT | PIT_MEDIUM | PIT_HARD
  action_probs: Record<string, number>;
  model_recommendations?: Record<string, ModelRecommendation>;
  pit_window_probs: Record<string, number>; // lap → P(pits that lap)
  next_compound_probs: Record<string, number>;
  outcome: OutcomeProbs;
}

export interface PredictionMeta {
  n_rollouts: number;
  model_versions: Record<string, string>;
  compute_ms: number;
}

export interface PredictionSet {
  session_key: string;
  lap: number;
  cars: CarPrediction[];
  sc_prob_1lap: number;
  sc_prob_5laps: number;
  meta: PredictionMeta;
}

export interface WhatIfResponse {
  session_key: string;
  lap: number;
  car_id: string;
  action: string;
  baseline: OutcomeProbs;
  forced: OutcomeProbs;
  delta_expected_position: number;
  meta: PredictionMeta;
}

export const pct = (p: number): string => `${Math.round(p * 100)}%`;
