"use client";
// Full strategy sidebar: RL model card + SC gauge + pit window + what-if explorer.
import { useState } from "react";
import { useRaceStateStore } from "../../lib/race-state-store";
import { Panel } from "../ui/panel";
import { ModelCard } from "./model-card";
import { ScGauge } from "./sc-gauge";
import { PitWindowViz } from "./pit-window-viz";
import { WhatIfPanel } from "./what-if-panel";

interface Props {
  sessionKey: string;
}

export function StrategyPanel({ sessionKey }: Props) {
  const state = useRaceStateStore((s) => s.state);
  const cars = state?.cars.filter((c) => c.status !== "out") ?? [];
  const [focusCar, setFocusCar] = useState<string | null>(null);
  const effectiveCar = focusCar ?? cars[0]?.car_id ?? null;

  return (
    <div className="flex flex-col gap-3 p-3 h-full overflow-y-auto scrollbar-thin">
      {/* Car focus selector */}
      {cars.length > 0 && (
        <select
          value={effectiveCar ?? ""}
          onChange={(e) => setFocusCar(e.target.value || null)}
          className="w-full bg-f1-surface border border-f1-border rounded px-2 py-1.5 text-sm text-f1-text font-data focus:outline-none focus:border-f1-red"
        >
          {cars.map((c) => (
            <option key={c.car_id} value={c.car_id}>
              P{c.position} · {c.driver_code ?? c.car_id}{c.team ? ` (${c.team})` : ""}
            </option>
          ))}
        </select>
      )}

      {/* RL recommendation card */}
      <ModelCard focusCarId={effectiveCar} />

      {/* Safety car probability */}
      <Panel title="Safety Car Risk">
        <ScGauge />
      </Panel>

      {/* Pit window */}
      <Panel title="Pit Window">
        <PitWindowViz carId={effectiveCar} />
      </Panel>

      {/* What-if explorer */}
      <Panel title="What-If">
        <WhatIfPanel sessionKey={sessionKey} />
      </Panel>
    </div>
  );
}
