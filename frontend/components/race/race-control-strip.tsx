"use client";
import { useRaceStateStore } from "../../lib/race-state-store";

const CATEGORY_COLORS: Record<string, string> = {
  SafetyCar: "bg-amber-900/60 text-amber-400 border-amber-400/40",
  Flag: "bg-red-900/60 text-f1-red border-f1-red/40",
  Red: "bg-red-900/60 text-f1-red border-f1-red/40",
  DRS: "bg-green-900/60 text-f1-green border-f1-green/40",
  Other: "bg-zinc-800 text-f1-text-dim border-f1-border/60",
};

export function RaceControlStrip() {
  const messages = useRaceStateStore((s) => s.raceControlMessages);

  if (messages.length === 0) return null;

  const recent = messages.slice(0, 3);

  return (
    <div className="flex flex-col gap-1 px-3 py-2 border-t border-f1-border">
      {recent.map((msg, idx) => {
        const colorClass = CATEGORY_COLORS[msg.category] || CATEGORY_COLORS.Other;
        const truncated =
          msg.message.length > 60
            ? msg.message.substring(0, 57) + "…"
            : msg.message;
        return (
          <div
            key={`${msg.lap}-${idx}`}
            className={`chip border text-xs px-2 py-1 ${colorClass}`}
          >
            {truncated}
          </div>
        );
      })}
    </div>
  );
}
