"use client";
import { useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { usePredictionStore } from "../lib/prediction-store";
import { teamColor } from "../lib/team-colors";
import { TimingRowExpanded } from "./race/timing-row-expanded";
import type { CarState } from "../lib/types";

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
}: {
  car: CarState;
  focusedCarId: string | null;
  expandedCarId: string | null;
  onRowClick: (carId: string) => void;
}) {
  const color = teamColor(car.team);
  const isOut = car.status === "out" || car.status === "finished";
  const prediction = usePredictionStore((s) => s.prediction);
  const carPred = prediction?.cars.find((c) => c.car_id === car.car_id);
  const isFocused = car.car_id === focusedCarId;
  const isExpanded = car.car_id === expandedCarId;

  return (
    <>
      <button
        onClick={() => onRowClick(car.car_id)}
        className={`flex items-center gap-2 px-3 py-1.5 border-b border-f1-border last:border-0 w-full text-left transition-colors ${
          isFocused ? "border-l-2 bg-f1-panel-hover" : "hover:bg-f1-panel-hover"
        } ${isOut ? "opacity-40" : ""}`}
        style={{ borderLeftColor: isFocused ? color : undefined }}
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

export function TimingTower() {
  const state = useRaceStateStore((s) => s.state);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const [expandedCarId, setExpandedCarId] = useState<string | null>(null);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-24 text-sm text-f1-muted">
        Waiting for data…
      </div>
    );
  }

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
      {sorted.map((car, i) => (
        <CarRow
          key={car.car_id}
          car={car}
          focusedCarId={focusedCarId}
          expandedCarId={expandedCarId}
          onRowClick={handleRowClick}
        />
      ))}
    </div>
  );
}
