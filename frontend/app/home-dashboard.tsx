"use client";
// Main dashboard shell. Manages session selection and view switching.
// Two top-level views: "replay" (WS-backed pit wall) and "telemetry" (multi-driver chart).
import { useState } from "react";
import { RaceSessionPicker } from "../components/race-session-picker";
import { AppShell } from "../components/layout/app-shell";
import { ReplayDashboard } from "./session/[key]/replay-dashboard";
import { TelemetryCompare } from "./session/[key]/telemetry/telemetry-compare";

type View = "replay" | "telemetry";

interface Props {
  seasons: number[];
  defaultKey?: string | null;
  defaultLabel?: string;
}

export function HomeDashboard({ seasons, defaultKey, defaultLabel }: Props) {
  const [sessionKey, setSessionKey] = useState<string | null>(defaultKey ?? null);
  const [sessionLabel, setSessionLabel] = useState(defaultLabel ?? "F1 Strategy");
  const [view, setView] = useState<View>("replay");

  function handleSelect(key: string, label: string) {
    setSessionKey(key);
    setSessionLabel(label);
    // Stay on current view when switching sessions
  }

  const picker = (
    <RaceSessionPicker
      seasons={seasons}
      onSelect={handleSelect}
      currentKey={sessionKey}
    />
  );

  return (
    <AppShell
      sessionKey={sessionKey ?? undefined}
      headerLabel={sessionLabel || undefined}
      headerActions={picker}
    >
      {sessionKey ? (
        <div className="flex flex-col h-full overflow-hidden">
          {/* View tab bar */}
          <div className="flex shrink-0 border-b border-f1-border bg-f1-panel">
            <TabButton label="Replay" active={view === "replay"} onClick={() => setView("replay")} />
            <TabButton label="Telemetry" active={view === "telemetry"} onClick={() => setView("telemetry")} />
          </div>

          {/* Content — key forces full remount on session change */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {view === "replay" ? (
              <ReplayDashboard key={sessionKey} sessionKey={sessionKey} />
            ) : (
              <TelemetryCompare key={sessionKey} sessionKey={sessionKey} />
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-f1-muted select-none">
          <div className="w-12 h-px bg-f1-border" />
          <p className="text-xs font-mono tracking-widest uppercase">Select a race or go LIVE</p>
          <div className="w-12 h-px bg-f1-border" />
        </div>
      )}
    </AppShell>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-5 py-2 text-xs font-mono uppercase tracking-widest border-b-2 transition-colors",
        active
          ? "border-f1-red text-f1-text"
          : "border-transparent text-f1-muted hover:text-f1-text hover:border-f1-border",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
