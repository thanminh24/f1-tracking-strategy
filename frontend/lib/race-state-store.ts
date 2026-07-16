// Zustand store fed by the replay WebSocket; single source of truth for live UI.
import { create } from "zustand";
import type {
  LiveExtrapolatedClock,
  LiveSessionInfo,
  RaceState,
  RaceControlMessage,
  ReplayStatus,
} from "./types";
import { mergeRaceControlMessages } from "./race-control-merge";
import { shouldSkipArchiveStateUpdate, shouldSkipStatusUpdate } from "./session-source";

type DataSource = "archive" | "live" | "fixture";

interface RaceStateStore {
  state: RaceState | null;
  status: ReplayStatus | null;
  connected: boolean;
  reconnecting: boolean;
  source: DataSource;
  focusedCarId: string | null;
  raceControlMessages: RaceControlMessage[];
  extrapolatedClock: LiveExtrapolatedClock | null;
  sessionInfo: LiveSessionInfo | null;
  setState: (s: RaceState) => void;
  setStatus: (s: ReplayStatus) => void;
  setConnected: (c: boolean) => void;
  setReconnecting: (r: boolean) => void;
  setSource: (s: DataSource) => void;
  setFocusedCarId: (id: string | null) => void;
  mergeRaceControl: (incoming: RaceControlMessage[] | RaceControlMessage) => void;
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
    set((current) => {
      if (
        current.source === "archive" &&
        current.state &&
        shouldSkipArchiveStateUpdate(current.state, state)
      ) {
        return current;
      }
      return {
        state,
        extrapolatedClock: state.extrapolated_clock ?? null,
        sessionInfo: state.session_info ?? null,
        raceControlMessages: mergeRaceControlMessages(
          current.raceControlMessages,
          state.rc_messages,
        ),
      };
    }),
  setStatus: (status) =>
    set((current) => {
      if (current.status && shouldSkipStatusUpdate(current.status, status)) {
        return current;
      }
      return { status };
    }),
  setConnected: (connected) => set({ connected }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setSource: (source) => set({ source }),
  setFocusedCarId: (focusedCarId) => set({ focusedCarId }),
  mergeRaceControl: (incoming) =>
    set((current) => ({
      raceControlMessages: mergeRaceControlMessages(current.raceControlMessages, incoming),
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
