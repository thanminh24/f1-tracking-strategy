"use client";
// Strategy overlay: SC gauge + pit window visualizer + optional details/cards/what-if.
// Degrades gracefully when no predictions are available.
import { useState } from "react";
import { isStale, usePredictionStore } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { Panel } from "../layout/panel";
import { WhatIfPanel } from "../what-if-panel/what-if-panel";
import { DriverStrategyCards } from "./driver-strategy-cards";
import { OutcomeProbabilityTable } from "./outcome-probability-table";
import { PitWindowVisualizer } from "./pit-window-visualizer";
import { ScProbabilityGauge } from "./sc-probability-gauge";
import { UndercutAlertToasts } from "./undercut-alert-toasts";

export function StrategyPanel({ sessionKey }: { sessionKey: string }) {
  const prediction = usePredictionStore((s) => s.prediction);
  const currentLap = useRaceStateStore((s) => s.state?.leader_lap ?? 0);
  const [showTable, setShowTable] = useState(false);
  const [showCards, setShowCards] = useState(false);
  const [showWhatIf, setShowWhatIf] = useState(false);

  if (!prediction) {
    return (
      <Panel className="opacity-50">
        <p className="text-xs text-f1-muted text-center py-2">
          strategy predictions unavailable — viewer-only mode
        </p>
      </Panel>
    );
  }

  const stale = isStale(prediction, currentLap);
  const staleLabel = stale ? `stale (${currentLap - prediction.lap}L old)` : null;

  const tabBtn = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      className={[
        "px-2 py-0.5 rounded border text-[10px] transition-colors",
        active
          ? "border-f1-text/40 text-f1-text"
          : "border-f1-border text-f1-muted hover:text-f1-text",
      ].join(" ")}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <Panel
        title="Strategy"
        action={
          <div className="flex items-center gap-1.5">
            {staleLabel && (
              <span className="text-[9px] text-f1-amber font-mono">{staleLabel}</span>
            )}
            <span className="text-[9px] text-f1-muted font-mono">L{prediction.lap}</span>
            {tabBtn("table", showTable, () => setShowTable(!showTable))}
            {tabBtn("cards", showCards, () => setShowCards(!showCards))}
            {tabBtn("what-if", showWhatIf, () => setShowWhatIf(!showWhatIf))}
          </div>
        }
      >
        <div className="space-y-3">
          <ScProbabilityGauge />

          {/* Primary view: pit window visualizer with action recommendations */}
          <PitWindowVisualizer />

          {/* Optional: flat probability table (toggled) */}
          {showTable && <OutcomeProbabilityTable />}

          {showCards && <DriverStrategyCards />}
          {showWhatIf && <WhatIfPanel sessionKey={sessionKey} />}

          <p className="text-[9px] text-f1-muted font-mono">
            {prediction.meta.n_rollouts} rollouts ·{" "}
            {Object.entries(prediction.meta.model_versions)
              .map(([k, v]) => `${k}:${v}`)
              .join(" · ")}
          </p>
        </div>
      </Panel>
      <UndercutAlertToasts />
    </div>
  );
}
