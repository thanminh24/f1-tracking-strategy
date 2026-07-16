"use client";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { usePredictionStore } from "../lib/prediction-store";
import { useLiveTelemetryStore } from "../lib/live-telemetry-store";
import { isLiveTimingSource } from "../lib/session-source";
import { teamColor } from "../lib/team-colors";
import { formatLapMs, parseLapTimeMs } from "../lib/lap-time-parse";
import {
  formatIntervalGap,
  formatLeaderGap,
  loadGapMode,
  saveGapMode,
  type GapDisplayMode,
} from "../lib/timing-gap";
import { usePersistedPreference } from "../lib/use-persisted-preference";
import { topPitWindows } from "../lib/prediction-display";
import { TimingRowExpanded } from "./race/timing-row-expanded";
import { SectorChips } from "./race/sector-chips";
import { MiniSectorChips } from "./race/mini-sector-chips";
import { DrsBadge } from "./race/drs-badge";
import type { CarPrediction } from "../lib/prediction-types";
import type { CarState, LapRow, LiveTimingDriver, LiveTimingStatsDriver } from "../lib/types";

const TIRE_COLORS: Record<string, string> = {
  SOFT: "#E10600",
  MEDIUM: "#FFD700",
  HARD: "#EFEFEF",
  INTER: "#22C55E",
  WET: "#3B82F6",
};

function TireChip({ compound }: { compound: string }) {
  const color = TIRE_COLORS[compound.toUpperCase()] ?? "#707070";
  const abbr = compound.charAt(0).toUpperCase();
  return (
    <span
      className="chip w-5 h-5 text-[10px] font-bold shrink-0"
      style={{
        backgroundColor: color + "22",
        color,
        borderColor: color + "55",
        border: "1px solid",
      }}
    >
      {abbr}
    </span>
  );
}

function RLActionChip({ action }: { action: string | null }) {
  if (!action) return null;
  let bgColor = "bg-zinc-800";
  let textColor = "text-f1-text-dim";
  let borderColor = "border-f1-border/60";
  let label = action;
  if (action === "PIT_NOW") {
    bgColor = "bg-red-900/60";
    textColor = "text-f1-red";
    borderColor = "border-f1-red/40";
    label = "PIT";
  } else if (action === "PIT_SOFT" || action === "PIT_MEDIUM" || action === "PIT_HARD") {
    bgColor = "bg-amber-900/60";
    textColor = "text-amber-400";
    borderColor = "border-amber-400/40";
  }
  return (
    <span className={`chip text-[9px] px-1 h-5 shrink-0 border ${bgColor} ${textColor} ${borderColor}`}>
      {label}
    </span>
  );
}

function SpeedChip({ label, value }: { label: string; value: number | undefined }) {
  if (value == null) return null;
  return (
    <span className="flex items-center gap-0.5 text-[9px] text-f1-text-dim tabular-nums">
      <span className="text-[8px] text-f1-muted">{label}</span>
      <span className="font-data text-f1-text">{value}</span>
    </span>
  );
}

function PitWindowChip({ carPred }: { carPred?: CarPrediction | null }) {
  if (!carPred) return <span className="w-14" />;
  const top = topPitWindows(carPred, 1)[0];
  if (!top) return <span className="text-[10px] text-f1-muted w-14 text-right">—</span>;
  return (
    <span className="font-data text-[10px] text-amber-300 w-14 text-right shrink-0 tabular-nums">
      L{top.key}
    </span>
  );
}

