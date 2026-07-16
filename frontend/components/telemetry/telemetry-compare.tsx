"use client";
// Telemetry comparison view — multi-driver, multi-lap selector + traces chart.
import { useState, useCallback } from "react";
import { api } from "../../lib/api-client";
import { teamColor } from "../../lib/team-colors";
import { TracesChart } from "./traces-chart";
import type { LapRow, TelemetrySample } from "../../lib/types";

interface TraceSlot {
  id: string; // `${carId}:${lap}`
  carId: string;
  lap: number;
  label: string;
  color: string;
  samples: TelemetrySample[] | null;
}

const PALETTE = ["#E10600", "#3B82F6", "#22C55E", "#F59E0B", "#A855F7", "#EC4899"];

interface Props {
  sessionKey: string;
  laps: LapRow[];
}

export function TelemetryCompare({ sessionKey, laps }: Props) {
  const [traces, setTraces] = useState<TraceSlot[]>([]);
  const [loading, setLoading] = useState(false);

  // Unique cars from laps
  const cars = Array.from(
    new Map(laps.map((l) => [l.car_id, { car_id: l.car_id, driver_code: l.driver_code, team: l.team }])).values()
  );

  // Unique laps per car
  const lapsByDriver = Object.fromEntries(
    cars.map((c) => [
      c.car_id,
      laps.filter((l) => l.car_id === c.car_id).sort((a, b) => a.lap_number - b.lap_number),
    ])
  );

  const [selectedCar, setSelectedCar] = useState(cars[0]?.car_id ?? "");
  const [selectedLap, setSelectedLap] = useState<number | null>(null);

  const addTrace = useCallback(
    async (carId: string, lap: number) => {
      const id = `${carId}:${lap}`;
      if (traces.find((t) => t.id === id)) return; // already loaded
      if (traces.length >= 6) return; // max 6 traces

      const car = cars.find((c) => c.car_id === carId);
      const color =
        teamColor(car?.team ?? null) ?? PALETTE[traces.length % PALETTE.length];
      const label = `${car?.driver_code ?? carId} L${lap}`;

      const slot: TraceSlot = { id, carId, lap, label, color, samples: null };
      setTraces((prev) => [...prev, slot]);
      setLoading(true);
      try {
        const samples = await api.telemetry(sessionKey, carId, lap);
        setTraces((prev) =>
          prev.map((t) => (t.id === id ? { ...t, samples } : t))
        );
      } finally {
        setLoading(false);
      }
    },
    [traces, cars, sessionKey]
  );

  const removeTrace = (id: string) => setTraces((prev) => prev.filter((t) => t.id !== id));

  const availableLaps = selectedCar ? lapsByDriver[selectedCar] ?? [] : [];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-2 px-3 pt-3 shrink-0">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-f1-muted uppercase tracking-widest">Driver</label>
          <select
            value={selectedCar}
            onChange={(e) => { setSelectedCar(e.target.value); setSelectedLap(null); }}
            className="bg-f1-surface border border-f1-border rounded px-2 py-1.5 text-sm text-f1-text font-data focus:outline-none focus:border-f1-red"
          >
            {cars.map((c) => (
              <option key={c.car_id} value={c.car_id}>
                {c.driver_code ?? c.car_id} ({c.team})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-f1-muted uppercase tracking-widest">Lap</label>
          <select
            value={selectedLap ?? ""}
            onChange={(e) => setSelectedLap(Number(e.target.value))}
            className="bg-f1-surface border border-f1-border rounded px-2 py-1.5 text-sm text-f1-text font-data focus:outline-none focus:border-f1-red"
          >
            <option value="">— select —</option>
            {availableLaps.map((l) => (
              <option key={l.lap_number} value={l.lap_number}>
                Lap {l.lap_number}
                {l.lap_time_ms ? ` (${(l.lap_time_ms / 1000).toFixed(3)}s)` : ""}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={() => selectedCar && selectedLap && addTrace(selectedCar, selectedLap)}
          disabled={!selectedCar || !selectedLap || loading}
          className="px-4 py-1.5 rounded bg-f1-red text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors self-end"
        >
          {loading ? "Loading…" : "+ Add"}
        </button>

        {traces.length > 0 && (
          <button
            onClick={() => setTraces([])}
            className="px-3 py-1.5 rounded border border-f1-border text-sm text-f1-text-dim hover:text-f1-text transition-colors self-end"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Active traces pills */}
      {traces.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 shrink-0">
          {traces.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-data"
              style={{ border: `1px solid ${t.color}60`, color: t.color }}
            >
              {t.label}
              <button
                onClick={() => removeTrace(t.id)}
                className="hover:opacity-60 transition-opacity"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-3 pb-3">
        <TracesChart
          traces={traces
            .filter((t) => t.samples !== null)
            .map((t) => ({ label: t.label, color: t.color, samples: t.samples! }))}
        />
      </div>
    </div>
  );
}
