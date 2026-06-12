// REST fetchers for the backend archive API.
import type {
  EventRow,
  LapRow,
  OutlinePoint,
  ResultRow,
  StintRow,
  TeamRadioMessage,
  TelemetrySample,
  WeatherData,
} from "./types";

// Empty string → same-origin (nginx routes /api/* and /ws/* to backend).
// Set NEXT_PUBLIC_API_URL only when running backend on a different host/port.
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "";

// Browser: derive ws(s):// from current page origin so nginx WebSocket proxy works.
// Server-side (Next.js RSC): fall back to loopback for prefetch calls.
export const WS_BASE =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`
    : (API_BASE || "http://localhost:8000").replace(/^http/, "ws");

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

export const api = {
  seasons: () => getJson<number[]>("/api/seasons"),
  events: (year: number) => getJson<EventRow[]>(`/api/events/${year}`),
  ensureSession: (key: string) =>
    fetch(`${API_BASE}/api/sessions/${key}/ensure`, {
      method: "POST",
      cache: "no-store",
    }).then(async (res) => {
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ session_key: string; status: string; source: string }>;
    }),
  laps: (key: string) => getJson<LapRow[]>(`/api/sessions/${key}/laps`),
  stints: (key: string) => getJson<StintRow[]>(`/api/sessions/${key}/stints`),
  results: (key: string) => getJson<ResultRow[]>(`/api/sessions/${key}/results`),
  weather: (key: string) =>
    getJson<WeatherData[]>(`/api/sessions/${key}/weather`)
      .then((rows) => rows[rows.length - 1] || { air_temp_c: null, track_temp_c: null, humidity_pct: null, wind_speed_ms: null, wind_direction_deg: null, rainfall: null })
      .catch(() => ({ air_temp_c: null, track_temp_c: null, humidity_pct: null, wind_speed_ms: null, wind_direction_deg: null, rainfall: null })),
  trackOutline: (key: string) =>
    getJson<OutlinePoint[]>(`/api/sessions/${key}/track-outline`),
  telemetry: (key: string, carId: string, lap: number) =>
    getJson<TelemetrySample[]>(`/api/sessions/${key}/telemetry/${carId}/${lap}`),
  teamRadio: (key: string) =>
    getJson<TeamRadioMessage[]>(`/api/sessions/${key}/team-radio`),
  liveSession: () =>
    getJson<{ session_key: string | null; openf1_key: number | null; status: string; session_type?: string; circuit?: string; year?: number }>("/api/live/current-session"),
};
