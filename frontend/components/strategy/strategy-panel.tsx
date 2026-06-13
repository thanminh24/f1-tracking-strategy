"use client";
// Full strategy sidebar: RL model card + SC gauge + pit window + what-if explorer + team radio.
import { useState } from "react";
import { useRaceStateStore } from "../../lib/race-state-store";
import { Panel } from "../ui/panel";
import { ModelCard } from "./model-card";
import { HeadToHeadCard } from "./head-to-head-card";
import { ScGauge } from "./sc-gauge";
import { PitWindowViz } from "./pit-window-viz";
import { WhatIfPanel } from "./what-if-panel";
import { TeamRadioTimeline } from "../widgets/team-radio-timeline";

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

      {/* Head-to-head comparison */}
      <HeadToHeadCard />

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

      {/* Team radio timeline */}
      <details className="border border-f1-border rounded overflow-hidden">
        <summary className="cursor-pointer px-3 py-2 bg-f1-surface hover:bg-f1-surface/80 text-sm font-semibold text-f1-text">
          📻 Team Radio
        </summary>
        <TeamRadioTimeline sessionKey={sessionKey} />
      </details>
    </div>
  );
}
