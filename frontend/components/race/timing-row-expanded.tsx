"use client";
import { usePredictionStore } from "../../lib/prediction-store";
import type { CarPrediction } from "../../lib/prediction-types";

function formatLapRange(probs: Record<string, number>): string {
  const laps = Object.entries(probs)
    .filter(([_, p]) => p > 0.2)
    .map(([lap]) => parseInt(lap, 10))
    .sort((a, b) => a - b);

  if (laps.length === 0) return "No window";
  if (laps.length === 1) return `Lap ${laps[0]}`;
  return `Lap ${laps[0]}–${laps[laps.length - 1]}`;
}

interface Props {
  prediction: CarPrediction | null;
}

export function TimingRowExpanded({ prediction }: Props) {
  if (!prediction) {
    return (
      <div className="px-3 py-2 text-xs text-f1-text-dim bg-f1-surface/40">
        No prediction data
      </div>
    );
  }

  const pitWindow = formatLapRange(prediction.pit_window_probs);
  const nextCompounds = Object.entries(prediction.next_compound_probs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([compound, prob]) => `${compound} ${Math.round(prob * 100)}%`)
    .join(" / ");

  return (
    <div className="px-3 py-2 text-xs bg-f1-surface/40 flex flex-col gap-1">
      <div className="flex justify-between">
        <span className="text-f1-muted">Pit Window:</span>
        <span className="text-f1-text">{pitWindow}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-f1-muted">Next Compound:</span>
        <span className="text-f1-text">{nextCompounds || "—"}</span>
      </div>
      {prediction.outcome && (
        <div className="flex justify-between">
          <span className="text-f1-muted">Expected Pos:</span>
          <span className="text-f1-text">
            {prediction.outcome.expected_position.toFixed(1)}
          </span>
        </div>
      )}
    </div>
  );
}
