"use client";
import { useState, useRef, useEffect } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { usePredictionStore } from "../lib/prediction-store";
import { useLiveTelemetryStore } from "../lib/live-telemetry-store";
import { teamColor } from "../lib/team-colors";
import { TimingRowExpanded } from "./race/timing-row-expanded";
import { SectorChips } from "./race/sector-chips";
import { MiniSectorChips } from "./race/mini-sector-chips";
import { DrsBadge } from "./race/drs-badge";
import type { CarState, LapRow, LiveTimingDriver } from "../lib/types";

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${rem}` : rem;
}

function fmtGap(s: number | null): string {
  if (s == null) return "—";
  if (s === 0) return "Leader";
  return `+${s.toFixed(3)}`;
}

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
  } else if (
    action === "PIT_SOFT" ||
    action === "PIT_MEDIUM" ||
    action === "PIT_HARD"
  ) {
    bgColor = "bg-amber-900/60";
    textColor = "text-amber-400";
    borderColor = "border-amber-400/40";
  }

  return (
    <span
      className={`chip text-[9px] px-1 h-5 shrink-0 border ${bgColor} ${textColor} ${borderColor}`}
    >
      {label}
    </span>
  );
}

function CarRow({
  car,
  focusedCarId,
  expandedCarId,
  onRowClick,
  isFastest,
  laps,
  liveTiming,
  drsValue,
  inDangerZone,
}: {
  car: CarState;
  focusedCarId: string | null;
  expandedCarId: string | null;
  onRowClick: (carId: string) => void;
  isFastest: boolean;
  laps?: LapRow[];
  liveTiming?: LiveTimingDriver;
  drsValue?: number;
  /** True when car is in the qualifying elimination zone */
  inDangerZone?: boolean;
}) {
  const color = teamColor(car.team);
  const isOut = car.status === "out" || car.status === "finished";
  const prediction = usePredictionStore((s) => s.prediction);
  const carPred = prediction?.cars.find((c) => c.car_id === car.car_id);
  const isFocused = car.car_id === focusedCarId;
  const isExpanded = car.car_id === expandedCarId;

  // Track position changes and flash on gain/loss
  const [flashClass, setFlashClass] = useState<"flash-green" | "flash-red" | "">(
    "",
  );
  const prevPositionRef = useRef(car.position);

  useEffect(() => {
    if (prevPositionRef.current !== car.position) {
      const gained = car.position < prevPositionRef.current;
      setFlashClass(gained ? "flash-green" : "flash-red");
      const timeout = setTimeout(() => setFlashClass(""), 500);
      prevPositionRef.current = car.position;
      return () => clearTimeout(timeout);
    }
  }, [car.position]);

  return (
    <>
      <button
        onClick={() => onRowClick(car.car_id)}
        className={`flex items-center gap-2 px-3 py-1.5 border-b border-f1-border last:border-0 w-full text-left transition-colors ${
          isFocused ? "border-l-2 bg-f1-panel-hover" : isFastest ? "border-l-2 hover:bg-f1-panel-hover" : "hover:bg-f1-panel-hover"
        } ${isOut ? "opacity-40" : liveTiming?.KnockedOut ? "opacity-50" : ""} ${
          inDangerZone && !liveTiming?.KnockedOut ? "bg-red-900/10" : ""
        } ${liveTiming?.Cutoff ? "ring-1 ring-inset ring-amber-400/50 animate-pulse" : ""} ${flashClass}`}
        style={{ borderLeftColor: isFocused ? color : isFastest ? "#A855F7" : undefined }}
      >
        {/* pos */}
        <span className="font-data text-sm w-5 shrink-0 text-f1-text-dim text-right">
          {car.position}
        </span>

        {/* team stripe */}
        <span
          className="w-1 h-5 rounded-sm shrink-0"
          style={{ backgroundColor: color }}
        />

        {/* driver */}
        <span className="font-data text-sm font-semibold w-9 shrink-0 text-f1-text">
          {car.driver_code ?? car.car_id}
        </span>

        {/* tire */}
        {car.tire ? (
          <TireChip compound={car.tire.compound} />
        ) : (
          <span className="w-5" />
        )}

        {/* tire age */}
        <span className="font-data text-xs text-f1-text-dim w-4 shrink-0">
          {car.tire ? car.tire.age_laps : ""}
        </span>

        {/* FL chip */}
        {isFastest && (
          <span className="chip text-[9px] px-1 h-5 bg-purple-900/60 text-purple-400 border border-purple-400/40 shrink-0">
            FL
          </span>
        )}

        {/* Mini-sector chips (live only) */}
        {liveTiming?.Sectors
          ? <MiniSectorChips sectors={liveTiming.Sectors} />
          : laps && <SectorChips laps={laps} carId={car.car_id} />
        }

        {/* DRS badge (live only) */}
        {drsValue != null && (
          <DrsBadge
            drsValue={drsValue}
            inPit={liveTiming?.InPit}
          />
        )}

        {/* RL action chip */}
        <RLActionChip action={carPred?.recommended_action ?? null} />

        {/* gap */}
        <span className="font-data text-xs text-f1-text-dim flex-1 text-right">
          {fmtGap(car.gap_leader_s)}
        </span>

        {/* last lap */}
        <span className="font-data text-xs text-f1-text-dim w-16 text-right shrink-0">
          {fmtMs(car.last_lap_ms)}
        </span>
      </button>

      {/* Expanded row */}
      {isExpanded && (
        <div className="border-b border-f1-border/40">
          <TimingRowExpanded prediction={carPred ?? null} />
        </div>
      )}
    </>
  );
}

/** Positions at/below which cars are in the elimination zone */
const DANGER_THRESHOLD: Record<number, number> = { 1: 16, 2: 11, 3: Infinity };

export function TimingTower({ laps }: { laps?: LapRow[] } = {}) {
  const state = useRaceStateStore((s) => s.state);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const liveTiming = useRaceStateStore((s) => s.state?.live_timing);
  const telemetry = useLiveTelemetryStore((s) => s.data);
  const isLive = useRaceStateStore((s) => s.source) === "live";
  const sessionPart = useRaceStateStore((s) => s.state?.live_timing_session_part);
  const [expandedCarId, setExpandedCarId] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-f1-muted">
        Waiting for data…
      </div>
    );
  }

  // Compute fastest car from laps
  const fastestCar =
    laps && laps.length > 0
      ? laps.reduce((best, l) => {
          if (l.lap_time_ms == null) return best;
          if (best == null || l.lap_time_ms < best.lap_time_ms!) return l;
          return best;
        }, null as LapRow | null)
      : null;
  const fastestCarId = fastestCar?.car_id ?? null;

  const sorted = [...state.cars].sort((a, b) => a.position - b.position);

  const handleRowClick = (carId: string) => {
    setFocusedCarId(carId);
    setExpandedCarId(expandedCarId === carId ? null : carId);
  };

  return (
    <div className="flex flex-col">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-1 border-b border-f1-border bg-f1-surface">
        <span className="text-[10px] text-f1-muted w-5 text-right">P</span>
        <span className="w-1 shrink-0" />
        <span className="text-[10px] text-f1-muted w-9">DRV</span>
        <span className="text-[10px] text-f1-muted w-5">TYR</span>
        <span className="text-[10px] text-f1-muted w-4">L</span>
        <span className="text-[10px] text-f1-muted w-6">ACT</span>
        <span className="text-[10px] text-f1-muted flex-1 text-right">GAP</span>
        <span className="text-[10px] text-f1-muted w-16 text-right">LAST LAP</span>
      </div>
      {sorted.map((car) => {
        const driverTelemetry = isLive ? telemetry[car.car_id] : undefined;
        const lastSample = driverTelemetry?.at(-1);
        const dangerThreshold = sessionPart != null ? DANGER_THRESHOLD[sessionPart] : undefined;
        const inDangerZone = isLive && dangerThreshold != null && car.position >= dangerThreshold;
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
            drsValue={isLive ? lastSample?.drs : undefined}
            inDangerZone={inDangerZone}
          />
        );
      })}
    </div>
  );
}
