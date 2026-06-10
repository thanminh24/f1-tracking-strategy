"use client";
// Driver+lap pickers → distance-aligned overlay traces with delta strip.
import { useEffect, useState } from "react";
import { TelemetryTraces, type TraceSelection } from "../../../../components/telemetry-traces";
import { api } from "../../../../lib/api-client";
import type { ResultRow } from "../../../../lib/types";

const COLORS = ["#22d3ee", "#f472b6"];

interface PickerState {
  carId: string;
  lap: number;
}

export function TelemetryCompare({ sessionKey }: { sessionKey: string }) {
  const [drivers, setDrivers] = useState<ResultRow[]>([]);
  const [maxLap, setMaxLap] = useState(50);
  const [picks, setPicks] = useState<PickerState[]>([]);

  useEffect(() => {
    api.results(sessionKey).then((r) => {
      setDrivers(r);
      if (r.length >= 2) {
        setPicks([
          { carId: r[0].car_id, lap: 10 },
          { carId: r[1].car_id, lap: 10 },
        ]);
      }
    });
    api
      .laps(sessionKey)
      .then((laps) => setMaxLap(Math.max(...laps.map((l) => l.lap_number))))
      .catch(() => {});
  }, [sessionKey]);

  const selections: TraceSelection[] = picks.map((p, i) => ({
    carId: p.carId,
    lap: p.lap,
    color: COLORS[i],
  }));

  return (
    <div className="space-y-4">
      <div className="flex gap-6">
        {picks.map((pick, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <span className="w-3 h-3 rounded-full" style={{ background: COLORS[i] }} />
            <select
              className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
              value={pick.carId}
              onChange={(e) =>
                setPicks((ps) => ps.map((p, j) => (j === i ? { ...p, carId: e.target.value } : p)))
              }
            >
              {drivers.map((d) => (
                <option key={d.car_id} value={d.car_id}>
                  {d.driver_code} ({d.team})
                </option>
              ))}
            </select>
            <label className="text-zinc-500">lap</label>
            <input
              type="number"
              min={1}
              max={maxLap}
              value={pick.lap}
              onChange={(e) =>
                setPicks((ps) =>
                  ps.map((p, j) => (j === i ? { ...p, lap: Number(e.target.value) } : p)),
                )
              }
              className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-1"
            />
          </div>
        ))}
      </div>
      <div className="border border-zinc-800 rounded-lg p-3">
        <TelemetryTraces sessionKey={sessionKey} selections={selections} />
      </div>
      <p className="text-xs text-zinc-600">
        first fetch per lap downloads from FastF1 (seconds); cached afterwards
      </p>
    </div>
  );
}
