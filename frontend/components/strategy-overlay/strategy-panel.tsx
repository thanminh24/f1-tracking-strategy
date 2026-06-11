"use client";
// Strategy overlay container: SC gauge + outcome table on by default, driver
// cards and what-if opt-in. Degrades to a quiet banner when no predictions flow
// (models disabled or artifacts absent) and flags stale predictions (>2 laps old).
import { useState } from "react";
import { isStale, usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { WhatIfPanel } from "../what-if-panel/what-if-panel";
import { DriverStrategyCards } from "./driver-strategy-cards";
import { OutcomeProbabilityTable } from "./outcome-probability-table";
import { ScProbabilityGauge } from "./sc-probability-gauge";
import { UndercutAlertToasts } from "./undercut-alert-toasts";

export function StrategyPanel({ sessionKey }: { sessionKey: string }) {
  const prediction = usePredictionStore((s) => s.prediction);
  const currentLap = useRaceStateStore((s) => s.state?.leader_lap ?? 0);
  const [showCards, setShowCards] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);

  if (!prediction) {
    return (
      <div className="border border-zinc-800 rounded-lg p-3 text-xs text-zinc-600">
        strategy predictions unavailable — viewer-only mode (models not trained for
        this session, or predictions disabled)
      </div>
    );
  }

  return (
    <div className="border border-zinc-800 rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase text-zinc-500">
          strategy · lap {prediction.lap}
          {isStale(prediction, currentLap) && (
            <span className="ml-2 text-amber-400 normal-case">
              stale ({currentLap - prediction.lap} laps old)
            </span>
          )}
        </div>
        <div className="flex gap-2 text-[10px]">
          <button onClick={() => setShowCards(!showCards)}
            className={`px-2 py-0.5 rounded border ${
              showCards ? "border-zinc-400 text-zinc-200" : "border-zinc-800 text-zinc-500"}`}>
            cards
          </button>
          <button onClick={() => setShowWhatIf(!showWhatIf)}
            className={`px-2 py-0.5 rounded border ${
              showWhatIf ? "border-zinc-400 text-zinc-200" : "border-zinc-800 text-zinc-500"}`}>
            what-if
          </button>
        </div>
      </div>
      <ScProbabilityGauge />
      <OutcomeProbabilityTable />
      {showCards && <DriverStrategyCards />}
      {showWhatIf && <WhatIfPanel sessionKey={sessionKey} />}
      <UndercutAlertToasts />
      <div className="text-[10px] text-zinc-700">
        {prediction.meta.n_rollouts} rollouts ·{" "}
        {Object.entries(prediction.meta.model_versions)
          .map(([k, v]) => `${k}:${v}`)
          .join(" · ")}
      </div>
    </div>
  );
}
