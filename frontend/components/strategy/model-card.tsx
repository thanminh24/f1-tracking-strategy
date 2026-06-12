"use client";
// Prominent RL strategy recommendation card shown at the top of the strategy panel.
import { usePredictionStore, isStale } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { pct } from "../../lib/prediction-types";

const ACTION_LABELS: Record<string, string> = {
  STAY: "Stay Out",
  PIT_SOFT: "Pit — Soft",
  PIT_MEDIUM: "Pit — Medium",
  PIT_HARD: "Pit — Hard",
};

const ACTION_COLORS: Record<string, string> = {
  STAY: "#22C55E",
  PIT_SOFT: "#E10600",
  PIT_MEDIUM: "#FFD700",
  PIT_HARD: "#EFEFEF",
};

interface Props {
  /** Focus on this car's recommendation. If null, shows race leader. */
  focusCarId?: string | null;
}

export function ModelCard({ focusCarId }: Props) {
  const prediction = usePredictionStore((s) => s.prediction);
  const state = useRaceStateStore((s) => s.state);
  const currentLap = state?.leader_lap ?? 0;
  const stale = isStale(prediction, currentLap);

  if (!prediction) {
    return (
      <div className="rounded-lg border border-f1-border bg-f1-panel p-4 text-sm text-f1-muted text-center">
        RL model — waiting for predictions…
      </div>
    );
  }

  const targetId =
    focusCarId ??
    state?.cars.find((c) => c.position === 1)?.car_id ??
    prediction.cars[0]?.car_id;
  const car = prediction.cars.find((c) => c.car_id === targetId) ?? prediction.cars[0];

  if (!car) return null;

  const action = car.recommended_action ?? "STAY";
  const color = ACTION_COLORS[action] ?? "#707070";
  const probs = Object.entries(car.action_probs).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className={`rounded-lg border bg-f1-panel p-4 transition-opacity ${
        stale ? "opacity-50" : ""
      }`}
      style={{ borderColor: color + "60" }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-6 rounded-sm" style={{ backgroundColor: color }} />
          <div>
            <div className="text-[10px] text-f1-muted uppercase tracking-widest">RL Recommendation</div>
            <div className="text-xs text-f1-text-dim font-data">Car {car.car_id} · Lap {prediction.lap}</div>
          </div>
        </div>
        {stale && (
          <span className="chip bg-amber-900/40 text-f1-amber border border-amber-700/40 text-[10px]">
            STALE
          </span>
        )}
      </div>

      {/* Main action */}
      <div className="text-xl font-bold mb-1" style={{ color }}>
        {ACTION_LABELS[action] ?? action}
      </div>

      {/* Probability breakdown */}
      <div className="flex flex-col gap-1 mt-3">
        {probs.map(([act, p]) => (
          <div key={act} className="flex items-center gap-2">
            <span className="font-data text-xs text-f1-text-dim w-24 shrink-0">
              {ACTION_LABELS[act] ?? act}
            </span>
            <div className="flex-1 h-1.5 rounded-full bg-f1-surface overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${p * 100}%`,
                  backgroundColor: ACTION_COLORS[act] ?? "#707070",
                }}
              />
            </div>
            <span className="font-data text-xs text-f1-text-dim w-9 text-right">{pct(p)}</span>
          </div>
        ))}
      </div>

      {/* Outcome */}
      <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-f1-border">
        <div className="text-center">
          <div className="font-data text-base font-semibold text-f1-text">
            {car.outcome.expected_position.toFixed(1)}
          </div>
          <div className="text-[10px] text-f1-muted">Exp. Pos.</div>
        </div>
        <div className="text-center">
          <div className="font-data text-base font-semibold text-f1-green">
            {pct(car.outcome.podium)}
          </div>
          <div className="text-[10px] text-f1-muted">Podium</div>
        </div>
        <div className="text-center">
          <div className="font-data text-base font-semibold text-f1-blue">
            {pct(car.outcome.points)}
          </div>
          <div className="text-[10px] text-f1-muted">Points</div>
        </div>
      </div>

      <div className="mt-2 text-[10px] text-f1-muted text-right font-data">
        {prediction.meta.n_rollouts} rollouts · {prediction.meta.compute_ms}ms
      </div>
    </div>
  );
}
