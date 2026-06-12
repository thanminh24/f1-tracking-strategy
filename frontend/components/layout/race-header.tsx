"use client";
// Top bar: brand · session label · lap counter · track status · actions.
import { useRaceStateStore } from "../../lib/race-state-store";

interface RaceHeaderProps {
  sessionKey?: string;
  label?: string;
  actions?: React.ReactNode;
}

const STATUS_STYLES: Record<string, { pill: string; dot: string; text: string }> = {
  green:       { pill: "bg-green-950/60 border-green-800/40",  dot: "bg-green-500",   text: "text-green-400" },
  yellow_zone: { pill: "bg-yellow-950/60 border-yellow-700/40", dot: "bg-yellow-400",  text: "text-yellow-300" },
  vsc:         { pill: "bg-yellow-950/60 border-yellow-700/40", dot: "bg-yellow-400 animate-pulse", text: "text-yellow-300" },
  sc:          { pill: "bg-amber-950/60 border-amber-700/40",  dot: "bg-amber-400 animate-pulse",  text: "text-amber-300" },
  red:         { pill: "bg-red-950/60 border-red-800/40",      dot: "bg-red-500 animate-pulse",    text: "text-red-400" },
};

const STATUS_LABEL: Record<string, string> = {
  green: "GREEN", yellow_zone: "YELLOW", vsc: "VSC", sc: "SAFETY CAR", red: "RED FLAG",
};

function TrackStatusBadge() {
  const status = useRaceStateStore((s) => s.state?.track_status);
  if (!status || status === "green") return null;
  const style = STATUS_STYLES[status] ?? STATUS_STYLES.green;
  return (
    <span className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-black tracking-wider ${style.pill} ${style.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`} />
      {STATUS_LABEL[status] ?? status.toUpperCase()}
    </span>
  );
}

function LapCounter({ sessionKey }: { sessionKey: string }) {
  const state = useRaceStateStore((s) => s.state);
  if (!state || state.session_key !== sessionKey) return null;
  return (
    <span className="font-mono text-xs tabular-nums">
      <span className="text-f1-muted text-[10px]">LAP </span>
      <span className="text-f1-text font-bold">{state.leader_lap}</span>
      {state.total_laps != null && (
        <span className="text-f1-muted text-[10px]">/{state.total_laps}</span>
      )}
    </span>
  );
}

export function RaceHeader({ sessionKey, label, actions }: RaceHeaderProps) {
  const connected = useRaceStateStore((s) => s.connected);
  const source = useRaceStateStore((s) => s.source);
  const isLive = source === "live" && !!sessionKey;

  return (
    <header
      className="h-11 flex items-center gap-3 px-4 shrink-0 z-20 border-b border-f1-border"
      style={{
        background: "linear-gradient(180deg, #161616 0%, #0f0f0f 100%)",
      }}
    >
      {/* Brand mark */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative flex items-center">
          <span
            className="font-black text-sm tracking-tight select-none"
            style={{
              color: "#E10600",
              letterSpacing: "-0.03em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            F1
          </span>
          <span
            className="ml-1.5 text-[9px] font-bold uppercase tracking-[0.2em] hidden sm:inline"
            style={{ color: "#383838" }}
          >
            Strategy
          </span>
        </div>
      </div>

      {/* Vertical separator */}
      {(label ?? sessionKey) && (
        <div className="w-px h-4 bg-f1-border shrink-0" />
      )}

      {/* Session label */}
      {(label ?? sessionKey) && (
        <span className="text-xs text-f1-text font-medium truncate max-w-xs">
          {label ?? sessionKey}
        </span>
      )}

      {/* Lap counter + status (only with active session) */}
      {sessionKey && (
        <>
          <LapCounter sessionKey={sessionKey} />
          <TrackStatusBadge />
        </>
      )}

      {/* Spacer */}
      <div className="ml-auto flex items-center gap-3">
        {actions}

        {/* LIVE badge */}
        {isLive && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-f1-red/15 border border-f1-red/40 text-f1-red text-[10px] font-black tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-f1-red animate-pulse" />
            LIVE
          </span>
        )}

        {/* WS connection indicator */}
        {sessionKey && (
          <span
            title={connected ? "connected" : "reconnecting…"}
            className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
              connected ? "bg-emerald-500" : "bg-f1-red animate-pulse"
            }`}
          />
        )}
      </div>
    </header>
  );
}
