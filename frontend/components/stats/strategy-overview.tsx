"use client";
import { useMemo } from "react";
import type { StintRow } from "../../lib/types";
import { useRaceStateStore } from "../../lib/race-state-store";
import { teamColor } from "../../lib/team-colors";

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#E10600",
  MEDIUM: "#FFD700",
  HARD: "#EFEFEF",
  INTER: "#22C55E",
  WET: "#3B82F6",
};

function stintColor(compound: string): string {
  return COMPOUND_COLORS[compound.toUpperCase()] ?? "#707070";
}

interface Props {
  stints: StintRow[];
}

export function StrategyOverview({ stints }: Props) {
  const state = useRaceStateStore((s) => s.state);

  const maxLap = useMemo(() => {
    if (!stints.length) return 1;
    return Math.max(...stints.map((s) => s.end_lap), state?.total_laps ?? 1);
  }, [stints, state?.total_laps]);

  // Group stints by car_id and get car positions
  const carGroups = useMemo(() => {
    const groups = new Map<string, StintRow[]>();
    for (const stint of stints) {
      if (!groups.has(stint.car_id)) groups.set(stint.car_id, []);
      groups.get(stint.car_id)!.push(stint);
    }

    // Sort by current position from race state
    const sorted = Array.from(groups.entries()).sort((a, b) => {
      const carA = state?.cars.find((c) => c.car_id === a[0]);
      const carB = state?.cars.find((c) => c.car_id === b[0]);
      const posA = carA?.position ?? 999;
      const posB = carB?.position ?? 999;
      return posA - posB;
    });

    return sorted;
  }, [stints, state?.cars]);

  if (!state || carGroups.length === 0) {
    return <div className="p-4 text-f1-text-dim">No strategy data available</div>;
  }

  const chartHeight = carGroups.length * 20 + 20;
  const barWidth = 400;
  const barHeight = 16;
  const gap = 4;

  return (
    <div className="p-4">
      <div className="space-y-4">
        <div className="flex items-start gap-4">
          {/* Chart legend */}
          <div className="flex gap-4 text-sm text-f1-text-dim">
            {Object.entries(COMPOUND_COLORS).map(([compound, color]) => (
              <div key={compound} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: color }}
                />
                <span>{compound}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Chart SVG */}
        <div className="overflow-x-auto">
          <svg
            viewBox={`0 0 ${barWidth + 60} ${chartHeight}`}
            className="min-w-full h-auto"
            style={{ minHeight: "300px" }}
          >
            {/* Y-axis labels and bars */}
            {carGroups.map(([carId, carStints], idx) => {
              const car = state.cars.find((c) => c.car_id === carId);
              const y = idx * (barHeight + gap) + 10;
              const color = teamColor(car?.team ?? null);
              const driverCode = car?.driver_code ?? carId;

              return (
                <g key={carId}>
                  {/* Driver label */}
                  <text
                    x="5"
                    y={y + barHeight / 2 + 4}
                    fontSize="12"
                    fontFamily="data"
                    fontWeight="600"
                    fill={color}
                    className="select-none"
                  >
                    {driverCode}
                  </text>

                  {/* Stint bars */}
                  {carStints.map((stint, stintIdx) => {
                    const startX = 50 + (stint.start_lap / maxLap) * barWidth;
                    const endX = 50 + (stint.end_lap / maxLap) * barWidth;
                    const w = Math.max(1, endX - startX);

                    return (
                      <g key={`${carId}-${stintIdx}`}>
                        <rect
                          x={startX}
                          y={y}
                          width={w}
                          height={barHeight}
                          fill={stintColor(stint.compound)}
                          stroke={stintColor(stint.compound)}
                          strokeWidth="1"
                          className="cursor-pointer hover:opacity-80"
                        >
                          <title>{`${stint.compound} (L${stint.start_lap}–${stint.end_lap})`}</title>
                        </rect>
                      </g>
                    );
                  })}
                </g>
              );
            })}

            {/* X-axis labels and current lap marker */}
            <g>
              {/* X-axis ticks */}
              {Array.from({ length: 6 }).map((_, i) => {
                const lap = Math.round((i / 5) * maxLap);
                const x = 50 + (lap / maxLap) * barWidth;
                return (
                  <g key={`tick-${i}`}>
                    <line
                      x1={x}
                      y1={chartHeight - 20}
                      x2={x}
                      y2={chartHeight - 15}
                      stroke="#666"
                      strokeWidth="1"
                    />
                    <text
                      x={x}
                      y={chartHeight - 5}
                      fontSize="10"
                      textAnchor="middle"
                      fill="#999"
                      className="select-none"
                    >
                      {lap}
                    </text>
                  </g>
                );
              })}

              {/* Current lap vertical line */}
              {state.leader_lap > 0 && (
                <line
                  x1={50 + (state.leader_lap / maxLap) * barWidth}
                  y1="5"
                  x2={50 + (state.leader_lap / maxLap) * barWidth}
                  y2={chartHeight - 25}
                  stroke="#F97316"
                  strokeWidth="2"
                  strokeDasharray="4,4"
                />
              )}
            </g>
          </svg>
        </div>

        {/* Current lap indicator */}
        {state.leader_lap > 0 && (
          <div className="text-xs text-f1-text-dim">
            Current lap: <span className="text-orange-500 font-semibold">{state.leader_lap}</span>
          </div>
        )}
      </div>
    </div>
  );
}
