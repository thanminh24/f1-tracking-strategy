"use client";
import { useRaceStateStore } from "../../lib/race-state-store";

function formatTime(seconds: number): string {
  const min = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
}

interface SessionClockProps {
  className?: string;
}

export function SessionClock({ className = "" }: SessionClockProps) {
  const t =
    useRaceStateStore((s) => s.status?.t_session_s ?? s.state?.t_session_s) ?? null;

  const timeStr = t !== null ? formatTime(t) : "—:——";

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="text-xs text-f1-text-dim">🕐</span>
      <span className="font-data text-xs text-f1-text-dim">{timeStr}</span>
    </div>
  );
}
