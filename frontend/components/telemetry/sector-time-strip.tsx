"use client";
// Sector time visualization — S1/S2/S3 progress bars for a lap.
import type { LapRow } from "../../lib/types";

interface Props {
  lap: LapRow | null;
  personalBestMs?: number | null;
}

function formatSectorTime(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = (ms / 1000).toFixed(3);
  return s;
}

export function SectorTimeStrip({ lap, personalBestMs }: Props) {
  if (!lap || !lap.sector_1_ms || !lap.sector_2_ms || !lap.sector_3_ms) {
    return null;
  }

  const sectors = [
    { name: "S1", ms: lap.sector_1_ms },
    { name: "S2", ms: lap.sector_2_ms },
    { name: "S3", ms: lap.sector_3_ms },
  ];

  const totalMs = lap.sector_1_ms + lap.sector_2_ms + lap.sector_3_ms;
  const isBest = personalBestMs && lap.lap_time_ms === personalBestMs;

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-f1-surface border-t border-f1-border text-xs font-data">
      {sectors.map((sector, idx) => {
        const percent = (sector.ms / totalMs) * 100;
        return (
          <div key={sector.name} className="flex flex-col gap-1 flex-1">
            <div className="flex justify-between items-center">
              <span className="text-f1-muted uppercase">{sector.name}</span>
              <span className={isBest ? "text-f1-green font-semibold" : "text-f1-text"}>
                {formatSectorTime(sector.ms)}s
              </span>
            </div>
            <div className="w-full h-1.5 bg-f1-panel rounded overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isBest ? "bg-f1-green" : "bg-f1-muted"
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
