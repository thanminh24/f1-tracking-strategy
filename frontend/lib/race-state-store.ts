// Zustand store fed by the replay WebSocket; single source of truth for live UI.
import { create } from "zustand";
import type { RaceState, ReplayStatus } from "./types";

interface RaceStateStore {
  state: RaceState | null;
  status: ReplayStatus | null;
  connected: boolean;
  setState: (s: RaceState) => void;
  setStatus: (s: ReplayStatus) => void;
  setConnected: (c: boolean) => void;
  reset: () => void;
}

export const useRaceStateStore = create<RaceStateStore>((set) => ({
  state: null,
  status: null,
  connected: false,
  setState: (state) => set({ state }),
  setStatus: (status) => set({ status }),
  setConnected: (connected) => set({ connected }),
  reset: () => set({ state: null, status: null, connected: false }),
}));
