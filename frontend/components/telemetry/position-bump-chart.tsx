"use client";
// Phase 08: Position bump chart — lap-by-lap position evolution for all drivers.
import { useMemo, useState } from "react";
import { teamColor } from "../../lib/team-colors";
import type { LapRow } from "../../lib/types";

interface Props {
  laps: LapRow[];
}

const W = 680; const H = 290;
const LEFT = 40; const RIGHT = 80; const TOP = 16; const BOTTOM = 28;

function xScale(lap: number, maxLap: number) {
  return LEFT + ((lap - 1) / Math.max(maxLap - 1, 1)) * W;
}
function yScale(pos: number) {
  return TOP + ((pos - 1) / 19) * H;
}

export function PositionBumpChart({ laps }: Props) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hovered, setHovered] = useState<number | null>(null);

  const { series, maxLap } = useMemo(() => {
    type Series = { driverCode: string; team: string; points: { lap: number; pos: number }[] };
    const map = new Map<string, Series>();
    let max = 1;
    for (const l of laps) {
      if (l.position == null) continue;
      if (!map.has(l.car_id)) map.set(l.car_id, { driverCode: l.driver_code, team: l.team, points: [] });
      map.get(l.car_id)!.points.push({ lap: l.lap_number, pos: l.position });
      if (l.lap_number > max) max = l.lap_number;
    }
    for (const s of map.values()) s.points.sort((a, b) => a.lap - b.lap);
    return { series: map, maxLap: max };
  }, [laps]);

  const toggle = (id: string) =>
    setHidden((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const posAtHover = hovered != null ? new Map<string, number>() : null;
  if (hovered != null && posAtHover) {
    for (const [id, s] of series) {
      const pt = s.points.find((p) => p.lap === hovered);
      if (pt) posAtHover.set(id, pt.pos);
    }
  }

  if (series.size === 0) {
    return <div className="flex items-center justify-center h-40 text-sm text-f1-muted">No position data available</div>;
  }

  const lapTicks = Array.from({ length: Math.floor(maxLap / 10) }, (_, i) => (i + 1) * 10).filter(l => l <= maxLap);

  return (
    <div className="flex flex-col gap-2 p-3">
      <svg
        viewBox={`0 0 ${LEFT + W + RIGHT} ${TOP + H + BOTTOM}`}
        className="w-full"
        style={{ maxHeight: 340 }}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const svgW = LEFT + W + RIGHT;
          const px = ((e.clientX - rect.left) / rect.width) * svgW - LEFT;
          const lap = Math.round(1 + (px / W) * (maxLap - 1));
          setHovered(Math.max(1, Math.min(maxLap, lap)));
        }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* Y axis labels */}
        {[1, 5, 10, 15, 20].map((p) => (
          <text key={p} x={LEFT - 4} y={yScale(p) + 4} textAnchor="end" fontSize={9} fill="#707070">{p}</text>
        ))}
        {/* X axis labels */}
        {lapTicks.map((l) => (
          <text key={l} x={xScale(l, maxLap)} y={TOP + H + 16} textAnchor="middle" fontSize={9} fill="#707070">{l}</text>
        ))}
        {/* Driver lines */}
        {Array.from(series.entries()).map(([id, s]) => {
          if (hidden.has(id) || s.points.length < 2) return null;
          const color = teamColor(s.team);
          const pts = s.points.map((p) => `${xScale(p.lap, maxLap)},${yScale(p.pos)}`).join(" ");
          const last = s.points[s.points.length - 1];
          return (
            <g key={id}>
              <polyline points={pts} stroke={color} strokeWidth="1.5" fill="none" opacity="0.85" />
              <text x={xScale(last.lap, maxLap) + 4} y={yScale(last.pos) + 4} fontSize={8} fill={color}>
                {s.driverCode?.slice(0, 3)}
              </text>
            </g>
          );
        })}
        {/* Hover crosshair */}
        {hovered != null && (
          <line
            x1={xScale(hovered, maxLap)} y1={TOP}
            x2={xScale(hovered, maxLap)} y2={TOP + H}
            stroke="#FFFFFF" strokeWidth="0.5" strokeDasharray="3 2" opacity="0.5"
          />
        )}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-2 px-1">
        {Array.from(series.entries()).map(([id, s]) => {
          const color = teamColor(s.team);
          const isHidden = hidden.has(id);
          return (
            <button
              key={id}
              onClick={() => toggle(id)}
              className="flex items-center gap-1 text-[10px] font-data transition-opacity"
              style={{ opacity: isHidden ? 0.35 : 1 }}
            >
              <span className="w-3 h-1.5 rounded-sm inline-block" style={{ backgroundColor: color }} />
              <span style={{ color }}>{s.driverCode?.slice(0, 3)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
