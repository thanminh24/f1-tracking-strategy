"use client";
import { useMemo } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { ScProbabilityChart } from "./sc-probability-chart";

export function ScProbabilityHistory() {
  const scHistory = usePredictionStore((s) => s.scHistory);
  const scHistory5 = usePredictionStore((s) => s.scHistory5);
  const raceControlMessages = useRaceStateStore((s) => s.raceControlMessages);

  const chartData = useMemo(() => {
    if (scHistory.length === 0) return null;

    const minLap = Math.min(...scHistory.map((h) => h.lap));
    const maxLap = Math.max(...scHistory.map((h) => h.lap));
    const lapRange = Math.max(1, maxLap - minLap);

    // SC deployment laps from race control messages
    const scLaps = new Set<number>();
    for (const msg of raceControlMessages) {
      if (
        msg.lap != null &&
        msg.category === "SafetyCar" &&
        msg.message.toLowerCase().includes("deployed")
      ) {
        scLaps.add(msg.lap);
      }
    }

    return { minLap, maxLap, lapRange, scLaps };
  }, [scHistory, raceControlMessages]);

  if (scHistory.length === 0) {
    return <div className="p-4 text-f1-text-dim">No SC probability history yet</div>;
  }

  if (!chartData) {
    return <div className="p-4 text-f1-text-dim">Loading chart...</div>;
  }

  return (
    <div className="p-4">
      <div className="space-y-4">
        {/* Legend */}
        <div className="flex gap-4 text-sm text-f1-text-dim">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-orange-500" />
            <span>SC Prob (1 lap)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-yellow-500" />
            <span>SC Prob (5 laps)</span>
          </div>
          <div className="flex items-center gap-1.5 ml-4">
            <div className="w-2 h-2 rounded-full bg-red-700/60" />
            <span className="text-xs">Critical (&gt;70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-yellow-700/60" />
            <span className="text-xs">Watch (40-70%)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-700/60" />
            <span className="text-xs">Safe (&lt;40%)</span>
          </div>
        </div>

        {/* Chart */}
        <div className="overflow-x-auto bg-f1-panel/30 rounded border border-f1-border">
          <ScProbabilityChart scHistory={scHistory} scHistory5={scHistory5} chartData={chartData} />
        </div>

        {/* Info */}
        <div className="text-xs text-f1-text-dim space-y-1">
          <div>
            Last 30 laps: <span className="text-f1-text">L{chartData.minLap} → L{chartData.maxLap}</span>
          </div>
          {chartData.scLaps.size > 0 && (
            <div>
              SC deployments: <span className="text-orange-400">{Array.from(chartData.scLaps).join(", ")}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
