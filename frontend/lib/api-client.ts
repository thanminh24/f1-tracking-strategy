// REST fetchers for the backend archive API.
import type {
  EventRow,
  LapRow,
  OutlinePoint,
  ResultRow,
  StintRow,
  TelemetrySample,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const WS_BASE = API_BASE.replace(/^http/, "ws");

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export const api = {
  seasons: () => getJson<number[]>("/api/seasons"),
  events: (year: number) => getJson<EventRow[]>(`/api/events/${year}`),
  laps: (key: string) => getJson<LapRow[]>(`/api/sessions/${key}/laps`),
  stints: (key: string) => getJson<StintRow[]>(`/api/sessions/${key}/stints`),
  results: (key: string) => getJson<ResultRow[]>(`/api/sessions/${key}/results`),
  trackOutline: (key: string) =>
    getJson<OutlinePoint[]>(`/api/sessions/${key}/track-outline`),
  telemetry: (key: string, carId: string, lap: number) =>
    getJson<TelemetrySample[]>(`/api/sessions/${key}/telemetry/${carId}/${lap}`),
};