function GapModeToggle({ mode, onChange }: { mode: GapDisplayMode; onChange: (m: GapDisplayMode) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded border border-f1-border/60 bg-f1-bg/30 p-0.5">
      {(["leader", "interval"] as const).map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
            mode === id ? "bg-f1-red/90 text-white" : "text-f1-muted hover:text-f1-text"
          }`}
        >
          {id === "leader" ? "Leader" : "Int"}
        </button>
      ))}
    </div>
  );
}

function CarRowInner({
  car,
  focusedCarId,
  expandedCarId,
  onRowClick,
  isFastest,
  laps,
  liveTiming,
  liveTimingStats,
  drsValue,
  inDangerZone,
  carPred,
  gapMode,
  showPitWindow,
}: {
  car: CarState;
  focusedCarId: string | null;
  expandedCarId: string | null;
  onRowClick: (carId: string) => void;
  isFastest: boolean;
  laps?: LapRow[];
  liveTiming?: LiveTimingDriver;
  liveTimingStats?: LiveTimingStatsDriver;
  drsValue?: number;
  inDangerZone?: boolean;
  carPred?: CarPrediction | null;
  gapMode: GapDisplayMode;
  showPitWindow: boolean;
}) {
  const color = teamColor(car.team);
  const isOut = car.status === "out";
  const isFinished = car.status === "finished";
  const isFocused = car.car_id === focusedCarId;
  const isExpanded = car.car_id === expandedCarId;
  const retLabel = isOut
    ? (liveTiming?.Retired ? "RET" : liveTiming?.KnockedOut ? "OUT" : "OUT")
    : null;

  const [flashClass, setFlashClass] = useState<"flash-green" | "flash-red" | "">("");
  const prevPositionRef = useRef(car.position);

  useEffect(() => {
    if (isOut || isFinished) return;
    if (prevPositionRef.current !== car.position) {
      const gained = car.position < prevPositionRef.current;
      setFlashClass(gained ? "flash-green" : "flash-red");
      const timeout = setTimeout(() => setFlashClass(""), 500);
      prevPositionRef.current = car.position;
      return () => clearTimeout(timeout);
    }
  }, [car.position, isOut, isFinished]);

  const gapDisplay =
    gapMode === "leader"
      ? formatLeaderGap(car.gap_leader_s, liveTiming?.GapToLeader)
      : formatIntervalGap(
          car.interval_s,
          liveTiming?.IntervalToPositionAhead?.Value,
          car.position,
        );

  const bestLapStr =
    liveTiming?.BestLapTime?.Value ??
    (isFastest && car.last_lap_ms != null ? formatLapMs(car.last_lap_ms) : null);

  const speeds = liveTimingStats?.BestSpeeds;

  return (
    <>
      <button
        onClick={() => {
          if (!isOut) onRowClick(car.car_id);
          else useRaceStateStore.getState().setFocusedCarId(car.car_id);
        }}
        className={`flex items-center gap-1.5 px-2 py-2 border-b border-f1-border last:border-0 w-full text-left transition-colors ${
          isFocused
            ? "border-l-2 bg-f1-panel-hover"
            : isFastest
            ? "border-l-2 hover:bg-f1-panel-hover"
            : "hover:bg-f1-panel-hover"
        } ${isOut ? "opacity-35" : isFinished ? "opacity-60" : liveTiming?.KnockedOut ? "opacity-50" : ""} ${
          inDangerZone && !liveTiming?.KnockedOut ? "bg-red-900/10" : ""
        } ${liveTiming?.Cutoff ? "ring-1 ring-inset ring-amber-400/50 animate-pulse" : ""} ${flashClass}`}
        style={{ borderLeftColor: isFocused ? color : isFastest ? "#A855F7" : undefined }}
      >
        <span className="font-data text-sm w-5 shrink-0 text-f1-text-dim text-right">
          {isOut ? "–" : car.position}
        </span>
        <span className="w-0.5 h-5 rounded-sm shrink-0" style={{ backgroundColor: isOut ? "#444" : color }} />
        <span className="font-data text-sm font-bold w-9 shrink-0 text-f1-text">
          {car.driver_code ?? car.car_id}
        </span>
        {car.tire && !isOut ? <TireChip compound={car.tire.compound} /> : <span className="w-5" />}
        <span className="font-data text-[11px] text-f1-text-dim w-3 shrink-0">
          {car.tire && !isOut ? car.tire.age_laps : ""}
        </span>
        {isOut ? (
          <span className="chip text-[9px] px-1 h-5 bg-zinc-800/80 text-zinc-400 border border-zinc-600/50 shrink-0">
            {retLabel}
          </span>
        ) : isFastest ? (
          <span className="chip text-[9px] px-1 h-5 bg-purple-900/60 text-purple-400 border border-purple-400/40 shrink-0">
            FL
          </span>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        {!isOut && (
          liveTiming?.Sectors
            ? <MiniSectorChips sectors={liveTiming.Sectors} />
            : laps && <SectorChips laps={laps} carId={car.car_id} />
        )}
        {!isOut && speeds && (
          <span className="hidden 2xl:flex items-center gap-1.5 shrink-0">
            <SpeedChip label="ST" value={speeds.St?.Value} />
          </span>
        )}
        {!isOut && drsValue != null && <DrsBadge drsValue={drsValue} inPit={liveTiming?.InPit} />}
        {!isOut && showPitWindow && <PitWindowChip carPred={carPred} />}
        {!isOut && <RLActionChip action={carPred?.recommended_action ?? null} />}
        <span className="font-data text-[11px] text-f1-text-dim flex-1 text-right tabular-nums min-w-[52px]">
          {isOut ? "RET" : gapDisplay}
        </span>
        <span
          className={`font-data text-[11px] w-[64px] text-right shrink-0 tabular-nums ${
            isFastest ? "text-purple-300" : "text-f1-text"
          }`}
        >
          {isOut ? "" : bestLapStr ?? formatLapMs(car.last_lap_ms)}
        </span>
        <span className="font-data text-[11px] text-f1-text-dim w-[64px] text-right shrink-0 tabular-nums hidden lg:block">
          {isOut ? "" : formatLapMs(car.last_lap_ms)}
        </span>
      </button>
      {isExpanded && !isOut && (
        <div className="border-b border-f1-border/40">
          <TimingRowExpanded prediction={carPred ?? null} />
        </div>
      )}
    </>
  );
}

const CarRow = memo(CarRowInner);

const DANGER_THRESHOLD: Record<number, number> = { 1: 16, 2: 11, 3: Infinity };

export function TimingTower({ laps }: { laps?: LapRow[] } = {}) {
  const state = useRaceStateStore((s) => s.state);
  const source = useRaceStateStore((s) => s.source);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const liveTiming = useRaceStateStore((s) => s.state?.live_timing);
  const liveTimingStats = useRaceStateStore((s) => s.state?.live_timing_stats);
  const telemetry = useLiveTelemetryStore((s) => s.data);
  const prediction = usePredictionStore((s) => s.prediction);
  const isLive = isLiveTimingSource(source);
  const sessionPart = useRaceStateStore((s) => s.state?.live_timing_session_part);
  const [expandedCarId, setExpandedCarId] = useState<string | null>(null);
  const [gapMode, handleGapModeChange] = usePersistedPreference(loadGapMode, saveGapMode);

  const fastestCarId = useMemo(() => {
    if (!state) return null;
    if (isLive && liveTiming) {
      let bestId: string | null = null;
      let bestMs = Infinity;
      for (const car of state.cars) {
        const ms = parseLapTimeMs(liveTiming[car.car_id]?.BestLapTime?.Value);
        if (ms != null && ms < bestMs) {
          bestMs = ms;
          bestId = car.car_id;
        }
      }
      if (bestId) return bestId;
    }
    if (laps && laps.length > 0) {
      const fastest = laps.reduce((best, l) => {
        if (l.lap_time_ms == null) return best;
        if (best == null || l.lap_time_ms < best.lap_time_ms!) return l;
        return best;
      }, null as LapRow | null);
      return fastest?.car_id ?? null;
    }
    return null;
  }, [isLive, laps, liveTiming, state]);

  const sorted = useMemo(() => {
    if (!state) return [];
    return [...state.cars].sort((a, b) => {
      const aOut = a.status === "out" || a.status === "finished";
      const bOut = b.status === "out" || b.status === "finished";
      if (aOut !== bOut) return aOut ? 1 : -1;
      return a.position - b.position;
    });
  }, [state]);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-f1-muted">
        Waiting for data…
      </div>
    );
  }

  const handleRowClick = (carId: string) => {
    setFocusedCarId(carId);
    setExpandedCarId((prev) => (prev === carId ? null : carId));
  };

  const showPitWindow = Boolean(prediction);

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-f1-border bg-[linear-gradient(180deg,rgba(225,6,0,0.12),rgba(15,15,15,0.96))] sticky top-0 z-10">
        <span className="text-[10px] text-f1-muted w-5 text-right">P</span>
        <span className="w-0.5 shrink-0" />
        <span className="text-[10px] text-f1-muted w-9">DRV</span>
        <span className="text-[10px] text-f1-muted w-5">TYR</span>
        <span className="text-[10px] text-f1-muted w-3">L</span>
        <span className="text-[10px] text-f1-muted w-6">ACT</span>
        {showPitWindow ? <span className="text-[10px] text-f1-muted w-14 text-right hidden sm:block">PIT</span> : null}
        <div className="flex-1 flex items-center justify-end gap-1 min-w-[72px]">
          <GapModeToggle mode={gapMode} onChange={handleGapModeChange} />
        </div>
        <span className="text-[10px] text-f1-muted w-[64px] text-right">BEST</span>
        <span className="text-[10px] text-f1-muted w-[64px] text-right hidden lg:block">LAST</span>
      </div>
      {sorted.map((car) => {
        const driverTelemetry = isLive ? telemetry[car.car_id] : undefined;
        const lastSample = driverTelemetry?.at(-1);
        const dangerThreshold = sessionPart != null ? DANGER_THRESHOLD[sessionPart] : undefined;
        const inDangerZone =
          isLive && dangerThreshold != null && car.position >= dangerThreshold && car.status !== "out";
        const isOut = car.status === "out" || car.status === "finished";
        const carPred = !isOut
          ? prediction?.cars.find((entry) => entry.car_id === car.car_id)
          : undefined;
        return (
          <CarRow
            key={car.car_id}
            car={car}
            focusedCarId={focusedCarId}
            expandedCarId={expandedCarId}
            onRowClick={handleRowClick}
            isFastest={car.car_id === fastestCarId}
            laps={laps}
            liveTiming={isLive ? liveTiming?.[car.car_id] : undefined}
            liveTimingStats={isLive ? liveTimingStats?.[car.car_id] : undefined}
            drsValue={isLive ? lastSample?.drs : undefined}
            inDangerZone={inDangerZone}
            carPred={carPred}
            gapMode={gapMode}
            showPitWindow={showPitWindow}
          />
        );
      })}
    </div>
  );
}
