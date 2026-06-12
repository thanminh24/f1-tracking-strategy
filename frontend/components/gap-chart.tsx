"use client";
// Gap-to-leader vs lap. Team-colored polylines, pit-window probability bands,
// grid lines, axis labels, and a moving "now" marker.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api-client";
import { usePredictionStore } from "../lib/prediction-store";
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
        if (gap < 120) maxGap = Math.max(maxGap, gap);
        points.push({ lap, gap });
      }
    }
    return { carId, team: rows[0].team, points };
  });
  return { series, maxLap, maxGap: Math.min(Math.max(maxGap, 10), 120) };
}

const W = 600, H = 220, PAD_L = 34, PAD_R = 10, PAD_T = 10, PAD_B = 20;

export function GapChart({ sessionKey }: { sessionKey: string }) {
  const [laps, setLaps] = useState<LapRow[]>([]);
  const currentLap = useRaceStateStore((s) => s.state?.leader_lap ?? 0);
  const prediction = usePredictionStore((s) => s.prediction);

  useEffect(() => {
    api.laps(sessionKey).then(setLaps).catch(() => setLaps([]));
  }, [sessionKey]);

  const chart = useMemo(() => (laps.length ? buildSeries(laps) : null), [laps]);

  const pitBands = useMemo(() => {
    if (!prediction) return new Map<number, number>();
    const agg = new Map<number, number>();
    for (const car of prediction.cars) {
      for (const [lapStr, p] of Object.entries(car.pit_window_probs)) {
        const lap = Number(lapStr);
        agg.set(lap, 1 - (1 - (agg.get(lap) ?? 0)) * (1 - p));
      }
    }
    return agg;
  }, [prediction]);

  if (!chart) {
    return <div className="text-f1-muted text-xs p-4 text-center">gap chart loading…</div>;
  }

  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const x = (lap: number) => PAD_L + ((lap - 1) / Math.max(chart.maxLap - 1, 1)) * plotW;
  const y = (gap: number) => PAD_T + (Math.min(gap, chart.maxGap) / chart.maxGap) * plotH;
  const bandW = plotW / Math.max(chart.maxLap - 1, 1);

  // Y-axis ticks
  const yTicks: number[] = [];
  const tickStep = chart.maxGap > 60 ? 20 : chart.maxGap > 20 ? 10 : 5;
  for (let v = 0; v <= chart.maxGap; v += tickStep) yTicks.push(v);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {/* Y grid lines + labels */}
      {yTicks.map((v) => (
        <g key={v}>
          <line
            x1={PAD_L} x2={W - PAD_R}
            y1={y(v)} y2={y(v)}
            stroke="#1c1c1c" strokeWidth={1}
          />
          <text x={PAD_L - 4} y={y(v) + 3} fontSize={8} fill="#444"
            textAnchor="end" fontFamily="var(--font-mono)">
            {v}s
          </text>
        </g>
      ))}

      {/* Pit probability bands */}
      {[...pitBands.entries()].map(([lap, p]) => (
        <rect key={lap}
          x={x(lap) - bandW / 2} y={PAD_T}
          width={bandW} height={plotH}
          fill="#38bdf8" opacity={Math.min(p, 1) * 0.18}
        >
          <title>{`P(any pit on lap ${lap}) = ${Math.round(p * 100)}%`}</title>
        </rect>
      ))}

      {/* Series lines */}
      {chart.series.map((s) => (
        <polyline
          key={s.carId}
          fill="none"
          stroke={teamColor(s.team)}
          strokeWidth={1.2}
          opacity={0.85}
          strokeLinejoin="round"
          points={s.points.map((p) => `${x(p.lap).toFixed(1)},${y(p.gap).toFixed(1)}`).join(" ")}
        />
      ))}

      {/* Current lap marker */}
      {currentLap > 0 && (
        <line
          x1={x(currentLap)} x2={x(currentLap)}
          y1={PAD_T} y2={PAD_T + plotH}
          stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="3 3"
        />
      )}

      {/* Axis bottom */}
      <line x1={PAD_L} x2={W - PAD_R} y1={PAD_T + plotH} y2={PAD_T + plotH}
        stroke="#252525" strokeWidth={1} />

      {/* Lap label */}
      <text x={W - PAD_R} y={H - 4} fontSize={8} fill="#444"
        textAnchor="end" fontFamily="var(--font-mono)">
        lap {currentLap || "—"} / {chart.maxLap}
      </text>
    </svg>
  );
}
