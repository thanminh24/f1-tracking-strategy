"use client";
// Multi-lap telemetry overlay. Each trace is a single driver/lap combination.
// Channels: speed, throttle, gear + brake strip. No cross-driver delta.
import { useRef, useState } from "react";
import type { TelemetrySample } from "../lib/types";

export interface LapTrace {
  lap: number;
  color: string;
  data: TelemetrySample[];
  isFastest?: boolean;
  /** Human-readable label shown in the legend, e.g. "VER L47 ★" */
  label?: string;
}

const W = 900;
const PAD_L = 40;
const PAD_R = 12;
const PAD_T = 6;
const CHAN_H = 88;
const BRAKE_H = 22;

const CHANNELS: { key: keyof TelemetrySample; label: string; unit: string; min: number; max: number }[] = [
  { key: "speed_kmh", label: "SPEED", unit: "km/h", min: 0, max: 360 },
  { key: "throttle", label: "THROTTLE", unit: "%", min: 0, max: 100 },
  { key: "gear", label: "GEAR", unit: "", min: 0, max: 8 },
];

const LEGEND_H = 18;
const TOTAL_H = PAD_T + CHANNELS.length * CHAN_H + BRAKE_H + 20 + LEGEND_H;

export function TelemetryTraces({ traces }: { traces: LapTrace[] }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorX, setCursorX] = useState<number | null>(null);

  if (!traces.length) {
    return (
      <div className="flex items-center justify-center h-48 text-f1-muted text-sm">
        Select a lap from the list to load telemetry
      </div>
    );
  }

  const xMax = Math.max(...traces.map(({ data }) => data.at(-1)?.distance_m ?? 0), 1);

  const px = (d: number) => PAD_L + (d / xMax) * (W - PAD_L - PAD_R);

  // vertical grid every 1000m, or every 500m for short tracks
  const gridStep = xMax > 4000 ? 1000 : 500;
  const gridLines: number[] = [];
  for (let d = 0; d <= xMax; d += gridStep) gridLines.push(d);

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    setCursorX(Math.max(PAD_L, Math.min(W - PAD_R, relX)));
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${TOTAL_H}`}
      className="w-full select-none"
      onMouseMove={onMouseMove}
      onMouseLeave={() => setCursorX(null)}
    >
      {CHANNELS.map((chan, ci) => {
        const y0 = PAD_T + ci * CHAN_H;
        const innerH = CHAN_H - 14;
        const py = (v: number) =>
          y0 + 10 + (1 - Math.max(0, Math.min(1, (Number(v) - chan.min) / (chan.max - chan.min)))) * innerH;

        return (
          <g key={chan.key}>
            {/* Alternating channel background */}
            <rect
              x={PAD_L} y={y0}
              width={W - PAD_L - PAD_R} height={CHAN_H - 2}
              fill={ci % 2 === 0 ? "rgba(255,255,255,0.018)" : "transparent"}
            />

            {/* Channel label */}
            <text x={PAD_L - 4} y={y0 + 14} fontSize={9} fill="#484848" textAnchor="end"
              fontFamily="var(--font-mono)">{chan.label}</text>
            {chan.unit && (
              <text x={PAD_L - 4} y={y0 + 24} fontSize={7} fill="#333" textAnchor="end"
                fontFamily="var(--font-mono)">{chan.unit}</text>
            )}

            {/* Horizontal grid lines at 25/50/75% */}
            {[0.25, 0.5, 0.75].map((f) => {
              const gy = y0 + 10 + (1 - f) * innerH;
              return (
                <line key={f} x1={PAD_L} x2={W - PAD_R} y1={gy} y2={gy}
                  stroke="#1c1c1c" strokeWidth={1} />
              );
            })}

            {/* Vertical grid lines (shared distance markers) */}
            {gridLines.map((d) => (
              <line key={d} x1={px(d)} x2={px(d)} y1={y0} y2={y0 + CHAN_H - 2}
                stroke="#1a1a1a" strokeWidth={1} />
            ))}

            {/* Traces — dimmer ones first, fastest on top */}
            {[...traces].sort((a) => a.isFastest ? 1 : -1).map(({ lap, label, color, data, isFastest }) => (
              <polyline key={label ?? lap}
                fill="none"
                stroke={color}
                strokeWidth={isFastest ? 1.6 : 0.9}
                opacity={isFastest ? 1 : 0.6}
                strokeLinejoin="round"
                points={data
                  .map((s) => `${px(s.distance_m).toFixed(1)},${py(Number(s[chan.key])).toFixed(1)}`)
                  .join(" ")}
              />
            ))}
          </g>
        );
      })}

      {/* Brake strip */}
      {(() => {
        const y0 = PAD_T + CHANNELS.length * CHAN_H;
        return (
          <g>
            <text x={PAD_L - 4} y={y0 + 13} fontSize={9} fill="#484848" textAnchor="end"
              fontFamily="var(--font-mono)">BRAKE</text>
            <rect x={PAD_L} y={y0} width={W - PAD_L - PAD_R} height={BRAKE_H - 2}
              fill="rgba(255,255,255,0.018)" />
            {gridLines.map((d) => (
              <line key={d} x1={px(d)} x2={px(d)} y1={y0} y2={y0 + BRAKE_H - 2}
                stroke="#1a1a1a" strokeWidth={1} />
            ))}
            {/* Use first trace for brake markers */}
            {traces[0]?.data.map((s, i) =>
              s.brake ? (
                <rect key={i}
                  x={px(s.distance_m) - 1} y={y0 + 3}
                  width={3} height={BRAKE_H - 8}
                  fill="#ef4444" opacity={0.75} />
              ) : null
            )}
          </g>
        );
      })()}

      {/* Distance axis */}
      <g>
        {gridLines.map((d) => (
          <text key={d} x={px(d)} y={TOTAL_H - 3} fontSize={8} fill="#3a3a3a"
            textAnchor="middle" fontFamily="var(--font-mono)">
            {(d / 1000).toFixed(d % 1000 === 0 ? 0 : 1)}km
          </text>
        ))}
      </g>

      {/* Trace legend — one colored dot + label per trace */}
      {traces.length > 1 && (() => {
        const y = PAD_T + CHANNELS.length * CHAN_H + BRAKE_H + 14;
        let x = PAD_L;
        return (
          <g>
            {traces.map((t) => {
              const lbl = t.label ?? `L${t.lap}`;
              const itemW = lbl.length * 6.5 + 16;
              const el = (
                <g key={t.label ?? t.lap} transform={`translate(${x}, ${y})`}>
                  <circle cx={5} cy={-3} r={3.5} fill={t.color} opacity={0.9} />
                  <text x={12} y={0} fontSize={8} fill="#666" fontFamily="var(--font-mono)">{lbl}</text>
                </g>
              );
              x += itemW;
              return el;
            })}
          </g>
        );
      })()}

      {/* Hover cursor */}
      {cursorX != null && (
        <line
          x1={cursorX} x2={cursorX}
          y1={PAD_T} y2={PAD_T + CHANNELS.length * CHAN_H + BRAKE_H - 2}
          stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="3 3"
          style={{ pointerEvents: "none" }}
        />
      )}
    </svg>
  );
}
