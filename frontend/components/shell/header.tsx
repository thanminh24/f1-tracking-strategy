"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { F1Logo } from "../ui/f1-logo";
import { SessionClock } from "../widgets/session-clock";
import { WeatherWidget } from "../widgets/weather-widget";
import { useRaceStateStore } from "../../lib/race-state-store";
import { WorkspaceSwitch } from "../workspace/workspace-switch";
import type { WorkspaceMode } from "../../lib/types";

/** Parse "0:43:27" or "43:27" → total seconds */
function parseRemaining(s: string): number {
  const parts = s.split(":").map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

function fmtSecs(totalSecs: number): string {
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = Math.floor(totalSecs % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function ExtrapolatedClockWidget() {
  const clock = useRaceStateStore((s) => s.extrapolatedClock);
  if (!clock) return null;
  const display = fmtSecs(parseRemaining(clock.Remaining));
  return (
    <span
      className={`font-data text-sm tabular-nums shrink-0 ${
        clock.Extrapolating ? "text-amber-400/70" : "text-f1-text"
      }`}
      title={clock.Extrapolating ? "Estimated (clock extrapolated)" : "Session remaining"}
    >
      {display}
      {clock.Extrapolating && <span className="text-[9px] ml-0.5 text-amber-400/50">est</span>}
    </span>
  );
}

const SESSION_PART_LABELS: Record<number, { label: string; cls: string }> = {
  1: { label: "Q1", cls: "bg-zinc-700 text-zinc-300 border-zinc-600" },
  2: { label: "Q2", cls: "bg-amber-900/60 text-amber-400 border-amber-500/40" },
  3: { label: "Q3", cls: "bg-green-900/60 text-green-400 border-green-500/40" },
};

interface HeaderProps {
  sessionLabel?: string;
  sessionKey?: string;
  /** "live" | "archive" — shows coloured badge */
  sourceMode?: "live" | "archive" | "fixture";
  workspaceMode?: WorkspaceMode;
  onWorkspaceChange?: (mode: WorkspaceMode) => void;
}

export function Header({
  sessionLabel,
  sessionKey,
  sourceMode,
  workspaceMode,
  onWorkspaceChange,
}: HeaderProps) {
  const router = useRouter();
  const connected = useRaceStateStore((s) => s.connected);
  const reconnecting = useRaceStateStore((s) => s.reconnecting);
  const sessionPart = useRaceStateStore((s) => s.state?.live_timing_session_part);
  const partMeta = sessionPart != null ? SESSION_PART_LABELS[sessionPart] : null;

  const handleSourceToggle = (newSource: "live" | "archive") => {
    if (newSource === "live") {
      if (sessionKey && sessionKey !== "live") {
        sessionStorage.setItem("pit-wall:last-archive-session", window.location.pathname);
      }
      router.push("/session/live?source=live");
      return;
    }

    if (sessionKey === "live") {
      router.push(sessionStorage.getItem("pit-wall:last-archive-session") ?? "/");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    params.set("source", newSource);
    router.push(`${window.location.pathname}?${params.toString()}`);
  };

  return (
    <header className="flex items-center gap-4 px-4 h-14 border-b border-f1-border bg-f1-surface shrink-0">
      {/* Brand — always links home */}
      <Link href="/" className="flex items-center gap-2.5 shrink-0 hover:opacity-80 transition-opacity">
        <F1Logo className="h-5 w-auto" />
        <span className="text-sm font-semibold tracking-tight text-f1-text hidden sm:block">
          Pit&nbsp;Wall
        </span>
      </Link>

      {/* Session label + connection dot */}
      {sessionLabel && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-f1-text-dim truncate font-data">{sessionLabel}</span>
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              connected
                ? "bg-green-500"
                : reconnecting
                  ? "bg-amber-500 animate-pulse"
                  : "bg-zinc-600"
            }`}
            title={connected ? "Connected" : reconnecting ? "Reconnecting..." : "Disconnected"}
          />
        </div>
      )}

      {/* spacer */}
      <div className="flex-1" />

      {/* Source toggle — only when in a session */}
      {sourceMode && (
        <div className="flex items-center gap-1 border border-f1-border rounded-lg p-0.5">
          {sourceMode === "fixture" ? (
            <span className="chip text-[10px] bg-cyan-950/70 text-cyan-300 border border-cyan-500/30">
              DEV FIXTURE
            </span>
          ) : (
            <>
              <button
                onClick={() => handleSourceToggle("live")}
                className={`chip text-[10px] transition-colors ${
                  sourceMode === "live"
                    ? "bg-red-900/60 text-f1-red border border-f1-red/40 live-pulse"
                    : "bg-transparent text-f1-text-dim border border-transparent hover:border-f1-border/50"
                }`}
              >
                ● LIVE
              </button>
              <button
                onClick={() => handleSourceToggle("archive")}
                className={`chip text-[10px] transition-colors ${
                  sourceMode === "archive"
                    ? "bg-zinc-800 text-f1-text border border-f1-border"
                    : "bg-transparent text-f1-text-dim border border-transparent hover:border-f1-border/50"
                }`}
              >
                ARCHIVE
              </button>
            </>
          )}
        </div>
      )}

      {workspaceMode && onWorkspaceChange ? (
        <WorkspaceSwitch mode={workspaceMode} onChange={onWorkspaceChange} />
      ) : null}

      {/* Qualifying session part badge (live only) */}
      {partMeta && (
        <span
          className={`chip text-[10px] font-bold border shrink-0 ${partMeta.cls}`}
        >
          {partMeta.label}
        </span>
      )}

      {/* ExtrapolatedClock — remaining time for live sessions */}
      {sessionKey === "live" && <ExtrapolatedClockWidget />}

      {/* Widgets — session clock + weather (archive) */}
      {sessionKey && sessionKey !== "live" && (
        <div className="flex items-center gap-4">
          <SessionClock />
          <WeatherWidget sessionKey={sessionKey} />
        </div>
      )}
    </header>
  );
}
