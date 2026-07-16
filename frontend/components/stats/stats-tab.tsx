"use client";

import { useMemo } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import type { LapRow, StintRow } from "../../lib/types";
import type { SessionDataSource } from "../../lib/session-source";
import { hasLiveComms } from "../../lib/session-source";
import { formatLapMs, parseLapTimeMs } from "../../lib/lap-time-parse";
import { StrategyOverview } from "./strategy-overview";
import { PaceComparison } from "./pace-comparison";
import { RlModelSummary } from "./rl-model-summary";
import { ScProbabilityHistory } from "./sc-probability-history";
import { ChampionshipPredictionPanel } from "./championship-prediction-panel";
import { LiveFastestLapsBoard, LivePitWindowsBoard } from "./live-timing-boards";

interface Props {
  laps: LapRow[];
  stints: StintRow[];
  dataSource: SessionDataSource;
  sessionKey: string;
}

export function StatsTab({ laps, stints, dataSource, sessionKey }: Props) {
  const state = useRaceStateStore((s) => s.state);
  const prediction = usePredictionStore((s) => s.prediction);
  const championship = useRaceStateStore((s) => s.state?.championship);
  const liveTiming = useRaceStateStore((s) => s.state?.live_timing);
  const scHistory = usePredictionStore((s) => s.scHistory);
  const showComms = hasLiveComms(dataSource);
  const isLiveView = showComms;

  const timedLaps = useMemo(
    () => laps.filter((lap) => lap.lap_time_ms != null && lap.lap_time_ms > 0),
    [laps],
  );
  const archiveFastestLap = useMemo(() => {
    let best: LapRow | null = null;
    for (const lap of timedLaps) {
      if (lap.lap_time_ms == null) continue;
      if (best == null || lap.lap_time_ms < (best.lap_time_ms ?? Infinity)) best = lap;
    }
    return best;
  }, [timedLaps]);

  const liveFastest = useMemo(() => {
    if (!state?.cars || !liveTiming) return null;
    let best: { code: string; ms: number; lapStr: string } | null = null;
    for (const car of state.cars) {
      const ms = parseLapTimeMs(liveTiming[car.car_id]?.BestLapTime?.Value);
      if (ms == null) continue;
      if (!best || ms < best.ms) {
        best = {
          code: car.driver_code ?? car.car_id,
          ms,
          lapStr: liveTiming[car.car_id]?.BestLapTime?.Value ?? formatLapMs(ms),
        };
      }
    }
    return best;
  }, [liveTiming, state]);

  const compounds = useMemo(
    () => Array.from(new Set(stints.map((stint) => stint.compound))).filter(Boolean),
    [stints],
  );

  const sessionLabel =
    sessionKey === "live"
      ? "Live session"
      : sessionKey === "fixture"
        ? "Dev fixture"
        : sessionKey.replace(/_/g, " ").toUpperCase();

  const fastestLabel = isLiveView
    ? liveFastest
      ? `${liveFastest.code} · ${liveFastest.lapStr}`
      : "Waiting…"
    : archiveFastestLap
      ? `${archiveFastestLap.driver_code} · L${archiveFastestLap.lap_number}`
      : "No data";

  const fastestHint = isLiveView
    ? liveFastest ? "Session best (live timing)" : "—"
    : archiveFastestLap?.lap_time_ms ? formatLapMs(archiveFastestLap.lap_time_ms) : "—";

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-f1-bg">
      <section className="border-b border-f1-border bg-[linear-gradient(180deg,rgba(225,6,0,0.14),rgba(15,15,15,0.96))] px-4 py-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-f1-red">
          {isLiveView ? "Live analytics" : "Session analytics"}
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-[0.12em] uppercase text-f1-text">{sessionLabel}</h2>
        <p className="mt-1 text-xs text-f1-text-dim">
          {isLiveView
            ? "Fastest laps, expected pit windows, model risk — tuned for live timing."
            : "Archive pace, stint, and model outlook from ingested session data."}
        </p>
      </section>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 p-3">
        <StatTile label="Leader lap" value={state ? `Lap ${state.leader_lap}` : "Waiting"} hint={state?.track_status?.toUpperCase() ?? "—"} />
        <StatTile label="On track" value={String(state?.cars.filter((c) => c.status !== "out").length ?? "—")} hint={`${state?.total_laps ?? "—"} total laps`} />
        <StatTile label="Fastest lap" value={fastestLabel} hint={fastestHint} />
        <StatTile
          label="Model"
          value={prediction ? `Lap ${prediction.lap}` : "Offline"}
          hint={prediction ? `${prediction.meta.n_rollouts} rollouts` : "Predictions idle"}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 p-3 pt-0 2xl:grid-cols-2">
        {isLiveView ? (
          <>
            <StatsPanel title="Fastest Laps" meta="Live personal bests" accent="rgba(225,6,0,0.18)">
              <LiveFastestLapsBoard />
            </StatsPanel>
            <StatsPanel title="Expected Pit Windows" meta="RL model · top lap per driver" accent="rgba(245,158,11,0.16)">
              <LivePitWindowsBoard />
            </StatsPanel>
          </>
        ) : (
          <>
            <StatsPanel title="Pace Ranking" meta={`Top 10 · ${timedLaps.length} laps`} accent="rgba(225,6,0,0.18)">
              <PaceComparison laps={laps} />
            </StatsPanel>
            <StatsPanel title="Tyre Strategy" meta={compounds.join(" / ") || "No stint data"} accent="rgba(255,255,255,0.1)">
              <StrategyOverview stints={stints} />
            </StatsPanel>
          </>
        )}

        <StatsPanel title="Model Outlook" meta={prediction ? "RL strategy layer active" : "Waiting for predictions"} accent="rgba(34,197,94,0.14)">
          <RlModelSummary />
        </StatsPanel>

        <StatsPanel title="Safety Car Risk" meta={`${scHistory.length} samples`} accent="rgba(245,158,11,0.14)">
          <ScProbabilityHistory />
        </StatsPanel>
      </div>

      {showComms && championship ? (
        <div className="px-3 pb-4">
          <StatsPanel title="Championship Prediction" meta="Live projection" accent="rgba(59,130,246,0.16)" fullWidth>
            <ChampionshipPredictionPanel prediction={championship} />
          </StatsPanel>
        </div>
      ) : null}
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[14px] border border-f1-border bg-f1-panel/90 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="text-[10px] uppercase tracking-[0.24em] text-f1-muted">{label}</div>
      <div className="mt-1 text-lg font-data font-semibold text-f1-text truncate">{value}</div>
      <div className="mt-1 text-[11px] text-f1-text-dim truncate">{hint}</div>
    </div>
  );
}

function StatsPanel({
  title,
  meta,
  accent,
  children,
  fullWidth = false,
}: {
  title: string;
  meta: string;
  accent: string;
  children: React.ReactNode;
  fullWidth?: boolean;
}) {
  return (
    <section
      className={`broadcast-panel min-h-[22rem] flex flex-col overflow-hidden rounded-[14px] border border-f1-border bg-f1-surface/85 ${fullWidth ? "col-span-full" : ""}`}
      style={{ boxShadow: `inset 0 1px 0 ${accent}` }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-f1-border/70 px-4 py-3 shrink-0">
        <h3 className="text-sm font-semibold tracking-[0.08em] uppercase text-f1-text">{title}</h3>
        <span className="text-[10px] text-f1-muted font-data truncate">{meta}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scrollbar-thin">{children}</div>
    </section>
  );
}
