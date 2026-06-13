// Telemetry data filtering and selection helpers.
import type { LapRow } from "./types";

export function filterLaps(
  laps: LapRow[],
  carId: string,
  filter: "all" | "fastest5" | "custom",
  from: number,
  to: number
): LapRow[] {
  const carLaps = laps.filter(
    (l) => l.car_id === carId && l.lap_time_ms != null
  );
  if (filter === "fastest5") {
    return [...carLaps]
      .sort((a, b) => (a.lap_time_ms ?? 0) - (b.lap_time_ms ?? 0))
      .slice(0, 5);
  }
  if (filter === "custom") {
    return carLaps.filter(
      (l) => l.lap_number >= from && l.lap_number <= to
    );
  }
  return carLaps.slice(-20); // "all" = last 20 (performance limit)
}
