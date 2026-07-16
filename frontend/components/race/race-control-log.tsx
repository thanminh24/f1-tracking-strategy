"use client";

import { useRaceStateStore } from "../../lib/race-state-store";

const CATEGORY_COLORS: Record<string, string> = {
  SafetyCar: "bg-amber-900/50 text-amber-300 border-amber-500/40",
  Flag: "bg-red-900/50 text-f1-red border-red-500/40",
  Red: "bg-red-900/50 text-f1-red border-red-500/40",
  DRS: "bg-green-900/50 text-f1-green border-green-500/40",
  Other: "bg-zinc-800/80 text-f1-text-dim border-f1-border/60",
};

function formatSessionTime(tSessionS: number): string {
  if (!tSessionS) return "";
  const date = new Date(tSessionS > 1_000_000_000_000 ? tSessionS : tSessionS * 1000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function RaceControlLog({ compact = false }: { compact?: boolean }) {
  const messages = useRaceStateStore((s) => s.raceControlMessages);
  const trackStatus = useRaceStateStore((s) => s.state?.track_status);
  const leaderLap = useRaceStateStore((s) => s.state?.leader_lap);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-3 py-4 text-xs text-f1-muted">
        No race control messages yet
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${compact ? "" : "gap-2 p-2"}`}>
      {!compact && (
        <div className="flex shrink-0 items-center gap-3 px-1 text-[10px] uppercase tracking-widest text-f1-muted">
          <span>Track: {trackStatus?.toUpperCase() ?? "—"}</span>
          <span>·</span>
          <span>Lap {leaderLap ?? "—"}</span>
          <span>·</span>
          <span>{messages.length} messages</span>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-1">
        {messages.map((msg, idx) => {
          const colorClass = CATEGORY_COLORS[msg.category] ?? CATEGORY_COLORS.Other;
          return (
            <article
              key={`${msg.lap}-${msg.t_session_s}-${idx}`}
              className={`rounded border px-2 py-1.5 ${colorClass}`}
            >
              <div className="mb-0.5 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-wider opacity-80">
                <span className="font-data">{msg.category}</span>
                {msg.lap != null ? <span>Lap {msg.lap}</span> : null}
                {msg.t_session_s ? (
                  <span className="font-data normal-case tracking-normal">{formatSessionTime(msg.t_session_s)}</span>
                ) : null}
              </div>
              <p className="text-xs leading-relaxed text-f1-text whitespace-pre-wrap break-words">
                {msg.message}
              </p>
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** Thin strip for pit-wall footer — shows latest message only. */
export function RaceControlStrip() {
  const messages = useRaceStateStore((s) => s.raceControlMessages);
  if (messages.length === 0) return null;
  const latest = messages[0];
  const colorClass = CATEGORY_COLORS[latest.category] ?? CATEGORY_COLORS.Other;
  return (
    <div className="px-3 py-2 border-t border-f1-border">
      <div className={`chip border text-xs px-2 py-1 ${colorClass}`}>
        {latest.lap != null ? `L${latest.lap} · ` : ""}
        {latest.message}
      </div>
    </div>
  );
}
