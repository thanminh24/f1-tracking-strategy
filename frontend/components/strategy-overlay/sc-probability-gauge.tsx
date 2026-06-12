"use client";
// P(SC) next 1/5 laps + trend sparkline. Copy stays probabilistic by design.
import { usePredictionStore } from "../../lib/prediction-store";
import { pct } from "../../lib/prediction-types";

const W = 120, H = 28;

export function ScProbabilityGauge() {
  const prediction = usePredictionStore((s) => s.prediction);
  const history = usePredictionStore((s) => s.scHistory);
  if (!prediction) return null;

  const max = Math.max(0.05, ...history.map((h) => h.p1));
  const points = history
    .map((h, i) => `${(i / Math.max(history.length - 1, 1)) * W},${H - (h.p1 / max) * H}`)
    .join(" ");

  return (
    <div
      className="flex items-center gap-3"
      title={`based on ${prediction.meta.n_rollouts} rollouts · ${
        prediction.meta.model_versions["sc_hazard"] ?? "sc model"}`}
    >
      <div>
        <div className="text-[9px] uppercase text-f1-muted tracking-widest font-mono">Safety Car</div>
        <div className="text-xs text-f1-text font-mono">
          P(next lap) = {pct(prediction.sc_prob_1lap)}
          <span className="text-f1-muted"> · P(5 laps) = {pct(prediction.sc_prob_5laps)}</span>
        </div>
      </div>
      {history.length > 1 && (
        <svg width={W} height={H} className="opacity-70">
          <polyline fill="none" stroke="#facc15" strokeWidth={1.5} points={points} />
        </svg>
      )}
    </div>
  );
}
