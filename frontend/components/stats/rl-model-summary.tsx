"use client";
import { useMemo } from "react";
import { usePredictionStore, isStale } from "../../lib/prediction-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { teamColor } from "../../lib/team-colors";
import { pct } from "../../lib/prediction-types";
import {
  COMPOUND_COLORS,
  actionColor,
  actionLabel,
  modelVersionSummary,
  topCompoundChoices,
  topPitWindows,
  topProbabilityEntries,
} from "../../lib/prediction-display";

export function RlModelSummary() {
  const prediction = usePredictionStore((s) => s.prediction);
  const state = useRaceStateStore((s) => s.state);

  const isStaleData = prediction && state ? isStale(prediction, state.leader_lap) : false;

  // Sort cars by current race position
  const sortedCars = useMemo(() => {
    if (!prediction || !state) return [];

    const withPos = prediction.cars.map((car) => {
      const carState = state.cars.find((c) => c.car_id === car.car_id);
      return { car, pos: carState?.position ?? 999, driverCode: carState?.driver_code };
    });

    return withPos.sort((a, b) => a.pos - b.pos);
  }, [prediction, state]);

  if (!prediction || !state) {
    return (
      <div className="p-4 text-f1-text-dim">
        No RL predictions available - model not running
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {isStaleData && (
        <div className="mb-4 p-2 bg-yellow-900/30 border border-yellow-700/50 rounded text-xs text-yellow-400">
          Data is stale (gap: {Math.abs(state.leader_lap - prediction.lap)} laps)
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <ModelMetric label="Lap" value={String(prediction.lap)} />
        <ModelMetric label="Rollouts" value={prediction.meta.n_rollouts.toLocaleString()} />
        <ModelMetric label="Compute" value={`${prediction.meta.compute_ms}ms`} />
        <ModelMetric label="SC next lap" value={pct(prediction.sc_prob_1lap)} />
        <ModelMetric label="SC 5 laps" value={pct(prediction.sc_prob_5laps)} />
      </div>

      <div className="rounded border border-f1-border/60 bg-f1-surface/30 p-3">
        <div className="text-[10px] uppercase tracking-widest text-f1-muted mb-1">
          Model Versions
        </div>
        <div className="font-data text-xs text-f1-text-dim break-words">
          {modelVersionSummary(prediction) || "none"}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sortedCars.map(({ car, pos, driverCode }) => {
          const carState = state.cars.find((c) => c.car_id === car.car_id);
          const team = carState?.team ?? "Unknown";
          const color = teamColor(team);
          const recAction = car.recommended_action || "STAY";
          const actionEntries = topProbabilityEntries(car.action_probs, 4);
          const pitWindows = topPitWindows(car, 4);
          const compounds = topCompoundChoices(car, 3);
          const rsrl = car.model_recommendations?.rsrl;

          return (
            <div
              key={car.car_id}
              className="border border-f1-border rounded-lg overflow-hidden hover:bg-f1-panel/30 transition-colors"
            >
              {/* Header bar with team color */}
              <div
                className="px-3 py-2 text-white font-semibold text-sm"
                style={{ backgroundColor: color }}
              >
                <div className="flex items-baseline justify-between">
                  <span>{driverCode}</span>
                  <span className="text-xs font-data opacity-80">P{pos}</span>
                </div>
                <div className="text-xs font-data opacity-75">{team}</div>
              </div>

              {/* Content */}
              <div className="p-3 space-y-2 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-f1-text-dim">Action</span>
                    <span
                      className="px-1.5 py-0.5 rounded font-semibold text-black"
                      style={{ backgroundColor: actionColor(recAction) }}
                    >
                      {actionLabel(recAction)}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {actionEntries.map(({ key, probability }) => (
                      <ProbabilityBar
                        key={key}
                        label={actionLabel(key)}
                        probability={probability}
                        color={actionColor(key)}
                      />
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-f1-border/30">
                  <PredictionList
                    title="Pit Window"
                    empty="No strong window"
                    entries={pitWindows.map(({ key, probability }) => ({
                      key,
                      label: `Lap ${key}`,
                      probability,
                      color: "#E10600",
                    }))}
                  />
                  <PredictionList
                    title="Next Tyre"
                    empty="No tyre signal"
                    entries={compounds.map(({ key, probability }) => ({
                      key,
                      label: key,
                      probability,
                      color: COMPOUND_COLORS[key] ?? "#94A3B8",
                    }))}
                  />
                </div>

                {rsrl && (
                  <div className="rounded border border-f1-border/40 bg-f1-surface/30 p-2">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-f1-muted">
                        RSRL Shadow
                      </span>
                      <span className="font-data text-[10px] text-f1-text-dim">
                        {rsrl.inference_ms.toFixed(2)}ms
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-f1-text-dim">{rsrl.version}</span>
                      <span
                        className="rounded px-1.5 py-0.5 font-semibold text-black"
                        style={{ backgroundColor: actionColor(rsrl.recommended_action) }}
                      >
                        {actionLabel(rsrl.recommended_action)}
                      </span>
                    </div>
                    {rsrl.top_factors.length > 0 && (
                      <div className="mt-2 pt-1 border-t border-f1-border/30 space-y-1">
                        <div className="text-[9px] uppercase tracking-widest text-f1-muted">
                          Top drivers
                        </div>
                        {rsrl.top_factors.slice(0, 3).map((f) => (
                          <div key={f.group} className="flex items-center gap-1.5">
                            <span className="text-[10px] text-f1-text-dim truncate flex-1">
                              {f.group.replace(/_/g, " ")}
                            </span>
                            <span className={`text-[10px] font-data ${f.probability_delta >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {f.probability_delta >= 0 ? "+" : ""}{(f.probability_delta * 100).toFixed(1)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="space-y-1 pt-1 border-t border-f1-border/30">
                  <div className="flex justify-between">
                    <span className="text-f1-text-dim">Expected Pos</span>
                    <span className="text-f1-text font-semibold">
                      {car.outcome.expected_position.toFixed(1)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-f1-text-dim">Win</span>
                    <span className="text-f1-text font-semibold">{pct(car.outcome.win)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-f1-text-dim">Podium</span>
                    <span className="text-f1-text font-semibold">{pct(car.outcome.podium)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-f1-text-dim">Points</span>
                    <span className="text-f1-text font-semibold">{pct(car.outcome.points)}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ModelMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-f1-border/60 bg-f1-surface/30 p-3">
      <div className="text-[10px] uppercase tracking-widest text-f1-muted">{label}</div>
      <div className="font-data text-lg text-f1-text">{value}</div>
    </div>
  );
}

function ProbabilityBar({
  label,
  probability,
  color,
}: {
  label: string;
  probability: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 truncate text-f1-text-dim">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-f1-surface">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(0, Math.min(1, probability)) * 100}%`, backgroundColor: color }}
        />
      </div>
      <span className="w-9 text-right font-data text-f1-text-dim">{pct(probability)}</span>
    </div>
  );
}

function PredictionList({
  title,
  empty,
  entries,
}: {
  title: string;
  empty: string;
  entries: { key: string; label: string; probability: number; color: string }[];
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-f1-muted">{title}</div>
      {entries.length === 0 ? (
        <div className="text-[11px] text-f1-text-dim">{empty}</div>
      ) : (
        <div className="space-y-1">
          {entries.map((entry) => (
            <div key={entry.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 truncate text-f1-text-dim">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                {entry.label}
              </span>
              <span className="font-data text-f1-text">{pct(entry.probability)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
