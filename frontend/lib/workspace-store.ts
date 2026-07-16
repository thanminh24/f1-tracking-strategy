"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { WorkspaceMode } from "./types";

interface WorkspaceStore {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set) => ({
      mode: "broadcast",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "f1-pw:workspace-mode",
    },
  ),
);
