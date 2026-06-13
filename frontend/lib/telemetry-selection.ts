import type { LapRow } from "./types";

export const TELEMETRY_SLOT_COLORS = [
  "#E10600",
  "#00D2BE",
  "#FF8700",
  "#1D4ED8",
  "#FACC15",
] as const;

export interface TelemetryCompareSlot {
  id: string;
  carId: string;
  lap: number;
  color: string;
}

export function carsFromLaps(laps: LapRow[]) {
  return Array.from(
    new Map(
      laps.map((lap) => [
        lap.car_id,
        { car_id: lap.car_id, driver_code: lap.driver_code, team: lap.team },
      ])
    ).values()
  ).sort((a, b) => a.driver_code.localeCompare(b.driver_code));
}

export function bestLapForCar(laps: LapRow[], carId: string): number {
  const timed = laps
    .filter((lap) => lap.car_id === carId && lap.lap_time_ms != null)
    .sort((a, b) => (a.lap_time_ms ?? Infinity) - (b.lap_time_ms ?? Infinity));
  return timed[0]?.lap_number ?? 1;
}

export function createTelemetrySlot(
  laps: LapRow[],
  index: number,
  preferredCarId?: string
): TelemetryCompareSlot | null {
  const cars = carsFromLaps(laps);
  const car = preferredCarId ?? cars[index % Math.max(cars.length, 1)]?.car_id;
  if (!car) return null;
  return {
    id: `${car}-${index}-${TELEMETRY_SLOT_COLORS[index % TELEMETRY_SLOT_COLORS.length]}`,
    carId: car,
    lap: bestLapForCar(laps, car),
    color: TELEMETRY_SLOT_COLORS[index % TELEMETRY_SLOT_COLORS.length],
  };
}

export function selectedTelemetryKeys(slots: TelemetryCompareSlot[]): string[] {
  return slots.map((slot) => `${slot.carId}-${slot.lap}`);
}
