"use client";
import { useState } from "react";

interface Props {
  seasons: number[];
  backendOnline: boolean;
}

export function ReplayBrowserCard({ seasons, backendOnline }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(
    seasons.length > 0 ? Math.max(...seasons) : null
  );

  // Show offline state when no backend and no seasons
  if (!backendOnline && seasons.length === 0) {
    return (
      <div className="w-full max-w-sm rounded-xl border-2 border-f1-border bg-f1-panel/50 px-5 py-4 opacity-60">
        <div className="text-sm font-semibold text-f1-text-dim">ARCHIVE</div>
        <div className="text-base font-semibold text-f1-text mt-2">Archive offline</div>
        <div className="text-xs text-f1-text-dim mt-1">Start the backend to browse race history</div>
      </div>
    );
  }

  // Show full card when we have seasons
  if (seasons.length > 0) {
    return (
      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-f1-text-dim uppercase tracking-widest">
            Season
          </label>
          <select
            value={selectedYear ?? ""}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="ml-auto bg-f1-panel border border-f1-border rounded px-2 py-1 text-sm text-f1-text font-data focus:outline-none focus:border-f1-red"
          >
            {seasons.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>

        {selectedYear && (
          <a
            href={`/season/${selectedYear}`}
            className="text-center rounded-lg border border-f1-border bg-f1-panel px-4 py-3 text-sm text-f1-text hover:bg-f1-panel-hover hover:border-f1-border-light transition-colors"
          >
            Browse {selectedYear} season →
          </a>
        )}
      </div>
    );
  }

  // No seasons, but backend online — show placeholder
  return null;
}
