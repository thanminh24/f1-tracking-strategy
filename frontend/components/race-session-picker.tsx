"use client";
// Compact race session selector: Season dropdown → Round dropdown → LIVE button.
// Calls onSelect(sessionKey) when user picks a session or goes live.
import { useEffect, useState } from "react";
import { API_BASE } from "../lib/api-client";
import type { EventRow } from "../lib/types";

interface LiveInfo {
  session_key: string | null;
  session_type?: string;
  circuit?: string;
  year?: number;
  status: string;
}

interface Props {
  seasons: number[];
  onSelect: (sessionKey: string, label: string) => void;
  currentKey: string | null;
}

export function RaceSessionPicker({ seasons, onSelect, currentKey }: Props) {
  const [season, setSeason] = useState<number>(seasons[0] ?? 2025);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [liveInfo, setLiveInfo] = useState<LiveInfo | null>(null);

  // Fetch events when season changes
  useEffect(() => {
    fetch(`${API_BASE}/api/events/${season}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setEvents)
      .catch(() => setEvents([]));
  }, [season]);

  // Poll live session status every 30s
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const r = await fetch(`${API_BASE}/api/live/current-session`, { cache: "no-store" });
        const data = await r.json();
        if (!cancelled) setLiveInfo(data);
      } catch { /* silent */ }
    }
    check();
    const id = setInterval(check, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const isLive = currentKey === "live";
  const hasLive = liveInfo?.status === "active";

  function pickArchive(e: React.ChangeEvent<HTMLSelectElement>) {
    const key = e.target.value;
    if (!key) return;
    const ev = events.find((ev) => `${season}_${ev.round}_R` === key);
    const label = ev ? `${ev.event_name} ${season}` : key;
    onSelect(key, label);
  }

  function goLive() {
    const label = hasLive
      ? `${liveInfo?.session_type ?? "Live"} · ${liveInfo?.circuit ?? ""} ${liveInfo?.year ?? ""}`.trim()
      : "Live Session";
    onSelect("live", label);
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Season select */}
      <select
        value={season}
        onChange={(e) => setSeason(Number(e.target.value))}
        className="bg-f1-panel border border-f1-border text-f1-text text-xs rounded px-2 py-1 h-7 focus:outline-none focus:border-f1-red"
      >
        {seasons.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>

      {/* Race select */}
      <select
        onChange={pickArchive}
        value={currentKey && !isLive ? currentKey : ""}
        className="bg-f1-panel border border-f1-border text-f1-text text-xs rounded px-2 py-1 h-7 focus:outline-none focus:border-f1-red min-w-[180px]"
      >
        <option value="">— Select race —</option>
        {events
          .filter((ev) => ev.session_types.includes("R"))
          .map((ev) => (
            <option key={ev.round} value={`${season}_${ev.round}_R`}>
              R{ev.round} · {ev.event_name}
            </option>
          ))}
      </select>

      {/* Divider */}
      <div className="w-px h-5 bg-f1-border" />

      {/* Live button */}
      <button
        onClick={goLive}
        className={[
          "flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold h-7 transition-all cursor-pointer",
          hasLive
            ? "bg-f1-red text-white hover:bg-red-700"
            : "bg-f1-panel border border-f1-border text-f1-muted hover:text-f1-text",
          isLive ? "ring-1 ring-f1-red" : "",
        ].join(" ")}
        title={hasLive ? `Live: ${liveInfo?.session_type} at ${liveInfo?.circuit}` : "No live session detected"}
        >
        <span className={`w-1.5 h-1.5 rounded-full ${hasLive ? "bg-white animate-pulse" : "bg-f1-muted"}`} />
        {hasLive
          ? `LIVE · ${liveInfo?.session_type?.replace("Practice ", "FP").replace("Qualifying", "QUALI") ?? "LIVE"}`
          : "LIVE"}
      </button>
    </div>
  );
}
