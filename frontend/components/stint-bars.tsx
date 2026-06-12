"use client";
// Compound-colored stint bars per car with driver code labels and lap marker.
import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { useRaceStateStore } from "../lib/race-state-store";
import { compoundColor } from "../lib/team-colors";
import type { LapRow, StintRow } from "../lib/types";

export function StintBars({ sessionKey }: { sessionKey: string }) {
  const [stints, setStints] = useState<StintRow[]>([]);
  const [laps, setLaps] = useState<LapRow[]>([]);
  // All hooks unconditionally at the top — before any early returns
  const currentLap = useRaceStateStore((s) => s.state?.leader_lap ?? 0);
  const liveCars = useRaceStateStore((s) => s.state?.cars);

  useEffect(() => {
    api.stints(sessionKey).then(setStints).catch(() => setStints([]));
    api.laps(sessionKey).then(setLaps).catch(() => setLaps([]));
  }, [sessionKey]);

  if (!stints.length) return null;

  const maxLap = Math.max(...stints.map((s) => s.end_lap));

  // car_id → driver_code from laps
  const driverCode = new Map<string, string>();
  for (const l of laps) {
    if (!driverCode.has(l.car_id) && l.driver_code) {
      driverCode.set(l.car_id, l.driver_code);
    }
  }

  const byCar = new Map<string, StintRow[]>();
  for (const s of stints) {
    if (!byCar.has(s.car_id)) byCar.set(s.car_id, []);
    byCar.get(s.car_id)!.push(s);
  }

  // Sort by current live position so stint bars match timing tower order
  const posOrder = new Map<string, number>();
  for (const car of liveCars ?? []) posOrder.set(car.car_id, car.position);
  const sortedCars = [...byCar.keys()].sort(
    (a, b) => (posOrder.get(a) ?? 99) - (posOrder.get(b) ?? 99),
  );

  const nowPct = currentLap > 0 ? (currentLap / maxLap) * 100 : null;

  return (
    <div className="space-y-[3px] font-mono text-xs">
      {sortedCars.map((carId) => {
        const rows = byCar.get(carId)!.sort((a, b) => a.stint - b.stint);
        const code = driverCode.get(carId) ?? carId;
        return (
          <div key={carId} className="flex items-center gap-2 group">
            {/* Driver label */}
            <span className="w-7 text-[10px] text-f1-muted text-right shrink-0 group-hover:text-f1-text transition-colors">
              {code}
            </span>

            {/* Bar track */}
            <div className="relative flex-1 flex h-3 rounded-sm overflow-hidden bg-f1-surface">
              {rows.map((s) => (
                <div
                  key={s.stint}
                  title={`${s.compound} · L${s.start_lap}–${s.end_lap} (${s.end_lap - s.start_lap + 1} laps)`}
                  style={{
                    width: `${((s.end_lap - s.start_lap + 1) / maxLap) * 100}%`,
                    background: compoundColor(s.compound),
                    opacity: 0.88,
                  }}
                />
              ))}

              {/* Gap between stints (unraced laps at end) */}
              {/* Current lap marker */}
              {nowPct != null && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-white/60 pointer-events-none"
                  style={{ left: `${nowPct}%` }}
                />
              )}
            </div>
          </div>
        );
      })}

      {/* Lap axis labels */}
      <div className="flex items-center gap-2 mt-1">
        <span className="w-7 shrink-0" />
        <div className="flex-1 flex justify-between">
          <span className="text-[9px] text-f1-muted font-mono">L1</span>
          <span className="text-[9px] text-f1-muted font-mono">L{maxLap}</span>
        </div>
      </div>
    </div>
  );
}
