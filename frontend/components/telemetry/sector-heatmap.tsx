"use client";
// Phase 06: Sector heatmap grid — color-coded lap sector times by performance.
import { useState, useMemo } from "react";
import type { LapRow } from "../../lib/types";

interface Props {
  laps: LapRow[];
}

type SectorKey = "sector_1_ms" | "sector_2_ms" | "sector_3_ms";
const SECTOR_KEYS: SectorKey[] = ["sector_1_ms", "sector_2_ms", "sector_3_ms"];
const SECTOR_NAMES = { sector_1_ms: "S1", sector_2_ms: "S2", sector_3_ms: "S3" };

function formatSectorTime(ms: number | null | undefined): string {
  if (ms == null) return "—";
  return (ms / 1000).toFixed(3);
}

function cellColor(
  time: number | null | undefined,
  sessionBest: number,
  personalBest: number
): string {
  if (time == null) return "#383838";
  if (time <= sessionBest) return "#A855F7";
  if (time <= personalBest) return "#22C55E";
  if (time <= personalBest * 1.02) return "#F59E0B";
  return "#E10600";
}

export function SectorHeatmap({ laps }: Props) {
  // Extract unique drivers
  const drivers = useMemo(() => {
    const unique = new Map<string, { car_id: string; driver_code: string }>();
    for (const lap of laps) {
      if (!unique.has(lap.car_id)) {
        unique.set(lap.car_id, { car_id: lap.car_id, driver_code: lap.driver_code });
      }
    }
    return Array.from(unique.values());
  }, [laps]);

  // Filter to drivers with sector data
  const driversWithSectors = useMemo(() => {
    return drivers.filter((d) =>
      laps.some(
        (l) =>
          l.car_id === d.car_id &&
          (l.sector_1_ms != null || l.sector_2_ms != null || l.sector_3_ms != null)
      )
    );
  }, [drivers, laps]);

  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const activeDriver =
    selectedDriver && driversWithSectors.some((d) => d.car_id === selectedDriver)
      ? selectedDriver
      : driversWithSectors[0]?.car_id ?? null;

  // Compute session bests
  const sessionBests = useMemo(() => {
    const bests: Record<SectorKey, number> = {
      sector_1_ms: Infinity,
      sector_2_ms: Infinity,
      sector_3_ms: Infinity,
    };
    for (const lap of laps) {
      for (const key of SECTOR_KEYS) {
        const time = lap[key];
        if (time != null && time < bests[key]) {
          bests[key] = time;
        }
      }
    }
    return bests;
  }, [laps]);

  // Compute personal bests for selected driver
  const personalBests = useMemo(() => {
    const bests: Record<SectorKey, number> = {
      sector_1_ms: Infinity,
      sector_2_ms: Infinity,
      sector_3_ms: Infinity,
    };
    const driverLaps = laps.filter((l) => l.car_id === activeDriver);
    for (const lap of driverLaps) {
      for (const key of SECTOR_KEYS) {
        const time = lap[key];
        if (time != null && time < bests[key]) {
          bests[key] = time;
        }
      }
    }
    return bests;
  }, [laps, activeDriver]);

  // Filter laps for selected driver
  const driverLaps = useMemo(() => {
    if (!activeDriver) return [];
    return laps
      .filter((l) => l.car_id === activeDriver)
      .sort((a, b) => (a.lap_number ?? 0) - (b.lap_number ?? 0));
  }, [laps, activeDriver]);

  if (driversWithSectors.length === 0) {
    return (
      <div className="p-3 text-f1-muted text-xs">
        No sector data available
      </div>
    );
  }

  const hasSectorData = driverLaps.some(
    (l) => l.sector_1_ms != null || l.sector_2_ms != null || l.sector_3_ms != null
  );

  return (
    <div className="flex flex-col gap-2 p-3">
      {/* Driver selector */}
      <select
        value={activeDriver ?? ""}
        onChange={(e) => setSelectedDriver(e.target.value || null)}
        className="px-2 py-1 text-xs bg-f1-panel border border-f1-border rounded text-f1-text"
      >
        {driversWithSectors.map((d) => (
          <option key={d.car_id} value={d.car_id}>
            {d.driver_code}
          </option>
        ))}
      </select>

      {!hasSectorData ? (
        <div className="text-f1-muted text-xs">
          No sector data available for this driver
        </div>
      ) : (
        <div className="overflow-y-auto scrollbar-thin max-h-96">
          <div
            className="gap-0.5"
            style={{
              display: "grid",
              gridTemplateColumns: "auto repeat(3, 1fr)",
            }}
          >
            {/* Header row */}
            <div className="font-bold text-xs text-f1-muted uppercase px-2 py-1">LAP</div>
            {SECTOR_KEYS.map((key) => (
              <div
                key={key}
                className="font-bold text-xs text-f1-muted uppercase text-center px-1 py-1"
              >
                {SECTOR_NAMES[key]}
              </div>
            ))}

            {/* Data rows */}
            {driverLaps.map((lap) => (
              <div key={lap.lap_number} style={{ display: "contents" }}>
                {/* Lap header cell */}
                <div className="text-xs text-f1-text-dim px-2 py-1 whitespace-nowrap">
                  {lap.lap_number}
                  {lap.lap_time_ms && (
                    <span className="text-f1-muted">
                      {" "}
                      {formatSectorTime(lap.lap_time_ms)}s
                    </span>
                  )}
                </div>

                {/* Sector cells */}
                {SECTOR_KEYS.map((key) => {
                  const time = lap[key];
                  const color = cellColor(time, sessionBests[key], personalBests[key]);
                  const title = time == null ? "No data" : `${SECTOR_NAMES[key]} ${formatSectorTime(time)}s`;
                  return (
                    <div
                      key={`${lap.lap_number}-${key}`}
                      title={title}
                      style={{
                        backgroundColor: color,
                        width: "24px",
                        height: "16px",
                        borderRadius: "2px",
                        cursor: "pointer",
                      }}
                      className="mx-auto"
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
