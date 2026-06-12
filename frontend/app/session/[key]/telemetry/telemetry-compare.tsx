"use client";
// Multi-driver telemetry comparison.
// Default: top 3 finishers' fastest laps overlaid.
// Click a driver to toggle them. Expand to see all their laps and add individual laps.
import { useEffect, useMemo, useState, useCallback } from "react";
import { TelemetryTraces, type LapTrace } from "../../../../components/telemetry-traces";
import { api } from "../../../../lib/api-client";
import { teamColor, compoundColor, formatLapTime } from "../../../../lib/team-colors";
import type { LapRow, ResultRow, TelemetrySample } from "../../../../lib/types";

// Key for the fetched cache: `${carId}:${lapNumber}`
function traceKey(carId: string, lap: number) { return `${carId}:${lap}`; }

interface DriverSection {
  driver: ResultRow;
  fastestLap: number | null;
  laps: LapRow[];
  expanded: boolean;
}

export function TelemetryCompare({ sessionKey }: { sessionKey: string }) {
  const [sections, setSections] = useState<DriverSection[]>([]);
  // Selected traces: Set of "carId:lapNumber" keys
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Fetched telemetry: map from "carId:lapNumber" → samples
  const [fetched, setFetched] = useState<Map<string, TelemetrySample[]>>(new Map());
  const [pending, setPending] = useState<Set<string>>(new Set());

  // Load all drivers + their laps on mount
  useEffect(() => {
    let cancelled = false;
    Promise.all([api.results(sessionKey), api.laps(sessionKey)]).then(([results, allLaps]) => {
      if (cancelled) return;

      // Group laps by driver
      const lapsByDriver = new Map<string, LapRow[]>();
      for (const lap of allLaps) {
        if (!lapsByDriver.has(lap.car_id)) lapsByDriver.set(lap.car_id, []);
        lapsByDriver.get(lap.car_id)!.push(lap);
      }

      const built: DriverSection[] = results.map((driver) => {
        const driverLaps = (lapsByDriver.get(driver.car_id) ?? [])
          .filter((l) => l.lap_time_ms != null)
          .sort((a, b) => a.lap_number - b.lap_number);
        const fastestLap = driverLaps.length
          ? driverLaps.reduce((a, b) =>
              (a.lap_time_ms ?? 9e9) < (b.lap_time_ms ?? 9e9) ? a : b
            ).lap_number
          : null;
        return { driver, fastestLap, laps: driverLaps, expanded: false };
      });

      setSections(built);

      // Auto-select top 3 finishers' fastest laps
      const autoSelect = new Set<string>();
      for (const s of built.slice(0, 3)) {
        if (s.fastestLap != null) autoSelect.add(traceKey(s.driver.car_id, s.fastestLap));
      }
      setSelected(autoSelect);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [sessionKey]);

  // Fetch telemetry for any newly selected trace that isn't cached
  useEffect(() => {
    const toFetch = [...selected].filter((k) => !fetched.has(k) && !pending.has(k));
    if (!toFetch.length) return;
    setPending((s) => new Set([...s, ...toFetch]));
    for (const key of toFetch) {
      const [carId, lapStr] = key.split(":");
      api.telemetry(sessionKey, carId, Number(lapStr))
        .then((data) => {
          setFetched((m) => new Map([...m, [key, data]]));
          setPending((s) => { const n = new Set(s); n.delete(key); return n; });
        })
        .catch(() => {
          setPending((s) => { const n = new Set(s); n.delete(key); return n; });
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, sessionKey]);

  const toggleTrace = useCallback((carId: string, lap: number) => {
    const key = traceKey(carId, lap);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  const toggleExpand = useCallback((carId: string) => {
    setSections((prev) =>
      prev.map((s) =>
        s.driver.car_id === carId ? { ...s, expanded: !s.expanded } : s
      )
    );
  }, []);

  // Select/deselect all laps for a driver
  const toggleDriver = useCallback((section: DriverSection) => {
    const keys = section.laps.map((l) => traceKey(section.driver.car_id, l.lap_number));
    const allOn = keys.every((k) => selected.has(k));
    setSelected((s) => {
      const next = new Set(s);
      if (allOn) {
        for (const k of keys) next.delete(k);
      } else {
        // Just toggle fastest lap if nothing selected, else add all
        if (section.fastestLap != null) {
          const fk = traceKey(section.driver.car_id, section.fastestLap);
          if (next.has(fk)) { next.delete(fk); } else { next.add(fk); }
        }
      }
      return next;
    });
  }, [selected]);

  const traces: LapTrace[] = useMemo(() => {
    const result: LapTrace[] = [];
    for (const section of sections) {
      const color = teamColor(section.driver.team ?? "");
      const fastestKey = section.fastestLap != null
        ? traceKey(section.driver.car_id, section.fastestLap) : null;

      for (const lap of section.laps) {
        const key = traceKey(section.driver.car_id, lap.lap_number);
        if (!selected.has(key) || !fetched.has(key)) continue;
        const isFastest = key === fastestKey;
        result.push({
          lap: lap.lap_number,
          // Use team color for fastest, lighter for others
          color: isFastest ? color : color + "88",
          data: fetched.get(key)!,
          isFastest,
          label: `${section.driver.driver_code} L${lap.lap_number}${isFastest ? " ★" : ""}`,
        });
      }
    }
    return result;
  }, [sections, selected, fetched]);

  const totalSelected = selected.size;

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-52 shrink-0 flex flex-col border-r border-f1-border bg-f1-panel overflow-hidden">

        {/* Header */}
        <div className="px-3 py-2 border-b border-f1-border shrink-0">
          <p className="text-[9px] text-f1-muted uppercase tracking-wider">Drivers</p>
          <p className="text-[10px] text-f1-muted font-mono mt-0.5">
            {totalSelected} trace{totalSelected !== 1 ? "s" : ""} selected
          </p>
        </div>

        {/* Driver list */}
        <div className="flex-1 overflow-y-auto">
          {sections.map((section) => {
            const { driver, fastestLap, laps, expanded } = section;
            const color = teamColor(driver.team ?? "");
            const fastestKey = fastestLap != null ? traceKey(driver.car_id, fastestLap) : null;
            const fastestSelected = fastestKey ? selected.has(fastestKey) : false;
            const anySelected = laps.some((l) => selected.has(traceKey(driver.car_id, l.lap_number)));
            const fastestLapRow = laps.find((l) => l.lap_number === fastestLap);

            return (
              <div key={driver.car_id} className="border-b border-f1-border/30">
                {/* Driver row — click to toggle fastest lap, expand button for lap list */}
                <div className="flex items-center gap-1 px-2 py-[6px] group">
                  {/* Team color dot + fastest lap toggle */}
                  <button
                    onClick={() => fastestKey && toggleTrace(driver.car_id, fastestLap!)}
                    className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    disabled={!fastestKey}
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-opacity"
                      style={{ background: color, opacity: fastestSelected ? 1 : 0.3 }}
                    />
                    <span className={`font-mono text-[11px] font-bold shrink-0 transition-colors ${
                      anySelected ? "text-f1-text" : "text-f1-muted"
                    }`}>
                      {driver.driver_code}
                    </span>
                    <span className="text-[10px] text-f1-muted font-mono truncate flex-1 text-right">
                      {fastestLapRow ? formatLapTime(fastestLapRow.lap_time_ms) : "—"}
                    </span>
                    {/* Loading indicator */}
                    {fastestKey && pending.has(fastestKey) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-f1-amber animate-pulse shrink-0" />
                    )}
                  </button>

                  {/* Expand toggle (shows all laps) */}
                  {laps.length > 0 && (
                    <button
                      onClick={() => toggleExpand(driver.car_id)}
                      className="text-f1-muted hover:text-f1-text transition-colors p-0.5 rounded shrink-0"
                      title={expanded ? "Collapse laps" : "Show all laps"}
                    >
                      <svg viewBox="0 0 12 12" fill="currentColor" className="w-3 h-3">
                        <path d={expanded
                          ? "M2 8l4-4 4 4"   // chevron up
                          : "M2 4l4 4 4-4"}  // chevron down
                        />
                      </svg>
                    </button>
                  )}
                </div>

                {/* Expanded: individual lap rows */}
                {expanded && (
                  <div className="bg-f1-surface/50">
                    {laps.map((lap) => {
                      const key = traceKey(driver.car_id, lap.lap_number);
                      const sel = selected.has(key);
                      const isFastest = lap.lap_number === fastestLap;
                      const lapColor = isFastest ? color : compoundColor(lap.compound);
                      return (
                        <button
                          key={lap.lap_number}
                          onClick={() => toggleTrace(driver.car_id, lap.lap_number)}
                          className={[
                            "w-full flex items-center gap-2 px-3 py-[4px] text-left",
                            "border-b border-f1-border/10 transition-colors",
                            sel ? "bg-f1-panel/50" : "hover:bg-f1-panel/30",
                          ].join(" ")}
                        >
                          <span
                            className="w-1 h-3.5 rounded-sm shrink-0"
                            style={{ background: lapColor, opacity: sel ? 1 : 0.2 }}
                          />
                          <span className={`font-mono text-[10px] w-6 shrink-0 ${sel ? "text-f1-text" : "text-f1-muted"}`}>
                            L{lap.lap_number}
                          </span>
                          <span className={`font-mono text-[10px] flex-1 text-right ${
                            isFastest ? "text-[#BF00FF]" : sel ? "text-f1-text" : "text-f1-muted"
                          }`}>
                            {formatLapTime(lap.lap_time_ms)}
                          </span>
                          {pending.has(key) && (
                            <span className="w-1 h-1 rounded-full bg-f1-amber animate-pulse shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {!sections.length && (
            <p className="text-f1-muted text-xs text-center py-8">Loading drivers…</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-f1-border shrink-0">
          <button
            onClick={() => setSelected(new Set())}
            className="text-[9px] text-f1-muted hover:text-f1-text transition-colors uppercase tracking-wider"
          >
            Clear all
          </button>
        </div>
      </aside>

      {/* ── Chart area ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto p-3 bg-f1-surface">
        {traces.length > 0 ? (
          <>
            <TelemetryTraces traces={traces} />
            <p className="text-[10px] text-f1-muted mt-2 font-mono">
              Click a driver to toggle fastest lap · expand ▾ to pick specific laps ·{" "}
              <span style={{ color: "#BF00FF" }}>■</span> fastest lap ·{" "}
              first fetch downloads from FastF1, cached after
            </p>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-f1-muted text-sm">
            {sections.length ? "Select a driver to load telemetry" : "Loading session…"}
          </div>
        )}
      </div>

    </div>
  );
}
