"use client";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";

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

export function StintBars() {
  const state = useRaceStateStore((s) => s.state);

  if (!state) return null;

  const totalLaps = state.total_laps ?? state.leader_lap + 20;
  const sorted = [...state.cars]
    .filter((c) => c.status !== "out")
    .sort((a, b) => a.position - b.position);

  return (
    <div className="flex flex-col gap-1 px-1">
      {sorted.map((car) => {
        const color = teamColor(car.team);
        const tire = car.tire;
        const completedFrac = car.lap / totalLaps;
        const stintStartFrac = tire
          ? Math.max(0, (car.lap - tire.age_laps) / totalLaps)
          : completedFrac;

        return (
          <div key={car.car_id} className="flex items-center gap-2">
            {/* driver label */}
            <span
              className="font-data text-[11px] font-semibold w-8 shrink-0"
              style={{ color }}
            >
              {car.driver_code ?? car.car_id}
            </span>

            {/* bar track */}
            <div className="relative flex-1 h-3 rounded-sm overflow-hidden bg-f1-surface">
              {/* completed laps (grey base) */}
              <div
                className="absolute inset-y-0 left-0 bg-zinc-700/60"
                style={{ width: `${completedFrac * 100}%` }}
              />
              {/* current stint (tinted) */}
              {tire && (
                <div
                  className="absolute inset-y-0"
                  style={{
                    left: `${stintStartFrac * 100}%`,
                    width: `${(completedFrac - stintStartFrac) * 100}%`,
                    backgroundColor: tireColor(tire.compound) + "55",
                    borderRight: `2px solid ${tireColor(tire.compound)}`,
                  }}
                />
              )}
            </div>

            {/* tire compound badge */}
            {tire && (
              <span
                className="chip text-[10px] w-5 h-5 shrink-0"
                style={{
                  color: tireColor(tire.compound),
                  backgroundColor: tireColor(tire.compound) + "22",
                  border: `1px solid ${tireColor(tire.compound)}55`,
                }}
              >
                {tire.compound.charAt(0)}
              </span>
            )}

            {/* lap counter */}
            <span className="font-data text-[10px] text-f1-muted w-8 text-right shrink-0">
              {car.lap}/{totalLaps}
            </span>
          </div>
        );
      })}
    </div>
  );
}
