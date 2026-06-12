"use client";
// Visual strategy overlay: per-driver action recommendation + pit probability bars.
// Replaces the flat probability table as the primary strategy view.
import { useMemo } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import type { CarPrediction } from "../../lib/prediction-types";
import { teamColor } from "../../lib/team-colors";

const ACTION_COLORS: Record<string, string> = {
  STAY: "#22c55e",
  PIT_SOFT: "#ef4444",
  PIT_MEDIUM: "#eab308",
  PIT_HARD: "#d1d5db",
};

const ACTION_SHORT: Record<string, string> = {
  STAY: "STAY",
  PIT_SOFT: "PIT·S",
  PIT_MEDIUM: "PIT·M",
  PIT_HARD: "PIT·H",
};

function PitWindowBars({
  pitProbs,
  currentLap,
}: {
  pitProbs: Record<string, number>;
  currentLap: number;
}) {
  const laps = Array.from({ length: 6 }, (_, i) => currentLap + i);
  const maxP = Math.max(...laps.map((l) => pitProbs[String(l)] ?? 0), 0.05);

  return (
    <div className="flex items-end gap-px h-5" title="Pit window probability (next 6 laps)">
      {laps.map((lap) => {
        const p = pitProbs[String(lap)] ?? 0;
        const heightPct = Math.round((p / maxP) * 100);
        const isHigh = p >= 0.35;
        return (
          <div key={lap} className="flex flex-col items-center gap-px w-3">
            <div
              className="w-2 rounded-sm transition-all"
              style={{
                height: `${Math.max(2, (heightPct / 100) * 16)}px`,
                background: isHigh ? "#ef4444" : "#4b5563",
                opacity: p < 0.05 ? 0.2 : 1,
              }}
              title={`L${lap}: ${Math.round(p * 100)}%`}
            />
          </div>
        );
      })}
    </div>
  );
}

function DriverRow({
  car,
  carCode,
  carTeam,
  carPos,
  currentLap,
}: {
  car: CarPrediction;
  carCode: string;
  carTeam: string | null;
  carPos: number;
  currentLap: number;
}) {
  const action = car.recommended_action;
  const actionConf = action ? (car.action_probs[action] ?? 0) : 0;
  const actionColor = action ? (ACTION_COLORS[action] ?? "#9ca3af") : "#4b5563";
  const actionLabel = action ? (ACTION_SHORT[action] ?? action) : "—";
  const dotColor = teamColor(carTeam ?? "");
  const winPct = Math.round((car.outcome.win) * 100);
  const podiumPct = Math.round((car.outcome.podium) * 100);

  return (
    <div className="flex items-center gap-2 py-1 px-2 border-b border-f1-border/20 hover:bg-f1-panel-hover transition-colors">
      {/* Position + driver */}
      <div className="flex items-center gap-1 w-14 shrink-0">
        <span className="text-[9px] text-f1-muted font-mono w-4 text-right">{carPos}</span>
        <span
          className="w-1.5 h-4 rounded-sm shrink-0"
          style={{ background: dotColor }}
        />
        <span className="font-mono text-[11px] font-bold text-f1-text">{carCode}</span>
      </div>

      {/* Action badge */}
      <div
        className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold w-16 text-center"
        style={{
          background: actionColor + "22",
          color: actionColor,
          border: `1px solid ${actionColor}44`,
        }}
      >
        {actionLabel}
        {action && <span className="opacity-60 ml-0.5">{Math.round(actionConf * 100)}%</span>}
      </div>

      {/* Pit window bars */}
      <div className="flex-1 flex justify-center">
        <PitWindowBars pitProbs={car.pit_window_probs} currentLap={currentLap} />
      </div>

      {/* Win / podium probability */}
      <div className="shrink-0 text-right w-12">
        <div className="text-[9px] font-mono text-f1-text">{podiumPct}%</div>
        <div className="text-[8px] font-mono text-f1-muted">{winPct}% win</div>
      </div>
    </div>
  );
}

export function PitWindowVisualizer() {
  const prediction = usePredictionStore((s) => s.prediction);
  const raceState = useRaceStateStore((s) => s.state);

  const rows = useMemo(() => {
    if (!prediction || !raceState) return [];
    const carMap = new Map(
      raceState.cars.map((c) => [c.car_id, c])
    );
    return [...prediction.cars]
      .map((car) => {
        const live = carMap.get(car.car_id);
        return {
          car,
          carCode: live?.driver_code ?? car.car_id.slice(0, 3).toUpperCase(),
          carTeam: live?.team ?? null,
          carPos: live?.position ?? 99,
        };
      })
      .sort((a, b) => a.carPos - b.carPos);
  }, [prediction, raceState]);

  if (!prediction || !raceState) return null;
  const currentLap = raceState.leader_lap;

  return (
    <div>
      {/* Column header */}
      <div className="flex items-center gap-2 px-2 py-0.5 border-b border-f1-border">
        <div className="w-14 shrink-0" />
        <div className="shrink-0 w-16 text-[8px] text-f1-muted uppercase tracking-wider text-center">action</div>
        <div className="flex-1 text-[8px] text-f1-muted uppercase tracking-wider text-center">
          pit window L{currentLap}–{currentLap + 5}
        </div>
        <div className="shrink-0 w-12 text-[8px] text-f1-muted uppercase tracking-wider text-right">podium</div>
      </div>

      {/* Driver rows */}
      <div className="divide-y-0">
        {rows.map(({ car, carCode, carTeam, carPos }) => (
          <DriverRow
            key={car.car_id}
            car={car}
            carCode={carCode}
            carTeam={carTeam}
            carPos={carPos}
            currentLap={currentLap}
          />
        ))}
      </div>
    </div>
  );
}
