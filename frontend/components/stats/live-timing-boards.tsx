"use client";

import { useMemo } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { formatLapMs, parseLapTimeMs } from "../../lib/lap-time-parse";
import { teamColor } from "../../lib/team-colors";
import { topPitWindows } from "../../lib/prediction-display";

export function LiveFastestLapsBoard() {
  const state = useRaceStateStore((s) => s.state);
  const liveTiming = state?.live_timing;

  const rows = useMemo(() => {
    if (!state) return [];
    return state.cars
      .filter((c) => c.status !== "out")
      .map((car) => {
        const lt = liveTiming?.[car.car_id];
        const bestMs =
          parseLapTimeMs(lt?.BestLapTime?.Value) ??
          (car.last_lap_ms && lt?.LastLapTime?.PersonalFastest ? car.last_lap_ms : null);
        return {
          carId: car.car_id,
          code: car.driver_code ?? car.car_id,
          team: car.team,
          position: car.position,
          bestMs,
          bestStr: lt?.BestLapTime?.Value ?? (bestMs != null ? formatLapMs(bestMs) : null),
        };
      })
      .filter((r) => r.bestMs != null)
      .sort((a, b) => (a.bestMs ?? Infinity) - (b.bestMs ?? Infinity))
      .slice(0, 12);
  }, [liveTiming, state]);

  if (rows.length === 0) {
    return <div className="p-4 text-xs text-f1-muted">Waiting for lap times…</div>;
  }

  const sessionBest = rows[0]?.bestMs ?? null;

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-f1-muted border-b border-f1-border">
          <th className="px-3 py-2 text-left font-medium">P</th>
          <th className="px-3 py-2 text-left font-medium">Driver</th>
          <th className="px-3 py-2 text-right font-medium">Best</th>
          <th className="px-3 py-2 text-right font-medium">Δ Best</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isSessionBest = row.bestMs === sessionBest;
          const delta = sessionBest != null && row.bestMs != null ? row.bestMs - sessionBest : null;
          return (
            <tr key={row.carId} className="border-b border-f1-border/40 hover:bg-f1-panel/40">
              <td className="px-3 py-2 font-data text-f1-text-dim">{row.position}</td>
              <td className="px-3 py-2">
                <span className="font-data font-semibold" style={{ color: teamColor(row.team) }}>
                  {row.code}
                </span>
                {isSessionBest ? (
                  <span className="ml-2 chip text-[9px] bg-purple-900/50 text-purple-300 border border-purple-400/40">
                    FL
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right font-data tabular-nums">{row.bestStr}</td>
              <td className="px-3 py-2 text-right font-data tabular-nums text-f1-text-dim">
                {isSessionBest ? "—" : delta != null ? `+${(delta / 1000).toFixed(3)}` : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function LivePitWindowsBoard() {
  const prediction = usePredictionStore((s) => s.prediction);
  const state = useRaceStateStore((s) => s.state);

  const rows = useMemo(() => {
    if (!prediction || !state) return [];
    return state.cars
      .filter((c) => c.status !== "out" && c.status !== "finished")
      .sort((a, b) => a.position - b.position)
      .map((car) => {
        const pred = prediction.cars.find((p) => p.car_id === car.car_id);
        const windows = pred ? topPitWindows(pred, 1) : [];
        const top = windows[0];
        return {
          carId: car.car_id,
          code: car.driver_code ?? car.car_id,
          team: car.team,
          position: car.position,
          action: pred?.recommended_action ?? null,
          pitLap: top ? Number(top.key) : null,
          pitProb: top?.probability ?? null,
        };
      });
  }, [prediction, state]);

  if (!prediction) {
    return <div className="p-4 text-xs text-f1-muted">RL model offline — pit windows unavailable</div>;
  }

  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-[10px] uppercase tracking-widest text-f1-muted border-b border-f1-border">
          <th className="px-3 py-2 text-left font-medium">P</th>
          <th className="px-3 py-2 text-left font-medium">Driver</th>
          <th className="px-3 py-2 text-left font-medium">Action</th>
          <th className="px-3 py-2 text-right font-medium">Expected pit</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.carId} className="border-b border-f1-border/40 hover:bg-f1-panel/40">
            <td className="px-3 py-2 font-data text-f1-text-dim">{row.position}</td>
            <td className="px-3 py-2 font-data font-semibold" style={{ color: teamColor(row.team) }}>
              {row.code}
            </td>
            <td className="px-3 py-2">
              {row.action ? (
                <span
                  className={`chip text-[9px] ${
                    row.action === "PIT_NOW" || row.action.startsWith("PIT")
                      ? "bg-amber-900/50 text-amber-300 border-amber-500/40"
                      : "bg-zinc-800 text-f1-text-dim border-f1-border"
                  }`}
                >
                  {row.action === "PIT_NOW" ? "PIT NOW" : row.action.replace("_", " ")}
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className="px-3 py-2 text-right font-data tabular-nums">
              {row.pitLap != null && row.pitProb != null
                ? `L${row.pitLap} · ${Math.round(row.pitProb * 100)}%`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
