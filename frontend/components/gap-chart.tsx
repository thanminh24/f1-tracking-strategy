"use client";
// Gap-to-leader vs lap, computed once from archived laps (seek-safe),
// with a moving "now" marker from the live tick.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api-client";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import type { LapRow } from "../lib/types";

interface Series {
  carId: string;
  team: string;
  points: { lap: number; gap: number }[];
}

function buildSeries(laps: LapRow[]): { series: Series[]; maxLap: number; maxGap: number } {
  const byCar = new Map<string, LapRow[]>();
  for (const lap of laps) {
    if (!byCar.has(lap.car_id)) byCar.set(lap.car_id, []);
    byCar.get(lap.car_id)!.push(lap);
  }
  // cumulative race time per car per lap
  const cum = new Map<string, Map<number, number>>();
  for (const [carId, rows] of byCar) {
    let total = 0;
    const m = new Map<number, number>();
    for (const r of rows.sort((a, b) => a.lap_number - b.lap_number)) {
      total += r.lap_time_ms ?? 0;
      if (r.lap_time_ms != null) m.set(r.lap_number, total);
    }
    cum.set(carId, m);
  }
  const maxLap = Math.max(...laps.map((l) => l.lap_number));
  const leaderAt = new Map<number, number>();
  for (let lap = 1; lap <= maxLap; lap++) {
    const times = [...cum.values()].map((m) => m.get(lap)).filter((t): t is number => t != null);
    if (times.length) leaderAt.set(lap, Math.min(...times));
  }
  let maxGap = 0;
  const series: Series[] = [...byCar.entries()].map(([carId, rows]) => {
    const points: { lap: number; gap: number }[] = [];
    for (let lap = 1; lap <= maxLap; lap++) {
      const t = cum.get(carId)?.get(lap);
      const lt = leaderAt.get(lap);
      if (t != null && lt != null) {
        const gap = (t - lt) / 1000;
        if (gap < 120) maxGap = Math.max(maxGap, gap); // clip lapped-car blowouts
        points.push({ lap, gap });
      }
    }
    return { carId, team: rows[0].team, points };
  });
  return { series, maxLap, maxGap: Math.min(Math.max(maxGap, 10), 120) };
}

const W = 600, H = 260, PAD = 30;

export function GapChart({ sessionKey }: { sessionKey: string }) {
  const [laps, setLaps] = useState<LapRow[]>([]);
  const currentLap = useRaceStateStore((s) => s.state?.leader_lap ?? 0);
  useEffect(() => {
    api.laps(sessionKey).then(setLaps).catch(() => setLaps([]));
  }, [sessionKey]);

  const chart = useMemo(() => (laps.length ? buildSeries(laps) : null), [laps]);
  if (!chart) return <div className="text-zinc-600 text-sm p-4">gap chart loading…</div>;

  const x = (lap: number) => PAD + ((lap - 1) / Math.max(chart.maxLap - 1, 1)) * (W - 2 * PAD);
  const y = (gap: number) => PAD + (Math.min(gap, chart.maxGap) / chart.maxGap) * (H - 2 * PAD);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <text x={PAD} y={14} fontSize={10} fill="#71717a">gap to leader (s) — down = further back</text>
      {chart.series.map((s) => (
        <polyline
          key={s.carId}
          fill="none"
          stroke={teamColor(s.team)}
          strokeWidth={1.2}
          opacity={0.85}
          points={s.points.map((p) => `${x(p.lap)},${y(p.gap)}`).join(" ")}
        />
      ))}
      {currentLap > 0 && (
        <line x1={x(currentLap)} x2={x(currentLap)} y1={PAD} y2={H - PAD}
          stroke="#fafafa" strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
      )}
      <text x={W - PAD} y={H - 6} fontSize={10} fill="#71717a" textAnchor="end">
        lap {currentLap || "—"} / {chart.maxLap}
      </text>
    </svg>
  );
}
