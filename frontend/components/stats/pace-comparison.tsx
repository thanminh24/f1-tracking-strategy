"use client";
import { useMemo, useState } from "react";
import type { LapRow } from "../../lib/types";
import { computePaceStats, PaceStatsTable, type SortKey } from "./pace-stats-table";

interface Props {
  laps: LapRow[];
}

export function PaceComparison({ laps }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("avg");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Compute stats
  const stats = useMemo(() => computePaceStats(laps), [laps]);

  // Sort and limit to top 10
  const sorted = useMemo(() => {
    const copy = [...stats];
    copy.sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortKey) {
        case "driver":
          return sortDir === "asc"
            ? a.driver_code.localeCompare(b.driver_code)
            : b.driver_code.localeCompare(a.driver_code);
        case "avg":
          aVal = a.avg;
          bVal = b.avg;
          break;
        case "last5":
          aVal = a.last5avg;
          bVal = b.last5avg;
          break;
        case "best":
          aVal = a.best;
          bVal = b.best;
          break;
        case "stddev":
          aVal = a.stddev;
          bVal = b.stddev;
          break;
      }
      return sortDir === "asc" ? aVal - bVal : bVal - aVal;
    });

    return copy.slice(0, 10);
  }, [stats, sortKey, sortDir]);

  if (sorted.length === 0) {
    return <div className="p-4 text-f1-text-dim">No lap data available</div>;
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <div className="p-4">
      <PaceStatsTable stats={sorted} sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
    </div>
  );
}
