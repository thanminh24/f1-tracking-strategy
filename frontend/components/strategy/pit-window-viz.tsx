"use client";
// Bar chart of pit probability by lap for a selected car.
import { usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";

interface Props {
  carId?: string | null;
}

export function PitWindowViz({ carId }: Props) {
  const prediction = usePredictionStore((s) => s.prediction);
  const state = useRaceStateStore((s) => s.state);

  if (!prediction) return null;

  const targetId =
    carId ?? state?.cars.find((c) => c.position === 1)?.car_id ?? prediction.cars[0]?.car_id;
  const car = prediction.cars.find((c) => c.car_id === targetId) ?? prediction.cars[0];
  if (!car) return null;

  const entries = Object.entries(car.pit_window_probs)
    .map(([lap, p]) => ({ lap: Number(lap), p }))
    .filter(({ p }) => p > 0.02)
    .sort((a, b) => a.lap - b.lap)
    .slice(0, 15);

  if (entries.length === 0) {
    return (
      <div className="text-xs text-f1-muted px-1 py-2">No significant pit window in range</div>
    );
  }

  const maxP = Math.max(...entries.map((e) => e.p));

  return (
    <div className="flex flex-col gap-1">
      <div className="text-[10px] text-f1-muted uppercase tracking-widest mb-1">Pit Window</div>
      {entries.map(({ lap, p }) => (
        <div key={lap} className="flex items-center gap-2">
          <span className="font-data text-[11px] text-f1-text-dim w-8 text-right shrink-0">
            L{lap}
          </span>
          <div className="flex-1 h-2.5 rounded-sm overflow-hidden bg-f1-surface">
            <div
              className="h-full rounded-sm transition-all"
              style={{
                width: `${(p / maxP) * 100}%`,
                backgroundColor: p > 0.4 ? "#E10600" : p > 0.2 ? "#F59E0B" : "#3B82F6",
              }}
            />
          </div>
          <span className="font-data text-[11px] text-f1-text-dim w-8 text-right shrink-0">
            {Math.round(p * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}
