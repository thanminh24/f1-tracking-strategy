"use client";
// SVG track outline + car dots positioned by lap_fraction along the path.
// Dot motion smoothed with a CSS transition between 1Hz ticks.
import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api-client";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import type { OutlinePoint } from "../lib/types";

const TRACK_STATUS_COLORS: Record<string, string> = {
  green: "#3f3f46",
  yellow_zone: "#eab308",
  vsc: "#eab308",
  sc: "#f59e0b",
  red: "#ef4444",
};

function useOutline(sessionKey: string) {
  const [points, setPoints] = useState<OutlinePoint[]>([]);
  useEffect(() => {
    api.trackOutline(sessionKey).then(setPoints).catch(() => setPoints([]));
  }, [sessionKey]);
  return points;
}

export function TrackMap({ sessionKey }: { sessionKey: string }) {
  const points = useOutline(sessionKey);
  const state = useRaceStateStore((s) => s.state);

  // Normalize outline into a 0-1000 viewBox + cumulative arc lengths for projection.
  const geo = useMemo(() => {
    if (points.length < 10) return null;
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
    const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
    const scale = 940 / Math.max(maxX - minX, maxY - minY);
    const norm = points.map((p) => ({
      x: (p.x - minX) * scale + 30,
      y: (maxY - p.y) * scale + 30, // flip y: telemetry coords are y-up
    }));
    const cum: number[] = [0];
    for (let i = 1; i < norm.length; i++) {
      cum.push(cum[i - 1] + Math.hypot(norm[i].x - norm[i - 1].x, norm[i].y - norm[i - 1].y));
    }
    const total = cum[cum.length - 1];
    const at = (frac: number) => {
      const target = ((frac % 1) + 1) % 1 * total;
      let lo = 0, hi = cum.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < target) lo = mid + 1;
        else hi = mid;
      }
      return norm[lo];
    };
    const d = `M ${norm.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;
    return { d, at };
  }, [points]);

  if (!geo) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
        track map loading…
      </div>
    );
  }

  return (
    <svg viewBox="0 0 1000 1000" className="w-full h-full">
      <path
        d={geo.d}
        fill="none"
        stroke={TRACK_STATUS_COLORS[state?.track_status ?? "green"]}
        strokeWidth={14}
        strokeLinejoin="round"
      />
      {state?.cars
        .filter((c) => c.status !== "out" && c.status !== "finished")
        .map((car) => {
          const pos = geo.at(car.lap_fraction);
          return (
            <g
              key={car.car_id}
              style={{
                transform: `translate(${pos.x}px, ${pos.y}px)`,
                transition: "transform 1s linear",
              }}
            >
              <circle r={11} fill={teamColor(car.team)} stroke="#000" strokeWidth={1.5} />
              <text y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#000">
                {car.position}
              </text>
            </g>
          );
        })}
    </svg>
  );
}
