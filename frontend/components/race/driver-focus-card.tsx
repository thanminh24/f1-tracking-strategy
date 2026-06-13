"use client";
import type { ReactNode } from "react";
import { useRaceStateStore } from "../../lib/race-state-store";
import { usePredictionStore } from "../../lib/prediction-store";
import { teamColor } from "../../lib/team-colors";
import { GapChart } from "../gap-chart";
import type { LiveStint } from "../../lib/types";

const TIRE_COLORS: Record<string, string> = {
  SOFT: "#E10600",
  MEDIUM: "#FFD700",
  HARD: "#EFEFEF",
  INTER: "#22C55E",
  WET: "#3B82F6",
};

function tireColor(c: string) {
  return TIRE_COLORS[c.toUpperCase()] ?? "#707070";
}

function fmtLapMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${(s % 60).toFixed(3).padStart(6, "0")}` : (s % 60).toFixed(3).padStart(6, "0");
}

function fmtGap(s: number | null | undefined): string {
  if (s == null) return "—";
  if (s === 0) return "Leader";
  return `+${s.toFixed(3)}s`;
}

function TireChip({ compound, size = "md" }: { compound: string; size?: "sm" | "md" }) {
  const color = tireColor(compound);
  const abbr = compound.charAt(0).toUpperCase();
  const cls = size === "sm" ? "w-4 h-4 text-[9px]" : "w-5 h-5 text-[10px]";
  return (
    <span
      className={`chip ${cls} font-bold shrink-0`}
      style={{ backgroundColor: color + "22", color, borderColor: color + "55", border: "1px solid" }}
    >
      {abbr}
    </span>
  );
}

function Row({ label, value, mono = true }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-f1-muted text-xs shrink-0">{label}</span>
      <span className={`text-xs text-right ${mono ? "font-data text-f1-text" : "text-f1-text-dim"}`}>
        {value}
      </span>
    </div>
  );
}

function Section({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="px-3 py-2 border-b border-f1-border/40">
      {label && (
        <p className="text-[9px] text-f1-muted uppercase tracking-widest mb-1.5">{label}</p>
      )}
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}

function PredictionSection({ carId, sc1, sc5 }: { carId: string; sc1: number; sc5: number }) {
  const prediction = usePredictionStore((s) => s.prediction);
  const carPred = prediction?.cars.find((c) => c.car_id === carId);

  const pitLaps = carPred
    ? Object.entries(carPred.pit_window_probs)
        .filter(([, p]) => p > 0.2)
        .map(([lap]) => parseInt(lap, 10))
        .sort((a, b) => a - b)
    : [];

  const pitWindow =
    pitLaps.length === 0 ? "—"
    : pitLaps.length === 1 ? `L${pitLaps[0]}`
    : `L${pitLaps[0]}–${pitLaps[pitLaps.length - 1]}`;

  const nextCompounds = carPred
    ? Object.entries(carPred.next_compound_probs)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
        .map(([c, p]) => `${c[0]} ${Math.round(p * 100)}%`)
        .join("  ")
    : "—";

  if (!carPred) {
    return (
      <Section label="RL Strategy">
        <span className="text-xs text-f1-muted">No prediction data</span>
      </Section>
    );
  }

  const isNow = carPred.recommended_action === "PIT_NOW";
  const actionStyle = isNow
    ? { bg: "#b91c1c99", fg: "#ef4444", bd: "#dc262655" }
    : { bg: "#b45309cc", fg: "#fbbf24", bd: "#b4530955" };

  return (
    <Section label="RL Strategy">
      {carPred.recommended_action && (
        <div className="flex items-center justify-between">
          <span className="text-f1-muted text-xs">Action</span>
          <span
            className="chip text-[10px] px-2"
            style={{ backgroundColor: actionStyle.bg, color: actionStyle.fg, borderColor: actionStyle.bd, border: "1px solid" }}
          >
            {isNow ? "PIT NOW" : carPred.recommended_action === "STAY" ? "STAY" : carPred.recommended_action}
          </span>
        </div>
      )}
      <Row label="Window" value={pitWindow} />
      <Row label="Next tire" value={nextCompounds} />
      <Row label="SC (1L / 5L)" value={`${Math.round(sc1 * 100)}% / ${Math.round(sc5 * 100)}%`} />
    </Section>
  );
}

export function DriverFocusCard() {
  const state = useRaceStateStore((s) => s.state);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const isLive = useRaceStateStore((s) => s.source) === "live";
  const prediction = usePredictionStore((s) => s.prediction);

  if (!state) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-f1-muted">
        Waiting for data…
      </div>
    );
  }

  if (!focusedCarId) return <GapChart />;

  const car = state.cars.find((c) => c.car_id === focusedCarId);
  if (!car) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-f1-muted">
        Car not found
      </div>
    );
  }

  const color = teamColor(car.team);
  const liveDriver = state.driver_list?.[car.car_id];
  const liveTiming = state.live_timing?.[car.car_id];
  const liveApp = state.live_timing_app?.[car.car_id];
  const liveStats = state.live_timing_stats?.[car.car_id];
  const champ = state.championship?.Drivers?.[car.car_id];

  const stintHistory: Array<LiveStint & { idx: number }> = liveApp?.Stints
    ? Object.entries(liveApp.Stints)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([idx, s]) => ({ ...s, idx: parseInt(idx) }))
    : [];

  const sc1 = prediction?.sc_prob_1lap ?? 0;
  const sc5 = prediction?.sc_prob_5laps ?? 0;

  const isOut = car.status === "out" || car.status === "finished";
  const isPitting = car.status === "pitting" || car.status === "in_pit";

  return (
    <div className="flex flex-col bg-f1-panel/40 border border-f1-border overflow-y-auto scrollbar-thin h-full">

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="px-3 py-2.5 border-l-4 border-b border-f1-border" style={{ borderLeftColor: color }}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-data text-xl font-bold" style={{ color }}>
                {car.driver_code ?? car.car_id}
              </span>
              <span className="font-data text-sm text-f1-text-dim">#{car.car_id}</span>
              {isOut && (
                <span className="chip text-[9px] bg-zinc-800 text-f1-muted border border-f1-border">OUT</span>
              )}
              {isPitting && (
                <span className="chip text-[9px] bg-amber-900/60 text-amber-400 border border-amber-400/40">PIT</span>
              )}
            </div>
            {liveDriver?.FullName && (
              <p className="text-xs text-f1-text-dim truncate mt-0.5">{liveDriver.FullName}</p>
            )}
            {car.team && (
              <p className="text-[10px] text-f1-muted truncate">{car.team}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="font-data text-2xl font-bold text-f1-text">P{car.position}</div>
            {liveApp?.GridPos && (
              <div className="text-[10px] text-f1-muted">Grid {liveApp.GridPos}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => setFocusedCarId(null)}
          className="mt-1.5 text-[10px] text-f1-muted hover:text-f1-text transition-colors"
        >
          ← gap chart
        </button>
      </div>

      {/* ── Current Tire ───────────────────────────────────────── */}
      {car.tire && (
        <Section label="Current Tire">
          <div className="flex items-center gap-2">
            <TireChip compound={car.tire.compound} />
            <span className="font-data text-sm font-semibold" style={{ color: tireColor(car.tire.compound) }}>
              {car.tire.compound}
            </span>
            {car.tire.age_laps === 0 && (
              <span className="chip text-[9px] bg-green-900/40 text-green-400 border border-green-400/30">NEW</span>
            )}
            <span className="font-data text-xs text-f1-text-dim ml-auto">
              {car.tire.age_laps} laps · Stint {car.tire.stint}
            </span>
          </div>
        </Section>
      )}

      {/* ── Tire / Stint History ────────────────────────────────── */}
      {stintHistory.length > 0 && (
        <Section label="Stint History">
          <div className="flex flex-wrap gap-1.5">
            {stintHistory.map((s, i) => {
              const isCurrent = i === stintHistory.length - 1;
              const cmpd = s.Compound ?? "?";
              return (
                <div
                  key={s.idx}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-data ${
                    isCurrent
                      ? "border-f1-border-light bg-f1-panel"
                      : "border-f1-border/40 opacity-50"
                  }`}
                >
                  <TireChip compound={cmpd} size="sm" />
                  <span className="text-f1-text-dim">{s.TotalLaps ?? "?"}L</span>
                  {s.New === "true" && <span className="text-green-400/70 text-[8px]">N</span>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Timing ─────────────────────────────────────────────── */}
      <Section label="Timing">
        <Row label="Last lap" value={
          liveTiming?.LastLapTime?.Value ?? fmtLapMs(car.last_lap_ms)
        } />
        <Row label="Best lap" value={
          <span className={liveTiming?.BestLapTime?.Value ? "text-purple-400" : "text-f1-text"}>
            {liveTiming?.BestLapTime?.Value ?? fmtLapMs(car.best_lap_ms)}
          </span>
        } />
        <Row label="Gap to leader" value={
          liveTiming?.GapToLeader ?? fmtGap(car.gap_leader_s)
        } />
        <Row label="Interval ahead" value={
          liveTiming?.IntervalToPositionAhead?.Value ?? fmtGap(car.interval_s)
        } />
        <Row label="Lap" value={
          `${car.lap}${state.total_laps ? ` / ${state.total_laps}` : ""}`
        } />
        <Row label="Pit stops" value={String(car.pit_stops)} />
      </Section>

      {/* ── Championship (live only) ────────────────────────────── */}
      {isLive && champ && (
        <Section label="Championship">
          <div className="grid grid-cols-2 gap-3 text-center py-0.5">
            <div>
              <div className="text-[9px] text-f1-muted uppercase tracking-wide mb-0.5">Current</div>
              <div className="font-data text-xl font-bold text-f1-text">P{champ.CurrentPosition}</div>
              <div className="font-data text-xs text-f1-text-dim">{champ.CurrentPoints} pts</div>
            </div>
            <div>
              <div className="text-[9px] text-f1-muted uppercase tracking-wide mb-0.5">After Race</div>
              <div
                className={`font-data text-xl font-bold ${
                  champ.PredictedPosition < champ.CurrentPosition ? "text-green-400"
                  : champ.PredictedPosition > champ.CurrentPosition ? "text-red-400"
                  : "text-f1-text"
                }`}
              >
                P{champ.PredictedPosition}
              </div>
              <div className="font-data text-xs">
                <span className={champ.PredictedPoints > champ.CurrentPoints ? "text-green-400" : "text-f1-text-dim"}>
                  {champ.PredictedPoints} pts
                </span>
                {champ.PredictedPoints !== champ.CurrentPoints && (
                  <span className="text-f1-muted text-[9px] ml-1">
                    ({champ.PredictedPoints > champ.CurrentPoints ? "+" : ""}
                    {champ.PredictedPoints - champ.CurrentPoints})
                  </span>
                )}
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── Speed Traps (live only) ─────────────────────────────── */}
      {isLive && liveStats?.BestSpeeds && (
        <Section label="Speed Traps (km/h)">
          <div className="grid grid-cols-4 gap-1 text-center">
            {(["I1", "I2", "Fl", "St"] as const).map((trap) => {
              const entry = liveStats.BestSpeeds?.[trap];
              return (
                <div key={trap}>
                  <div className="text-[9px] text-f1-muted">{trap === "Fl" ? "FL" : trap}</div>
                  <div className="font-data text-xs text-f1-text">{entry?.Value ?? "—"}</div>
                  {entry?.Position != null && (
                    <div className="text-[9px] text-f1-muted">#{entry.Position}</div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── RL Predictions ──────────────────────────────────────── */}
      <PredictionSection carId={focusedCarId} sc1={sc1} sc5={sc5} />
    </div>
  );
}
