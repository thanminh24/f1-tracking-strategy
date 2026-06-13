"use client";
// Archive tab: year chips → event list → session pills with ensure-then-navigate flow.
// Uses /api/calendar/{year} (FastF1-backed) so ALL rounds are visible regardless of local ingest.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../lib/api-client";
import type { CalendarEvent } from "../../lib/api-client";

const CURRENT_YEAR = new Date().getFullYear();
// FastF1 calendar starts at 2018
const ALL_YEARS = Array.from({ length: CURRENT_YEAR - 2017 }, (_, i) => CURRENT_YEAR - i);

// FastF1 uses long names; map to compact display labels and safe session key suffixes
const SESSION_ABBR: Record<string, string> = {
  "Practice 1": "FP1", "Practice 2": "FP2", "Practice 3": "FP3",
  "Sprint Qualifying": "SQ", "Sprint Shootout": "SQ",
  "Sprint Race": "SR", "Sprint": "SR",
  "Qualifying": "Q", "Race": "R",
};
function abbr(name: string): string {
  // Fallback: replace spaces with underscores so session keys never contain spaces
  return SESSION_ABBR[name] ?? name.replace(/\s+/g, "_");
}

interface Props {
  initialYear?: number | null;
}

export function ArchiveBrowser({ initialYear }: Props) {
  const router = useRouter();
  const [year, setYear] = useState<number>(initialYear ?? CURRENT_YEAR);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loadingYear, setLoadingYear] = useState(false);
  const [ensuringKey, setEnsuringKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        setLoadingYear(true);
        setErrorMsg(null);
        return api.calendar(year);
      })
      .then((evs) => {
        if (!cancelled && evs) setEvents(evs);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingYear(false);
      });
    return () => { cancelled = true; };
  }, [year]);

  async function handleSessionClick(sessionKey: string) {
    if (ensuringKey) return;
    setEnsuringKey(sessionKey);
    setErrorMsg(null);
    try {
      await api.ensureSession(sessionKey);
      router.push(`/session/${sessionKey}`);
    } catch {
      setErrorMsg(`Could not load ${sessionKey} — check backend logs`);
      setEnsuringKey(null);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Year chips — generated client-side from 2018→present */}
      <div className="flex gap-1.5 px-4 py-3 border-b border-f1-border flex-wrap shrink-0">
        {ALL_YEARS.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            disabled={loadingYear}
            className={`px-3 py-1 rounded text-sm font-semibold transition-colors disabled:opacity-50 ${
              y === year
                ? "bg-f1-red text-white"
                : "bg-f1-panel border border-f1-border text-f1-text-dim hover:text-f1-text hover:border-f1-red/50"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {errorMsg && (
        <div className="mx-4 mt-3 text-xs text-red-400 px-3 py-2 bg-red-900/20 rounded border border-red-900/40">
          {errorMsg}
        </div>
      )}

      {/* Events list */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-4 space-y-2">
        {loadingYear ? (
          <div className="text-xs text-f1-muted animate-pulse py-4">Loading events…</div>
        ) : events.length === 0 ? (
          <div className="text-xs text-f1-muted py-4">No events found for {year}</div>
        ) : (
          events.map((event) => (
            <div
              key={event.round}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-f1-panel border border-f1-border"
            >
              <span className="text-[10px] text-f1-muted font-data w-7 shrink-0 text-right">
                R{event.round}
                {!event.local && (
                  <span className="ml-0.5 opacity-50" title="Not downloaded yet">↓</span>
                )}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-f1-text truncate">{event.event_name}</div>
                <div className="text-[10px] text-f1-muted">{event.circuit}</div>
              </div>
              <div className="flex gap-1 flex-wrap justify-end shrink-0">
                {event.session_types.map((type) => {
                  const key = `${year}_${event.round}_${abbr(type)}`;
                  const isEnsuring = ensuringKey === key;
                  return (
                    <button
                      key={type}
                      onClick={() => handleSessionClick(key)}
                      disabled={ensuringKey !== null}
                      title={`Open ${year} R${event.round} ${type}${!event.local ? " (will download)" : ""}`}
                      className={`px-2 py-0.5 rounded text-[10px] font-data font-semibold transition-colors ${
                        isEnsuring
                          ? "bg-f1-red/20 text-f1-red border border-f1-red/40 animate-pulse cursor-wait"
                          : event.local
                          ? "bg-f1-surface border border-f1-border text-f1-text-dim hover:text-f1-text hover:border-f1-red/50 hover:bg-f1-panel disabled:opacity-40 disabled:cursor-not-allowed"
                          : "bg-f1-surface/50 border border-dashed border-f1-border/60 text-f1-text-dim/70 hover:text-f1-text hover:border-f1-red/40 hover:bg-f1-panel disabled:opacity-40 disabled:cursor-not-allowed"
                      }`}
                    >
                      {isEnsuring ? "…" : abbr(type)}
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ensure-in-progress overlay hint */}
      {ensuringKey && (
        <div className="shrink-0 px-4 py-2 border-t border-f1-border bg-f1-surface text-xs text-f1-text-dim">
          Downloading <span className="text-f1-text font-data">{ensuringKey}</span> — this may take a moment…
        </div>
      )}
    </div>
  );
}
