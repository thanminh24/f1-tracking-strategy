"use client";
// Distance-aligned telemetry overlay for up to two driver/lap selections,
// with speed-delta strip. Hand-rolled SVG lines (no chart dep).
import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import type { TelemetrySample } from "../lib/types";

export interface TraceSelection {
  carId: string;
  lap: number;
  color: string;
}

const W = 800, ROW_H = 120, PAD = 36;

function Line({ data, xMax, yMax, yMin = 0, color, row, label }: {
  data: { x: number; y: number }[]; xMax: number; yMax: number; yMin?: number;
  color: string; row: number; label: string;
}) {
  const y0 = row * ROW_H + 18;
  const px = (x: number) => PAD + (x / xMax) * (W - PAD - 8);
  const py = (y: number) => y0 + (1 - (y - yMin) / Math.max(yMax - yMin, 1e-6)) * (ROW_H - 30);
  return (
    <>
      <text x={PAD} y={y0 + 8} fontSize={10} fill="#71717a">{label}</text>
      <polyline fill="none" stroke={color} strokeWidth={1.3} opacity={0.9}
        points={data.map((p) => `${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(" ")} />
    </>
  );
}

export function TelemetryTraces({ sessionKey, selections }: {
  sessionKey: string; selections: TraceSelection[];
}) {
  const [traces, setTraces] = useState<Map<string, TelemetrySample[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Map<string, TelemetrySample[]>();
      for (const sel of selections) {
        try {
          next.set(`${sel.carId}_${sel.lap}`,
            await api.telemetry(sessionKey, sel.carId, sel.lap));
        } catch { /* lap unavailable — skip trace */ }
      }
      if (!cancelled) setTraces(next);
    })();
    return () => { cancelled = true; };
  }, [sessionKey, selections]);

  const loaded = selections
    .map((sel) => ({ sel, data: traces.get(`${sel.carId}_${sel.lap}`) }))
    .filter((t): t is { sel: TraceSelection; data: TelemetrySample[] } => !!t.data?.length);
  if (!loaded.length) {
    return <div className="text-zinc-600 text-sm p-4">select driver + lap to load telemetry…</div>;
  }

  const xMax = Math.max(...loaded.map(({ data }) => data[data.length - 1].distance_m));
  const rows: { key: keyof TelemetrySample; label: string; yMax: number }[] = [
    { key: "speed_kmh", label: "speed (km/h)", yMax: 360 },
    { key: "throttle", label: "throttle (%)", yMax: 100 },
    { key: "gear", label: "gear", yMax: 8 },
  ];

  // speed delta strip (only when exactly 2 traces)
  const totalH = rows.length * ROW_H + (loaded.length === 2 ? ROW_H : 0) + 10;

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full">
      {rows.map((row, i) =>
        loaded.map(({ sel, data }) => (
          <Line key={`${row.key}_${sel.carId}_${sel.lap}`} row={i}
            data={data.map((s) => ({ x: s.distance_m, y: Number(s[row.key]) }))}
            xMax={xMax} yMax={row.yMax} color={sel.color} label={row.label} />
        )),
      )}
      {/* brake shading for first trace */}
      {loaded[0].data.map((s, i) =>
        s.brake ? (
          <rect key={i} x={PAD + (s.distance_m / xMax) * (W - PAD - 8)} y={totalH - 8}
            width={2} height={6} fill="#ef4444" />
        ) : null,
      )}
      {loaded.length === 2 && (
        <Line row={rows.length} color="#fafafa" xMax={xMax} yMax={15} yMin={-15}
          label="Δ speed (km/h, A−B)"
          data={loaded[0].data.map((s) => {
            const other = loaded[1].data;
            const j = Math.min(
              other.length - 1,
              Math.round((s.distance_m / xMax) * (other.length - 1)),
            );
            return { x: s.distance_m, y: s.speed_kmh - other[j].speed_kmh };
          })} />
      )}
    </svg>
  );
}
