"use client";
import { useRaceStateStore } from "../../lib/race-state-store";
import { usePredictionStore } from "../../lib/prediction-store";
import { teamColor } from "../../lib/team-colors";
import { GapChart } from "../gap-chart";

const TIRE_COLORS: Record<string, string> = {
  SOFT: "#E10600",
  MEDIUM: "#FFD700",
  HARD: "#EFEFEF",
  INTER: "#22C55E",
  WET: "#3B82F6",
};

function tireColor(compound: string): string {
  return TIRE_COLORS[compound.toUpperCase()] ?? "#707070";
}

function PredictionSummary({ carId }: { carId: string }) {
  const prediction = usePredictionStore((s) => s.prediction);
  const carPred = prediction?.cars.find((c) => c.car_id === carId);

  if (!carPred) {
    return (
      <div className="text-xs text-f1-text-dim px-3 py-2">
        No prediction data
      </div>
    );
  }

  const nextCompounds = Object.entries(carPred.next_compound_probs)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([compound, prob]) => `${compound} ${Math.round(prob * 100)}%`)
    .join(" / ");

  const pitLaps = Object.entries(carPred.pit_window_probs)
    .filter(([_, p]) => p > 0.2)
    .map(([lap]) => parseInt(lap, 10))
    .sort((a, b) => a - b);

  const pitWindow =
    pitLaps.length === 0
      ? "—"
      : pitLaps.length === 1
        ? `L${pitLaps[0]}`
        : `L${pitLaps[0]}–${pitLaps[pitLaps.length - 1]}`;

  const sc1 = prediction?.sc_prob_1lap ?? 0;
  const sc5 = prediction?.sc_prob_5laps ?? 0;

  return (
    <div className="px-3 py-2 text-xs flex flex-col gap-1.5">
      {/* Action */}
      {carPred.recommended_action && (
        <div className="flex justify-between items-center">
          <span className="text-f1-muted">Action:</span>
          <span
            className="chip text-[10px] px-2 py-0.5"
            style={{
              backgroundColor:
                carPred.recommended_action === "PIT_NOW"
                  ? "#b91c1c99"
                  : "#b45309cc",
              color:
                carPred.recommended_action === "PIT_NOW"
                  ? "#ef4444"
                  : "#fbbf24",
              borderColor:
                carPred.recommended_action === "PIT_NOW"
                  ? "#dc262655"
                  : "#b4530955",
              border: "1px solid",
            }}
          >
            {carPred.recommended_action === "PIT_NOW"
              ? "PIT NOW"
              : carPred.recommended_action === "STAY"
                ? "STAY"
                : carPred.recommended_action}
          </span>
        </div>
      )}

      {/* Pit window */}
      <div className="flex justify-between">
        <span className="text-f1-muted">Window:</span>
        <span className="text-f1-text">{pitWindow}</span>
      </div>

      {/* Next compound */}
      <div className="flex justify-between">
        <span className="text-f1-muted">Next:</span>
        <span className="text-f1-text font-data">{nextCompounds || "—"}</span>
      </div>

      {/* SC prob */}
      <div className="flex justify-between">
        <span className="text-f1-muted">SC:</span>
        <span className="text-f1-text font-data">
          {Math.round(sc1 * 100)}% (1L) / {Math.round(sc5 * 100)}% (5L)
        </span>
      </div>
    </div>
  );
}

export function DriverFocusCard() {
  const state = useRaceStateStore((s) => s.state);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-f1-muted">
        Waiting for data…
      </div>
    );
  }

  // If no car focused, show gap chart instead
  if (!focusedCarId) {
    return <GapChart />;
  }

  const car = state.cars.find((c) => c.car_id === focusedCarId);
  if (!car) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-f1-muted">
        Car not found
      </div>
    );
  }

  const color = teamColor(car.team);

  return (
    <div className="flex flex-col h-full bg-f1-panel/40 border border-f1-border">
      {/* Header */}
      <div
        className="px-3 py-2 border-l-2 border-b border-f1-border"
        style={{ borderLeftColor: color }}
      >
        <div className="flex items-center gap-2">
          <span
            className="font-data text-lg font-semibold"
            style={{ color }}
          >
            {car.driver_code ?? car.car_id}
          </span>
          <span className="text-xs text-f1-text-dim">#{car.position}</span>
        </div>
      </div>

      {/* Tire info */}
      {car.tire && (
        <div className="px-3 py-2 border-b border-f1-border/40 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-f1-muted">Tire:</span>
            <div className="flex items-center gap-2">
              <span
                className="chip w-5 h-5 text-[10px]"
                style={{
                  backgroundColor: tireColor(car.tire.compound) + "22",
                  color: tireColor(car.tire.compound),
                  borderColor: tireColor(car.tire.compound) + "55",
                  border: "1px solid",
                }}
              >
                {car.tire.compound.charAt(0)}
              </span>
              <span className="text-f1-text font-data">
                {car.tire.compound}
              </span>
              <span className="text-f1-text-dim font-data">
                {car.tire.age_laps} laps
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Prediction summary */}
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        <PredictionSummary carId={focusedCarId} />
      </div>
    </div>
  );
}
