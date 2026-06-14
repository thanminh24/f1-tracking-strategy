"use client";
// Floating panel overlaid on the track map showing live CarData.z telemetry
// for the currently focused driver. Toggled by a small button on the track map.
import { useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { useLiveTelemetryStore } from "../lib/live-telemetry-store";
import { teamColor } from "../lib/team-colors";
import type { LiveTelemetrySample } from "../lib/live-telemetry-store";

// Minimal inline sparkline using SVG polyline
function Sparkline({
  samples,
  valueKey,
  max,
  color,
  height = 28,
  width = 80,
}: {
  samples: LiveTelemetrySample[];
  valueKey: keyof LiveTelemetrySample;
  max: number;
  color: string;
  height?: number;
  width?: number;
}) {
  if (samples.length < 2) return <div style={{ width, height }} />;
  const n = Math.min(samples.length, 40);
  const slice = samples.slice(-n);
  const pts = slice.map((s, i) => {
    const x = (i / (n - 1)) * width;
    const y = height - (Math.min(Number(s[valueKey]), max) / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg width={width} height={height} className="block">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GearDisplay({ gear }: { gear: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-f1-muted uppercase tracking-wide">Gear</span>
      <span className="font-data text-2xl font-bold text-f1-text leading-none">{gear}</span>
    </div>
  );
}

function DrsIndicator({ drs }: { drs: number }) {
  const active = drs >= 10;
  const eligible = drs === 8;
  return (
    <div className={`chip text-[9px] px-1.5 h-5 border ${
      active
        ? "bg-green-900/60 text-green-400 border-green-400/40"
        : eligible
        ? "bg-yellow-900/60 text-yellow-400 border-yellow-400/40"
        : "bg-zinc-800 text-zinc-500 border-zinc-700"
    }`}>
      DRS
    </div>
  );
}

function StatBar({
  label,
  value,
  max,
  color,
  unit,
  samples,
  valueKey,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  unit: string;
  samples: LiveTelemetrySample[];
  valueKey: keyof LiveTelemetrySample;
}) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-f1-muted uppercase tracking-wide">{label}</span>
        <span className="font-data text-xs text-f1-text tabular-nums">
          {value}<span className="text-[9px] text-f1-muted ml-0.5">{unit}</span>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-100"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
        <Sparkline samples={samples} valueKey={valueKey} max={max} color={color} width={60} height={20} />
      </div>
    </div>
  );
}

interface Props {
  /** Pass isLive from parent to avoid showing panel during archive replay */
  isLive: boolean;
}

export function LiveTelemetryPanel({ isLive }: Props) {
  const [open, setOpen] = useState(false);

  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const car = useRaceStateStore((s) =>
    s.state?.cars.find((c) => c.car_id === focusedCarId),
  );
  const telemetryData = useLiveTelemetryStore((s) => s.data);

  // Only show in live mode
  if (!isLive) return null;

  const samples = focusedCarId ? (telemetryData[focusedCarId] ?? []) : [];
  const last = samples.at(-1);
  const color = teamColor(car?.team ?? null);
  const driverLabel = car?.driver_code ?? focusedCarId ?? "—";

  return (
    <div className="absolute bottom-2 left-2 z-20 flex flex-col items-start gap-1">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`chip text-[10px] font-medium transition-colors border ${
          open
            ? "bg-zinc-700 text-f1-text border-zinc-500"
            : "bg-zinc-900/80 text-f1-text-dim border-f1-border"
        }`}
        title={focusedCarId ? `${driverLabel} telemetry` : "Select a driver first"}
      >
        {open ? "▾ Telemetry" : "▸ Telemetry"}
        {focusedCarId && (
          <span
            className="ml-1 font-bold"
            style={{ color }}
          >
            {driverLabel}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="bg-f1-panel/95 backdrop-blur border border-f1-border shadow-xl rounded p-3 w-56 flex flex-col gap-3">
          {!focusedCarId ? (
            <p className="text-[11px] text-f1-muted text-center py-2">
              Click a driver on the map or tower to select
            </p>
          ) : samples.length === 0 ? (
            <p className="text-[11px] text-f1-muted text-center py-2">
              Waiting for {driverLabel} telemetry…
            </p>
          ) : (
            <>
              {/* Header: driver + gear + DRS */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-6 rounded-sm shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <span className="font-data font-bold text-sm text-f1-text">{driverLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <GearDisplay gear={last?.gear ?? 0} />
                  <DrsIndicator drs={last?.drs ?? 0} />
                </div>
              </div>

              {/* Speed — primary metric */}
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-[9px] text-f1-muted uppercase tracking-wide">Speed</span>
                  <span className="font-data text-xl font-bold tabular-nums" style={{ color }}>
                    {last?.speed ?? 0}
                    <span className="text-[10px] text-f1-muted ml-1">km/h</span>
                  </span>
                </div>
                <Sparkline samples={samples} valueKey="speed" max={360} color={color} width={208} height={36} />
              </div>

              {/* RPM */}
              <StatBar
                label="RPM" value={last?.rpm ?? 0} max={14000} unit=""
                color="#60A5FA" samples={samples} valueKey="rpm"
              />

              {/* Throttle */}
              <StatBar
                label="Throttle" value={last?.throttle ?? 0} max={100} unit="%"
                color="#22C55E" samples={samples} valueKey="throttle"
              />

              {/* Brake */}
              <StatBar
                label="Brake" value={last?.brake ?? 0} max={100} unit="%"
                color="#EF4444" samples={samples} valueKey="brake"
              />

              <p className="text-[9px] text-f1-muted text-right">
                {samples.length} samples buffered
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
