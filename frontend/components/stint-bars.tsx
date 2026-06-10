"use client";
// Horizontal compound-colored stint timeline per car (race strategy at a glance).
import { useEffect, useState } from "react";
import { api } from "../lib/api-client";
import { compoundColor } from "../lib/team-colors";
import type { StintRow } from "../lib/types";

export function StintBars({ sessionKey }: { sessionKey: string }) {
  const [stints, setStints] = useState<StintRow[]>([]);
  useEffect(() => {
    api.stints(sessionKey).then(setStints).catch(() => setStints([]));
  }, [sessionKey]);

  if (!stints.length) return null;
  const maxLap = Math.max(...stints.map((s) => s.end_lap));
  const byCar = new Map<string, StintRow[]>();
  for (const s of stints) {
    if (!byCar.has(s.car_id)) byCar.set(s.car_id, []);
    byCar.get(s.car_id)!.push(s);
  }

  return (
    <div className="space-y-0.5 text-xs font-mono">
      {[...byCar.entries()].map(([carId, rows]) => (
        <div key={carId} className="flex items-center gap-2">
          <span className="w-8 text-zinc-400 text-right">{carId}</span>
          <div className="flex-1 flex h-3 rounded overflow-hidden bg-zinc-900">
            {rows
              .sort((a, b) => a.stint - b.stint)
              .map((s) => (
                <div
                  key={s.stint}
                  title={`${s.compound} L${s.start_lap}-${s.end_lap}`}
                  style={{
                    width: `${((s.end_lap - s.start_lap + 1) / maxLap) * 100}%`,
                    background: compoundColor(s.compound),
                  }}
                />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
