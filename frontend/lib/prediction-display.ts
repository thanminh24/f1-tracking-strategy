import type { CarPrediction, PredictionSet } from "./prediction-types";

export const ACTION_LABELS: Record<string, string> = {
  STAY: "Stay Out",
  PIT_SOFT: "Pit - Soft",
  PIT_MEDIUM: "Pit - Medium",
  PIT_HARD: "Pit - Hard",
};

export const ACTION_COLORS: Record<string, string> = {
  STAY: "#22C55E",
  PIT_SOFT: "#E10600",
  PIT_MEDIUM: "#FFD700",
  PIT_HARD: "#EFEFEF",
};

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#E10600",
  MEDIUM: "#FFD700",
  HARD: "#D1D5DB",
  INTERMEDIATE: "#16A34A",
  WET: "#2563EB",
};

export interface ProbabilityEntry {
  key: string;
  probability: number;
}

export function topProbabilityEntries(
  probabilities: Record<string, number> | undefined,
  limit = 3,
  minimum = 0,
): ProbabilityEntry[] {
  return Object.entries(probabilities ?? {})
    .map(([key, probability]) => ({ key, probability }))
    .filter(({ probability }) => probability >= minimum)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, limit);
}

export function topPitWindows(car: CarPrediction, limit = 3): ProbabilityEntry[] {
  return topProbabilityEntries(car.pit_window_probs, limit, 0.02)
    .sort((a, b) => Number(a.key) - Number(b.key));
}

export function topCompoundChoices(car: CarPrediction, limit = 3): ProbabilityEntry[] {
  return topProbabilityEntries(car.next_compound_probs, limit, 0.01);
}

export function actionLabel(action: string | null | undefined): string {
  if (!action) return "No RL action";
  return ACTION_LABELS[action] ?? action;
}

export function actionColor(action: string | null | undefined): string {
  return ACTION_COLORS[action ?? ""] ?? "#707070";
}

export function modelVersionSummary(prediction: PredictionSet): string {
  return Object.entries(prediction.meta.model_versions)
    .map(([name, version]) => `${name}: ${version}`)
    .join(" | ");
}
