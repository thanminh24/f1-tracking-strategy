// Zustand store fed by the replay WebSocket; single source of truth for live UI.
import { create } from "zustand";
import type { RaceState, ReplayStatus } from "./types";

type DataSource = "archive" | "live";

interface RaceStateStore {
  state: RaceState | null;
  status: ReplayStatus | null;
  connected: boolean;
  source: DataSource;
  setState: (s: RaceState) => void;
  setStatus: (s: ReplayStatus) => void;
  setConnected: (c: boolean) => void;
  setSource: (s: DataSource) => void;
  reset: () => void;
}

export const useRaceStateStore = create<RaceStateStore>((set) => ({
  state: null,
  status: null,
  connected: false,
  source: "archive",
  setState: (state) => set({ state }),
  setStatus: (status) => set({ status }),
  setConnected: (connected) => set({ connected }),
  setSource: (source) => set({ source }),
  reset: () => set({ state: null, status: null, connected: false, source: "archive" }),
}));
