"use client";

import type { WorkspaceMode } from "../../lib/types";

interface Props {
  mode: WorkspaceMode;
  onChange: (mode: WorkspaceMode) => void;
}

export function WorkspaceSwitch({ mode, onChange }: Props) {
  return (
    <div className="flex items-center gap-1 border border-f1-border rounded-lg p-0.5">
      <button
        onClick={() => onChange("broadcast")}
        className={`chip text-[10px] transition-colors ${
          mode === "broadcast"
            ? "bg-f1-panel text-f1-text border border-f1-border"
            : "bg-transparent text-f1-text-dim border border-transparent hover:border-f1-border/50"
        }`}
      >
        Broadcast
      </button>
      <button
        onClick={() => onChange("pit-wall")}
        className={`chip text-[10px] transition-colors ${
          mode === "pit-wall"
            ? "bg-red-900/60 text-f1-red border border-f1-red/40"
            : "bg-transparent text-f1-text-dim border border-transparent hover:border-f1-border/50"
        }`}
      >
        Pit Wall
      </button>
    </div>
  );
}
