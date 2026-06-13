"use client";
import { useEffect, useState } from "react";
import { api } from "../../lib/api-client";
import { TeamRadioMessage } from "../../lib/types";

interface Props {
  sessionKey: string;
}

// Simple driver code → fallback color map (for drivers without team context)
const DRIVER_CODE_COLORS: Record<string, string> = {
  HAM: "#27F4D2", // Mercedes
  RUS: "#27F4D2",
  VER: "#3671C6", // Red Bull
  PER: "#3671C6",
  LEC: "#E8002D", // Ferrari
  SAI: "#E8002D",
  NOR: "#FF8000", // McLaren
  PIA: "#FF8000",
  ALO: "#229971", // Aston Martin
  STR: "#229971",
  BOT: "#52E252", // Sauber
  ZHO: "#52E252",
  MAG: "#B6BABD", // Haas
  HUL: "#B6BABD",
  GAS: "#6692FF", // RB
  TSU: "#6692FF",
  OCO: "#FF87BC", // Alpine
  GAR: "#64C4FF", // Williams
  ALB: "#64C4FF",
  LAW: "#64C4FF",
};

function getDriverColor(driverCode: string): string {
  return DRIVER_CODE_COLORS[driverCode.toUpperCase()] ?? "#707070";
}

export function TeamRadioTimeline({ sessionKey }: Props) {
  const [messages, setMessages] = useState<TeamRadioMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return null;
        setLoading(true);
        setError(false);
        return api.teamRadio(sessionKey);
      })
      .then((data) => {
        if (cancelled || !data) return;
        // Sort by lap descending (newest first)
        data.sort((a, b) => b.lap - a.lap || b.t_session_s - a.t_session_s);
        // Keep only top 200 messages to avoid DOM bloat
        setMessages(data.slice(0, 200));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [sessionKey]);

  return (
    <div className="flex flex-col gap-2 p-2 text-xs">
      {loading && <div className="text-f1-muted text-center py-2">Loading team radio...</div>}
      {error && <div className="text-red-500 text-center py-2">Failed to load team radio</div>}

      {!loading && !error && messages.length === 0 && (
        <div className="text-f1-muted text-center py-2">No team radio messages</div>
      )}

      {!loading && !error && messages.length > 0 && (
        <div className="max-h-48 overflow-y-auto scrollbar-thin flex flex-col gap-1">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 p-1.5 bg-f1-surface/50 border border-f1-border rounded text-xs"
            >
              {/* Lap badge */}
              <div className="text-f1-muted whitespace-nowrap">LAP {msg.lap}</div>

              {/* Driver code (colored) */}
              <div
                className="font-bold whitespace-nowrap min-w-max"
                style={{ color: getDriverColor(msg.driver_code) }}
              >
                {msg.driver_code}
              </div>

              {/* Message or audio indicator */}
              <div className="flex-1 text-f1-text truncate">
                {msg.msg ? (
                  <span>{msg.msg}</span>
                ) : (
                  <span className="italic text-f1-muted">[audio only]</span>
                )}
              </div>

              {/* Audio button (if available) */}
              {msg.audio_url && (
                <audio
                  controls
                  src={msg.audio_url}
                  className="h-6 max-w-xs"
                  title={`${msg.driver_code} audio`}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
