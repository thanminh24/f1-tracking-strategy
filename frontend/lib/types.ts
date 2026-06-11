// Mirrors backend Pydantic models (f1_strategy/models/race_state.py)

export type CarStatus = "running" | "pitting" | "in_pit" | "out" | "finished";
export type TrackStatus = "green" | "yellow_zone" | "vsc" | "sc" | "red";

export interface TireState {
  compound: string;
  age_laps: number;
  stint: number;
}

export interface CarState {
  car_id: string;
  driver_code: string | null;
  team: string | null;
  position: number;
  lap: number;
  lap_fraction: number;
  gap_leader_s: number | null;
  interval_s: number | null;
  last_lap_ms: number | null;
  best_lap_ms: number | null;
  tire: TireState | null;
  pit_stops: number;
  status: CarStatus;
  car_class: string | null;
  fuel_state: Record<string, number> | null;
}

export interface RaceState {
  session_key: string;
  t_session_s: number;
  leader_lap: number;
  total_laps: number | null;
  track_status: TrackStatus;
  cars: CarState[];
}

export interface ReplayStatus {
  session_key: string;
  playing: boolean;
  speed: number;
  t_session_s: number;
  finished: boolean;
}

export type WsMessage =
  | { type: "race_state"; data: RaceState }
  | { type: "replay_status"; data: ReplayStatus }
  | { type: "predictions"; data: import("./prediction-types").PredictionSet };

export interface EventRow {
  round: number;
  event_name: string;
  circuit: string;
  country: string | null;
  session_types: string[];
}

export interface LapRow {
  car_id: string;
  driver_code: string;
  team: string;
  lap_number: number;
  stint: number | null;
  position: number | null;
  lap_time_ms: number | null;
  compound: string;
  tyre_life: number | null;
  pit_in_ms: number | null;
  pit_out_ms: number | null;
}

export interface StintRow {
  car_id: string;
  stint: number;
  compound: string;
  start_lap: number;
  end_lap: number;
}

export interface ResultRow {
  car_id: string;
  driver_code: string;
  team: string;
  position: number | null;
  grid_position: number | null;
  status: string;
  points: number;
}

export interface TelemetrySample {
  t_ms: number;
  distance_m: number;
  speed_kmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: boolean;
  drs: number;
}

export interface OutlinePoint {
  x: number;
  y: number;
}
