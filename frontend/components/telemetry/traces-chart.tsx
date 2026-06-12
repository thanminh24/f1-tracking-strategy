"use client";
// Multi-channel telemetry traces for one or more laps of a single car.
// Channels: speed, throttle, brake, gear, RPM. All vs distance.
import type { TelemetrySample } from "../../lib/types";

interface Trace {
  label: string;
  color: string;
  samples: TelemetrySample[];
}

interface ChannelDef {
  key: keyof TelemetrySample;
  label: string;
  unit: string;
  maxVal: number;
}

const CHANNELS: ChannelDef[] = [
  { key: "speed_kmh", label: "Speed", unit: "km/h", maxVal: 360 },
  { key: "throttle", label: "Throttle", unit: "%", maxVal: 100 },
  { key: "rpm", label: "RPM", unit: "", maxVal: 15000 },
  { key: "gear", label: "Gear", unit: "", maxVal: 8 },
];

interface Props {
  traces: Trace[];
  /** px height per channel row */
  rowHeight?: number;
}

const PAD_L = 40;
const PAD_R = 8;
const PAD_T = 4;
const PAD_B = 20;
const W = 800;

function ChannelRow({
  channel,
  traces,
  rowH,
}: {
  channel: ChannelDef;
  traces: Trace[];
  rowH: number;
}) {
  const H = rowH - PAD_T - PAD_B;

  const maxDist = Math.max(
    ...traces.flatMap((t) => t.samples.map((s) => s.distance_m)),
    1
  );

  const toX = (d: number) => PAD_L + ((d / maxDist) * (W - PAD_L - PAD_R));
  const toY = (v: number) =>
    PAD_T + H - Math.min((v / channel.maxVal) * H, H);

  const gridVals = [0, channel.maxVal * 0.5, channel.maxVal];

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${W} ${rowH}`}
      preserveAspectRatio="none"
      className="block"
      style={{ height: rowH }}
    >
      {/* Grid */}
      {gridVals.map((v) => {
        const y = toY(v);
        return (
          <g key={v}>
            <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#2D2D2D" strokeWidth="0.5" />
            <text x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize="8" fill="#707070" fontFamily="ui-monospace,monospace">
              {v}
            </text>
          </g>
        );
      })}

      {/* Channel label */}
      <text x={2} y={rowH / 2} textAnchor="start" fontSize="9" fill="#B0B0B0" fontFamily="ui-sans-serif,sans-serif"
        transform={`rotate(-90, 2, ${rowH / 2})`}>
        {channel.label}
      </text>

      {/* Traces */}
      {traces.map((trace) => {
        const pts = trace.samples
          .map((s) => `${toX(s.distance_m).toFixed(1)},${toY(Number(s[channel.key])).toFixed(1)}`)
          .join(" ");
        return (
          <polyline
            key={trace.label}
            points={pts}
            fill="none"
            stroke={trace.color}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </svg>
  );
}

export function TracesChart({ traces, rowHeight = 80 }: Props) {
  if (traces.length === 0) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-f1-muted">
        Select a lap to view telemetry
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-f1-border">
      {/* Legend */}
      <div className="flex items-center gap-4 px-2 py-1.5">
        {traces.map((t) => (
          <div key={t.label} className="flex items-center gap-1.5">
            <span className="w-4 h-1 rounded-full" style={{ backgroundColor: t.color }} />
            <span className="font-data text-xs text-f1-text-dim">{t.label}</span>
          </div>
        ))}
      </div>

      {CHANNELS.map((ch) => (
        <ChannelRow key={ch.key} channel={ch} traces={traces} rowH={rowHeight} />
      ))}

      {/* Distance axis */}
      <div className="px-2 py-1 text-[10px] text-f1-muted font-data">Distance (m)</div>
    </div>
  );
}
