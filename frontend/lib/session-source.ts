import type { CarState, RaceState, ReplayStatus } from "./types";

export type SessionDataSource = "archive" | "live" | "fixture";

/** Live or fixture — uses WS stream timing/telemetry, not archive REST. */
export function isLiveTimingSource(source: SessionDataSource | string): boolean {
  return source === "live" || source === "fixture";
}

/** Live-only comms panels (race control stream, team radio). Archive replay has no reliable feed. */
export function hasLiveComms(source: SessionDataSource): boolean {
  return isLiveTimingSource(source);
}

function carsDisplayEqual(a: CarState[], b: CarState[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((car) => [car.car_id, car]));
  for (const car of a) {
    const next = byId.get(car.car_id);
    if (!next) return false;
    if (
      car.position !== next.position ||
      car.lap !== next.lap ||
      car.lap_fraction !== next.lap_fraction ||
      car.gap_leader_s !== next.gap_leader_s ||
      car.interval_s !== next.interval_s ||
      car.last_lap_ms !== next.last_lap_ms ||
      car.status !== next.status ||
      car.tire?.compound !== next.tire?.compound ||
      car.tire?.age_laps !== next.tire?.age_laps
    ) {
      return false;
    }
  }
  return true;
}

export function shouldSkipArchiveStateUpdate(prev: RaceState, next: RaceState): boolean {
  return (
    prev.session_key === next.session_key &&
    prev.leader_lap === next.leader_lap &&
    prev.t_session_s === next.t_session_s &&
    prev.track_status === next.track_status &&
    prev.total_laps === next.total_laps &&
    carsDisplayEqual(prev.cars, next.cars) &&
    !(next.rc_messages?.length)
  );
}

export function shouldSkipStatusUpdate(prev: ReplayStatus, next: ReplayStatus): boolean {
  return (
    prev.playing === next.playing &&
    prev.speed === next.speed &&
    prev.finished === next.finished &&
    Math.abs(prev.t_session_s - next.t_session_s) < 0.05
  );
}
