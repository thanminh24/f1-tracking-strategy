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
  x: number | null;
  y: number | null;
  fuel_state: Record<string, number> | null;
}

// ── Live session extended types ──────────────────────────────────────────────

export interface LiveDriver {
  RacingNumber?: string;
  BroadcastName?: string;
  FullName?: string;
  Tla?: string;
  TeamName?: string;
  /** Hex colour without '#', e.g. "3671C6" */
  TeamColour?: string;
  CountryCode?: string;
  HeadshotUrl?: string;
}

export interface LiveSegment {
  /** 0=not reached, 2048=yellow, 2049=green (pb), 2051=purple (fl) */
  Status: number;
}

export interface LiveSector {
  Value?: string;
  Segments?: Record<string, LiveSegment>;
}

export interface LiveTimingDriver {
  Position?: number | string;
  NumberOfLaps?: number;
  GapToLeader?: string;
  IntervalToPositionAhead?: { Value?: string };
  LastLapTime?: { Value?: string; PersonalFastest?: boolean };
  BestLapTime?: { Value?: string };
  Sectors?: Record<string, LiveSector>;
  InPit?: boolean;
  KnockedOut?: boolean;
  Cutoff?: boolean;
  Retired?: boolean;
}

export interface LiveStint {
  Compound?: string;
  TotalLaps?: number;
  New?: string;
  StartLaps?: number;
}

export interface LiveSpeedEntry {
  Value?: number;
  Position?: number;
}

export interface LiveTimingAppDriver {
  Stints?: Record<string, LiveStint>;
  GridPos?: string;
}

export interface LiveTimingStatsDriver {
  BestSpeeds?: {
    I1?: LiveSpeedEntry;
    I2?: LiveSpeedEntry;
    Fl?: LiveSpeedEntry;
    St?: LiveSpeedEntry;
  };
}

export interface LiveExtrapolatedClock {
  Utc?: string;
  /** e.g. "0:43:27" or "43:27" */
  Remaining: string;
  Extrapolating: boolean;
}

export interface LiveChampionshipEntry {
  RacingNumber?: string;
  CurrentPosition: number;
  PredictedPosition: number;
  CurrentPoints: number;
  PredictedPoints: number;
}

export interface LiveChampionshipTeamEntry {
  TeamName?: string;
  CurrentPosition: number;
  PredictedPosition: number;
  CurrentPoints: number;
  PredictedPoints: number;
}

export interface LiveChampionship {
  Drivers?: Record<string, LiveChampionshipEntry>;
  Teams?: Record<string, LiveChampionshipTeamEntry>;
}

export interface LiveLapCount {
  CurrentLap?: number;
  TotalLaps?: number;
}

export interface LiveTeamRadioCapture {
  Utc: string;
  RacingNumber: string;
  Path: string;
}

export interface LiveSessionInfo {
  Name?: string;
  Path?: string;
  Meeting?: { Circuit?: { Key?: number; ShortName?: string } };
  Type?: string;
}

// ── RaceState ────────────────────────────────────────────────────────────────

export interface RaceState {
  session_key: string;
  t_session_s: number;
  leader_lap: number;
  total_laps: number | null;
  track_status: TrackStatus;
  cars: CarState[];
  rc_messages?: RaceControlMessage[];
  // Live-only extended fields (undefined for archive sessions)
  driver_list?: Record<string, LiveDriver>;
  live_timing?: Record<string, LiveTimingDriver>;
  live_timing_session_part?: number;  // 1=Q1, 2=Q2, 3=Q3
  live_timing_app?: Record<string, LiveTimingAppDriver>;
  live_timing_stats?: Record<string, LiveTimingStatsDriver>;
  extrapolated_clock?: LiveExtrapolatedClock;
  championship?: LiveChampionship;
  lap_count?: LiveLapCount;
  team_radio_captures?: LiveTeamRadioCapture[];
  session_info?: LiveSessionInfo;
}

export interface ReplayStatus {
  session_key: string;
  playing: boolean;
  speed: number;
  t_session_s: number;
  finished: boolean;
}

export interface RaceControlMessage {
  lap: number | null;
  t_session_s: number;
  message: string;
  category: string; // "SafetyCar" | "Flag" | "DRS" | "Other"
}

export interface TeamRadioMessage {
  lap: number;
  t_session_s: number;
  driver_code: string;
  msg: string | null;
  audio_url: string | null;
}

export type WsMessage =
  | { type: "race_state"; data: RaceState }
  | { type: "replay_status"; data: ReplayStatus }
  | { type: "predictions"; data: import("./prediction-types").PredictionSet }
  | { type: "race_control"; data: RaceControlMessage[] }
  | { type: "telemetry"; data: Record<string, import("./live-telemetry-store").LiveTelemetrySample[]> };

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
  sector_1_ms?: number | null;
  sector_2_ms?: number | null;
  sector_3_ms?: number | null;
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

export interface WeatherData {
  air_temp_c: number | null;
  track_temp_c: number | null;
  humidity_pct: number | null;
  wind_speed_ms: number | null;
  wind_direction_deg: number | null;
  rainfall: boolean | null;
}
