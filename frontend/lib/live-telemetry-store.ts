// Zustand store for live per-driver telemetry (CarData.z stream).
// Only populated during live sessions; empty for archive replay.
import { create } from "zustand";

export interface LiveTelemetrySample {
  t: number;        // seconds since session start
  rpm: number;      // RPM (channel 0)
  speed: number;    // km/h (channel 2)
  gear: number;     // (channel 3)
  throttle: number; // 0–100 % (channel 4)
  brake: number;    // 0–100 % (channel 5)
  /** DRS raw state: 0-7=off, 8=eligible, 10-14=active (channel 45) */
  drs: number;
}

interface LiveTelemetryState {
  data: Record<string, LiveTelemetrySample[]>;
  setAll: (data: Record<string, LiveTelemetrySample[]>) => void;
  reset: () => void;
}

export const useLiveTelemetryStore = create<LiveTelemetryState>((set) => ({
  data: {},
  setAll: (data) => set({ data }),
  reset: () => set({ data: {} }),
}));
