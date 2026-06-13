"use client";
import { useMemo } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import type { LapRow, StintRow } from "../../lib/types";
import { StrategyOverview } from "./strategy-overview";
import { PaceComparison } from "./pace-comparison";
import { RlModelSummary } from "./rl-model-summary";
import { ScProbabilityHistory } from "./sc-probability-history";
import { ChampionshipPredictionPanel } from "./championship-prediction-panel";

interface Props {
  laps: LapRow[];
  stints: StintRow[];
}

export function StatsTab({ laps, stints }: Props) {
  const state = useRaceStateStore((s) => s.state);
  const prediction = usePredictionStore((s) => s.prediction);
  const championship = useRaceStateStore((s) => s.state?.championship);
  const scHistory = usePredictionStore((s) => s.scHistory);
  const timedLaps = useMemo(
    () => laps.filter((lap) => lap.lap_time_ms != null && lap.lap_time_ms > 0),
    [laps]
  );
  const fastestLap = useMemo(
    () =>
      timedLaps.length > 0
        ? timedLaps.reduce((best, lap) =>
            (lap.lap_time_ms ?? Infinity) < (best.lap_time_ms ?? Infinity) ? lap : best
          )
        : null,
    [timedLaps]
  );
  const compounds = useMemo(
    () => Array.from(new Set(stints.map((stint) => stint.compound))).filter(Boolean),
    [stints]
  );

  return (
    <div className="h-full overflow-y-auto scrollbar-thin bg-f1-bg">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 p-3 border-b border-f1-border bg-f1-surface/50">
        <StatTile label="Leader lap" value={state ? `L${state.leader_lap}` : "Waiting"} />
        <StatTile label="Cars tracked" value={state ? String(state.cars.length) : "0"} />
        <StatTile
          label="Fastest archive lap"
          value={fastestLap ? `${fastestLap.driver_code} L${fastestLap.lap_number}` : "No data"}
        />
        <StatTile label="Model lap" value={prediction ? `L${prediction.lap}` : "Offline"} />
      </div>

      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)] gap-3 p-3">
        <section className="border border-f1-border bg-f1-panel min-h-[320px]">
          <SectionTitle title="Pace Ranking" meta={`${timedLaps.length} timed laps`} />
          <PaceComparison laps={laps} />
        </section>

        <section className="border border-f1-border bg-f1-panel min-h-[320px]">
          <SectionTitle title="Tyre Plan" meta={compounds.join(" / ") || "No stint data"} />
          <StrategyOverview stints={stints} />
        </section>

        <section className="border border-f1-border bg-f1-panel min-h-[320px]">
          <SectionTitle title="Model Outlook" meta={prediction ? "Predictions active" : "No model data"} />
          <RlModelSummary />
        </section>

        <section className="border border-f1-border bg-f1-panel min-h-[320px]">
          <SectionTitle title="Safety-Car Risk" meta={`${scHistory.length} samples`} />
          <ScProbabilityHistory />
        </section>

        {/* Championship prediction — only visible during live races when data flows */}
        <section className="border border-f1-border bg-f1-panel col-span-full">
          <SectionTitle
            title="Championship Prediction"
            meta={championship ? "Live projection" : "Race session only"}
          />
          <ChampionshipPredictionPanel prediction={championship ?? undefined} />
        </section>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-f1-border bg-f1-panel px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted">{label}</div>
      <div className="mt-1 text-lg font-data font-semibold text-f1-text truncate">{value}</div>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-f1-border bg-f1-surface">
      <h2 className="text-sm font-semibold text-f1-text">{title}</h2>
      <span className="text-[10px] text-f1-muted font-data truncate">{meta}</span>
    </div>
  );
}
