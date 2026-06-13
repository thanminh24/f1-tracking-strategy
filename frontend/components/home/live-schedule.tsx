"use client";
// Live tab: shows active sessions with JOIN button + upcoming sessions with countdown.
import { useEffect, useState } from "react";
import Link from "next/link";
import type { ScheduleSession } from "../../lib/api-client";

interface Props {
  initialSchedule: ScheduleSession[];
}

function formatCountdown(diffMs: number): string {
  const hrs = Math.floor(diffMs / 3_600_000);
  const mins = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hrs > 0) return `in ${hrs}h ${mins}m`;
  if (mins > 0) return `in ${mins}m`;
  return "starting now";
}

function formatLocalTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function LiveSchedule({ initialSchedule }: Props) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const active = initialSchedule.filter((s) => s.status === "active");
  const upcoming = initialSchedule.filter((s) => s.status === "upcoming");

  if (active.length === 0 && upcoming.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-10 text-center">
        <div className="text-5xl opacity-10 select-none">🏁</div>
        <div className="text-sm font-semibold text-f1-text-dim">No sessions in the next 48h</div>
        <div className="text-xs text-f1-muted">Switch to Archive to browse past races</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 overflow-y-auto scrollbar-thin flex-1">
      {active.map((s) => (
        <Link
          key={s.openf1_key}
          href="/session/live?source=live"
          className="group flex items-center gap-4 p-4 rounded-xl border-2 border-f1-red
                     bg-f1-panel hover:bg-f1-panel-hover transition-colors"
        >
          <span className="chip bg-red-900/60 text-f1-red border border-f1-red/40 live-pulse text-xs shrink-0">
            ● LIVE
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-f1-text truncate">
              {s.session_type ?? "Session"} · {s.circuit ?? "Unknown circuit"}
            </div>
            <div className="text-xs text-f1-text-dim">
              {s.country ?? ""}
              {s.year ? ` · ${s.year}` : ""}
            </div>
          </div>
          <span className="text-sm font-semibold text-f1-red group-hover:underline shrink-0">
            Join →
          </span>
        </Link>
      ))}

      {upcoming.map((s) => {
        const diffMs = s.date_start
          ? new Date(s.date_start).getTime() - now.getTime()
          : null;
        const timeStr = s.date_start ? formatLocalTime(s.date_start) : null;

        return (
          <div
            key={s.openf1_key}
            className="flex items-center gap-4 p-4 rounded-xl border border-f1-border bg-f1-panel"
          >
            <span className="chip bg-f1-surface text-f1-text-dim border border-f1-border text-xs shrink-0">
              ⏱ SOON
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-f1-text truncate">
                {s.session_type ?? "Session"} · {s.circuit ?? "Unknown circuit"}
              </div>
              <div className="text-xs text-f1-text-dim">
                {s.country ?? ""}
                {s.year ? ` · ${s.year}` : ""}
                {timeStr ? ` · starts ${timeStr}` : ""}
              </div>
            </div>
            {diffMs != null && diffMs > 0 && (
              <span className="text-xs text-f1-muted font-data shrink-0">
                {formatCountdown(diffMs)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
