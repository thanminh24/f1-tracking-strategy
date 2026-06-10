"use client";
// Live position list: pos, driver, gap, interval, last lap, tire chip, pit count.
import { useRaceStateStore } from "../lib/race-state-store";
import { compoundColor, formatGap, formatLapTime, teamColor } from "../lib/team-colors";

const STATUS_BADGE: Record<string, string> = {
  pitting: "PIT",
  in_pit: "PIT",
  out: "OUT",
  finished: "FIN",
};

export function TimingTower() {
  const state = useRaceStateStore((s) => s.state);
  if (!state) return <div className="text-zinc-500 text-sm p-4">waiting for stream…</div>;

  return (
    <div className="text-sm font-mono">
      <div className="grid grid-cols-[2rem_3rem_1fr_4.5rem_4.5rem_5.5rem_2.5rem_2rem] gap-1 px-2 py-1 text-zinc-500 text-xs uppercase">
        <span>P</span><span>Drv</span><span /><span>Gap</span><span>Int</span>
        <span>Last</span><span>Tire</span><span>Pit</span>
      </div>
      {state.cars.map((car) => (
        <div
          key={car.car_id}
          className={`grid grid-cols-[2rem_3rem_1fr_4.5rem_4.5rem_5.5rem_2.5rem_2rem] gap-1 px-2 py-0.5 items-center border-l-2 ${
            car.status === "out" ? "opacity-40" : ""
          }`}
          style={{ borderLeftColor: teamColor(car.team) }}
        >
          <span className="text-zinc-300">{car.position}</span>
          <span className="font-bold" style={{ color: teamColor(car.team) }}>
            {car.driver_code ?? car.car_id}
          </span>
          <span className="text-xs text-amber-400">
            {STATUS_BADGE[car.status] ?? ""}
          </span>
          <span className="text-zinc-300">{formatGap(car.gap_leader_s)}</span>
          <span className="text-zinc-500">
            {car.interval_s != null ? `+${car.interval_s.toFixed(1)}` : "—"}
          </span>
          <span className="text-zinc-300">{formatLapTime(car.last_lap_ms)}</span>
          <span
            className="text-center rounded font-bold text-black text-xs px-1"
            style={{ background: compoundColor(car.tire?.compound) }}
            title={`age ${car.tire?.age_laps ?? "?"} laps`}
          >
            {car.tire?.compound?.[0] ?? "?"}
            {car.tire ? car.tire.age_laps : ""}
          </span>
          <span className="text-zinc-500">{car.pit_stops}</span>
        </div>
      ))}
    </div>
  );
}
