"use client";
// Multi-lap, multi-channel SVG telemetry traces.
import {
  CHANNELS,
  PAD_L,
  PAD_R,
  W,
  ROW_H,
  getChannelValue,
  toX,
  toY,
  type ChannelDef,
} from "../../lib/telemetry-chart-helpers";
import type { TelemetrySample } from "../../lib/types";

interface SelectedLap {
  carId: string;
  lap: number;
  label: string;
  color: string;
}

interface Props {
  samples: Map<string, TelemetrySample[]>;
  selectedLaps: SelectedLap[];
  visibleChannels: Set<"speed" | "throttle" | "brake" | "gear">;
}

function ChannelRow({
  channel,
  selectedLaps,
  samples,
  rowH,
}: {
  channel: ChannelDef;
  selectedLaps: SelectedLap[];
  samples: Map<string, TelemetrySample[]>;
  rowH: number;
}) {
  const maxDist = Math.max(...[...samples.values()].flat().map((s) => s.distance_m), 1);
  const gridVals = [channel.min, channel.min + (channel.max - channel.min) * 0.5, channel.max];

  return (
    <div className="border-b border-f1-border">
      <svg width="100%" viewBox={`0 0 ${W} ${rowH}`} preserveAspectRatio="none" style={{ height: `${rowH}px` }}>
        {gridVals.map((v) => {
          const y = toY(v, channel, rowH);
          return (
            <g key={v}>
              <line x1={PAD_L} y1={y} x2={W - PAD_R} y2={y} stroke="#2D2D2D" strokeWidth="0.5" />
              <text x={PAD_L - 4} y={y + 3} textAnchor="end" fontSize="9" fill="#707070" fontFamily="ui-monospace,monospace">
                {Math.round(v)}
              </text>
            </g>
          );
        })}
        <text x="2" y={rowH / 2} textAnchor="start" fontSize="11" fontWeight="500" fill="#B0B0B0" fontFamily="ui-sans-serif,sans-serif" transform={`rotate(-90, 2, ${rowH / 2})`}>
          {channel.label} ({channel.unit})
        </text>
        {selectedLaps.map((lapInfo) => {
          const key = `${lapInfo.carId}-${lapInfo.lap}`;
          const lapSamples = samples.get(key);
          if (!lapSamples?.length) return null;
          const pts = lapSamples.map((s) => `${toX(s.distance_m, maxDist).toFixed(1)},${toY(getChannelValue(s, channel.key), channel, rowH).toFixed(1)}`).join(" ");
          return (
            <polyline
              key={key}
              points={pts}
              fill="none"
              stroke={lapInfo.color}
              strokeWidth="2"
              strokeOpacity="0.88"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </svg>
    </div>
  );
}

export function MultiLapTracesChart({ samples, selectedLaps, visibleChannels }: Props) {
  if (selectedLaps.length === 0 || visibleChannels.size === 0) {
    return <div className="flex items-center justify-center h-32 text-sm text-f1-muted bg-f1-surface rounded">Select driver(s) and lap filter to view telemetry</div>;
  }
  return (
    <div className="flex flex-col divide-y divide-f1-border bg-f1-surface rounded">
      <div className="flex items-center gap-4 px-3 py-2 border-b border-f1-border">
        {selectedLaps.map((lapInfo) => (
          <div key={`${lapInfo.carId}-${lapInfo.lap}`} className="flex items-center gap-2">
            <div className="w-4 h-1 rounded-full" style={{ backgroundColor: lapInfo.color }} />
            <span className="text-xs text-f1-text-dim font-data">
              {lapInfo.label}
            </span>
          </div>
        ))}
      </div>
      {Array.from(visibleChannels).map((chName) => (
        <ChannelRow key={chName} channel={CHANNELS[chName]} selectedLaps={selectedLaps} samples={samples} rowH={ROW_H} />
      ))}
      <div className="px-3 py-1.5 text-xs text-f1-muted font-data">Distance (m)</div>
    </div>
  );
}
