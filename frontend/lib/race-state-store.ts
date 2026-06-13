// Zustand store fed by the replay WebSocket; single source of truth for live UI.
import { create } from "zustand";
import type {
  LiveExtrapolatedClock,
  LiveSessionInfo,
  RaceState,
  RaceControlMessage,
  ReplayStatus,
} from "./types";

type DataSource = "archive" | "live";

interface RaceStateStore {
  state: RaceState | null;
  status: ReplayStatus | null;
  connected: boolean;
  reconnecting: boolean;
  source: DataSource;
  focusedCarId: string | null;
  raceControlMessages: RaceControlMessage[];
  // Convenience selectors for frequently-accessed live fields
  extrapolatedClock: LiveExtrapolatedClock | null;
  sessionInfo: LiveSessionInfo | null;
  setState: (s: RaceState) => void;
  setStatus: (s: ReplayStatus) => void;
  setConnected: (c: boolean) => void;
  setReconnecting: (r: boolean) => void;
  setSource: (s: DataSource) => void;
  setFocusedCarId: (id: string | null) => void;
  addRaceControlMessage: (msg: RaceControlMessage) => void;
  clearSessionData: (source: DataSource) => void;
  reset: () => void;
}

export const useRaceStateStore = create<RaceStateStore>((set) => ({
  state: null,
  status: null,
  connected: false,
  reconnecting: false,
  source: "archive",
  focusedCarId: null,
  raceControlMessages: [],
  extrapolatedClock: null,
  sessionInfo: null,
  setState: (state) =>
    set({
      state,
      extrapolatedClock: state.extrapolated_clock ?? null,
      sessionInfo: state.session_info ?? null,
    }),
  setStatus: (status) => set({ status }),
  setConnected: (connected) => set({ connected }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setSource: (source) => set({ source }),
  setFocusedCarId: (focusedCarId) => set({ focusedCarId }),
  addRaceControlMessage: (msg) =>
    set((s) => ({
      raceControlMessages: [msg, ...s.raceControlMessages].slice(0, 10),
    })),
  clearSessionData: (source) =>
    set({
      state: null,
      status: null,
      connected: false,
      reconnecting: false,
      source,
      focusedCarId: null,
      raceControlMessages: [],
      extrapolatedClock: null,
      sessionInfo: null,
    }),
  reset: () =>
    set({
      state: null,
      status: null,
      connected: false,
      reconnecting: false,
      source: "archive",
      focusedCarId: null,
      raceControlMessages: [],
      extrapolatedClock: null,
      sessionInfo: null,
    }),
}));
