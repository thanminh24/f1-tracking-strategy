"use client";
import type { LapRow } from "../../lib/types";
import { teamColor } from "../../lib/team-colors";

export interface PaceStats {
  car_id: string;
  driver_code: string;
  team: string;
  avg: number;
  last5avg: number;
  best: number;
  stddev: number;
}

export type SortKey = "driver" | "avg" | "last5" | "best" | "stddev";

export function computePaceStats(laps: LapRow[]): PaceStats[] {
  const carData = new Map<string, { driver_code: string; team: string; times: number[] }>();

  for (const lap of laps) {
    if (lap.lap_time_ms == null || lap.lap_time_ms <= 0) continue;

    if (!carData.has(lap.car_id)) {
      carData.set(lap.car_id, {
        driver_code: lap.driver_code,
        team: lap.team,
        times: [],
      });
    }

    carData.get(lap.car_id)!.times.push(lap.lap_time_ms);
  }

  const result: PaceStats[] = [];
  for (const [carId, data] of carData.entries()) {
    const times = data.times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const last5 = times.slice(-5);
    const last5avg = last5.length > 0 ? last5.reduce((a, b) => a + b, 0) / last5.length : avg;
    const best = times[0];
    const variance = times.reduce((a, t) => a + (t - avg) ** 2, 0) / times.length;
    const stddev = Math.sqrt(variance);

    result.push({
      car_id: carId,
      driver_code: data.driver_code,
      team: data.team,
      avg,
      last5avg,
      best,
      stddev,
    });
  }

  return result;
}

function formatTime(ms: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

interface Props {
  stats: PaceStats[];
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (key: SortKey) => void;
}

export function PaceStatsTable({ stats, sortKey, sortDir, onSort }: Props) {
  const slowest = Math.max(...stats.map((s) => s.avg));
  const fastest = Math.min(...stats.map((s) => s.avg));
  const range = slowest - fastest;
  const maxBarWidth = 150;

  const handleSort = (key: SortKey) => {
    onSort(key);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm font-data">
        <thead className="border-b border-f1-border">
          <tr className="text-f1-text-dim text-left">
            <th
              className="px-3 py-2 cursor-pointer hover:text-f1-text"
              onClick={() => handleSort("driver")}
            >
              Driver {sortKey === "driver" && (sortDir === "asc" ? "↑" : "↓")}
            </th>
            <th className="px-3 py-2 w-2">Team</th>
            <th
              className="px-3 py-2 text-right cursor-pointer hover:text-f1-text"
              onClick={() => handleSort("avg")}
            >
              Avg Lap {sortKey === "avg" && (sortDir === "asc" ? "↑" : "↓")}
            </th>
            <th
              className="px-3 py-2 text-right cursor-pointer hover:text-f1-text"
              onClick={() => handleSort("last5")}
            >
              Last 5 {sortKey === "last5" && (sortDir === "asc" ? "↑" : "↓")}
            </th>
            <th
              className="px-3 py-2 text-right cursor-pointer hover:text-f1-text"
              onClick={() => handleSort("best")}
            >
              Best {sortKey === "best" && (sortDir === "asc" ? "↑" : "↓")}
            </th>
            <th
              className="px-3 py-2 text-right cursor-pointer hover:text-f1-text"
              onClick={() => handleSort("stddev")}
            >
              Std Dev {sortKey === "stddev" && (sortDir === "asc" ? "↑" : "↓")}
            </th>
            <th className="px-3 py-2">Pace</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-f1-border/30">
          {stats.map((s) => {
            const color = teamColor(s.team);
            const barLen = range > 0 ? ((slowest - s.avg) / range) * maxBarWidth : 0;

            return (
              <tr key={s.car_id} className="hover:bg-f1-panel/20">
                <td className="px-3 py-2 font-semibold" style={{ color }}>
                  {s.driver_code}
                </td>
                <td className="px-3 py-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                </td>
                <td className="px-3 py-2 text-right font-mono">{formatTime(s.avg)}</td>
                <td className="px-3 py-2 text-right font-mono">{formatTime(s.last5avg)}</td>
                <td className="px-3 py-2 text-right font-mono text-green-400">
                  {formatTime(s.best)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs text-f1-text-dim">
                  {(s.stddev / 1000).toFixed(2)}s
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 rounded"
                      style={{
                        width: `${barLen}px`,
                        backgroundColor: color,
                        opacity: 0.7,
                      }}
                    />
                    <span className="text-xs text-f1-text-dim">
                      {((barLen / maxBarWidth) * 100).toFixed(0)}%
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
