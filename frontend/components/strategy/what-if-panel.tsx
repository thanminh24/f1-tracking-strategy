"use client";
// What-if scenario explorer — lets user force a pit action and see delta outcome.
import { useState } from "react";
import { useRaceStateStore } from "../../lib/race-state-store";
import { usePredictionStore } from "../../lib/prediction-store";
import { runWhatIf } from "../../lib/whatif-client";
import { pct } from "../../lib/prediction-types";
import type { WhatIfResponse } from "../../lib/prediction-types";

const ACTIONS = ["STAY", "PIT_SOFT", "PIT_MEDIUM", "PIT_HARD"] as const;
const ACTION_LABELS: Record<string, string> = {
  STAY: "Stay Out",
  PIT_SOFT: "Pit → Soft",
  PIT_MEDIUM: "Pit → Med",
  PIT_HARD: "Pit → Hard",
};

function DeltaBadge({ delta }: { delta: number }) {
  const improved = delta < 0;
  return (
    <span
      className={`font-data text-sm font-bold ${improved ? "text-f1-green" : "text-f1-red"}`}
    >
      {improved ? "▲" : "▼"} {Math.abs(delta).toFixed(2)} pos
    </span>
  );
}

interface Props {
  sessionKey: string;
}

export function WhatIfPanel({ sessionKey }: Props) {
  const prediction = usePredictionStore((s) => s.prediction);
  const state = useRaceStateStore((s) => s.state);
  const [selectedCar, setSelectedCar] = useState<string>("");
  const [selectedAction, setSelectedAction] = useState<string>("PIT_SOFT");
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cars = state?.cars.filter((c) => c.status !== "out") ?? [];
  const effectiveCar = selectedCar || cars[0]?.car_id;

  async function handleRun() {
    if (!effectiveCar || !prediction) return;
    setLoading(true);
    setError(null);
    try {
      const r = await runWhatIf({
        session_key: sessionKey,
        lap: prediction.lap,
        car_id: effectiveCar,
        action: selectedAction,
      });
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-[10px] text-f1-muted uppercase tracking-widest">What-If Simulator</div>

      <div className="flex gap-2">
        {/* Car selector */}
        <select
          value={effectiveCar}
          onChange={(e) => setSelectedCar(e.target.value)}
          className="flex-1 min-w-0 bg-f1-surface border border-f1-border rounded px-2 py-1.5 text-sm text-f1-text font-data focus:outline-none focus:border-f1-red"
        >
          {cars.map((c) => (
            <option key={c.car_id} value={c.car_id}>
              P{c.position} {c.driver_code ?? c.car_id}
            </option>
          ))}
        </select>

        {/* Action selector */}
        <select
          value={selectedAction}
          onChange={(e) => setSelectedAction(e.target.value)}
          className="flex-1 min-w-0 bg-f1-surface border border-f1-border rounded px-2 py-1.5 text-sm text-f1-text font-data focus:outline-none focus:border-f1-red"
        >
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {ACTION_LABELS[a]}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={handleRun}
        disabled={loading || !prediction}
        className="px-4 py-2 rounded bg-f1-red text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 transition-colors"
      >
        {loading ? "Simulating…" : "Run Scenario"}
      </button>

      {error && <div className="text-xs text-f1-red">{error}</div>}

      {result && (
        <div className="rounded-lg border border-f1-border bg-f1-surface p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-f1-text-dim">
              {ACTION_LABELS[result.action] ?? result.action}
            </span>
            <DeltaBadge delta={result.delta_expected_position} />
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-f1-muted mb-0.5">Baseline</div>
              <div className="font-data text-f1-text">
                P{result.baseline.expected_position.toFixed(1)} · {pct(result.baseline.podium)} pod
              </div>
            </div>
            <div>
              <div className="text-f1-muted mb-0.5">Forced</div>
              <div className="font-data text-f1-text">
                P{result.forced.expected_position.toFixed(1)} · {pct(result.forced.podium)} pod
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
