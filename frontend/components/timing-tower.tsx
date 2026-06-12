"use client";
// Timing tower: live position list with team colors, tire badges, gap/interval/lap times.
import { useRaceStateStore } from "../lib/race-state-store";
import { compoundColor, formatGap, formatLapTime, teamColor } from "../lib/team-colors";
import type { CarState } from "../lib/types";

// P | DRV | STATUS | GAP | INT | LAST | TIRE | PIT
const COLS = "grid-cols-[1.6rem_3rem_2rem_4.5rem_4rem_5rem_3rem_1.6rem]";

function TireBadge({ car }: { car: CarState }) {
  const c = car.tire?.compound ?? null;
  const age = car.tire?.age_laps ?? 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1 rounded text-[10px] font-bold leading-[14px]"
      style={{ background: compoundColor(c), color: "#000" }}
      title={`${c ?? "?"} · ${age} laps old`}
    >
      {c?.[0] ?? "?"}
      <span className="text-[8px] opacity-60">{age}</span>
    </span>
  );
}

export function TimingTower() {
  const state = useRaceStateStore((s) => s.state);

  if (!state) {
    return (
      <div className="text-f1-muted text-xs p-6 text-center">
        waiting for stream…
      </div>
    );
  }

  const fastestMs = Math.min(
    ...state.cars.map((c) => c.best_lap_ms ?? Infinity).filter(isFinite),
  );

  return (
    <div className="text-xs font-mono select-none">
      {/* Header */}
      <div className={`grid ${COLS} gap-x-1.5 px-2 py-1.5 text-[9px] text-f1-muted uppercase tracking-widest border-b border-f1-border sticky top-0 bg-f1-panel z-10`}>
        <span>P</span>
        <span>Drv</span>
        <span />
        <span>Gap</span>
        <span>Int</span>
        <span>Last</span>
        <span>Tire</span>
        <span className="text-center">Pit</span>
      </div>

      {state.cars.map((car, idx) => {
        const isFastest = car.best_lap_ms != null && car.best_lap_ms === fastestMs;
        const isOut = car.status === "out" || car.status === "finished";
        const isPitting = car.status === "pitting" || car.status === "in_pit";
        const isLeader = car.position === 1;
        const borderColor = isFastest ? "#BF00FF" : teamColor(car.team);
        const rowBg = isPitting
          ? "bg-amber-950/20"
          : idx % 2 === 0
          ? "bg-transparent"
          : "bg-white/[0.015]";

        return (
          <div
            key={car.car_id}
            className={[
              `grid ${COLS} gap-x-1.5 px-2 py-[5px] items-center`,
              "border-l-[3px] border-b border-f1-border/20",
              "hover:bg-f1-panel-hover transition-colors duration-100",
              rowBg,
              isOut ? "opacity-30" : "",
            ].join(" ")}
            style={{ borderLeftColor: borderColor }}
          >
            {/* Position */}
            <span className={`tabular-nums font-bold ${isLeader ? "text-f1-red" : "text-f1-text"}`}>
              {car.position}
            </span>

            {/* Driver code */}
            <span className="font-bold truncate" style={{ color: teamColor(car.team) }}>
              {car.driver_code ?? car.car_id}
            </span>

            {/* Status badge */}
            <span className="flex items-center">
              {isPitting && (
                <span className="text-[8px] font-black text-amber-400 bg-amber-900/30 px-0.5 py-px rounded leading-none">
                  PIT
                </span>
              )}
              {car.status === "out" && (
                <span className="text-[8px] font-black text-f1-muted">OUT</span>
              )}
            </span>

            {/* Gap to leader */}
            <span className={[
              "tabular-nums",
              car.gap_leader_s != null && car.gap_leader_s > 0 && car.gap_leader_s < 1.0
                ? "text-amber-400"
                : isLeader ? "text-f1-muted text-[10px]" : "text-f1-text",
            ].join(" ")}>
              {isLeader ? "LEAD" : formatGap(car.gap_leader_s)}
            </span>

            {/* Interval */}
            <span className="text-f1-muted tabular-nums">
              {car.interval_s != null ? `+${car.interval_s.toFixed(1)}` : "—"}
            </span>

            {/* Last lap */}
            <span
              className="tabular-nums"
              style={{ color: isFastest ? "#BF00FF" : undefined }}
            >
              {formatLapTime(car.last_lap_ms)}
            </span>

            {/* Tire */}
            <TireBadge car={car} />

            {/* Pit count */}
            <span className="tabular-nums text-f1-muted text-center">
              {car.pit_stops > 0 ? car.pit_stops : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
