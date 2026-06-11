"use client";
// Sortable outcome probabilities per car: P(win), P(podium), P(points), E[pos].
import { useMemo, useState } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { pct } from "../../lib/prediction-types";
import { useRaceStateStore } from "../../lib/race-state-store";

type SortKey = "win" | "podium" | "points" | "expected_position";

export function OutcomeProbabilityTable() {
  const prediction = usePredictionStore((s) => s.prediction);
  const cars = useRaceStateStore((s) => s.state?.cars);
  const [sortKey, setSortKey] = useState<SortKey>("expected_position");

  const rows = useMemo(() => {
    if (!prediction) return [];
    const codeOf = new Map(cars?.map((c) => [c.car_id, c.driver_code ?? c.car_id]) ?? []);
    const sorted = [...prediction.cars].sort((a, b) =>
      sortKey === "expected_position"
        ? a.outcome[sortKey] - b.outcome[sortKey]
        : b.outcome[sortKey] - a.outcome[sortKey],
    );
    return sorted.map((c) => ({ ...c, code: codeOf.get(c.car_id) ?? c.car_id }));
  }, [prediction, cars, sortKey]);

  if (!prediction) return null;
  const header = (key: SortKey, label: string) => (
    <th
      className={`px-2 cursor-pointer text-right ${sortKey === key ? "text-zinc-200" : ""}`}
      onClick={() => setSortKey(key)}
    >
      {label}
    </th>
  );

  return (
    <div title={`${prediction.meta.n_rollouts} rollouts · lap ${prediction.lap}`}>
      <table className="w-full text-xs text-zinc-400">
        <thead>
          <tr className="text-zinc-600 uppercase">
            <th className="text-left px-2">car</th>
            {header("win", "P(win)")}
            {header("podium", "P(podium)")}
            {header("points", "P(points)")}
            {header("expected_position", "E[pos]")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.car_id} className="border-t border-zinc-900">
              <td className="px-2 py-0.5 text-zinc-200">{r.code}</td>
              <td className="px-2 text-right">{pct(r.outcome.win)}</td>
              <td className="px-2 text-right">{pct(r.outcome.podium)}</td>
              <td className="px-2 text-right">{pct(r.outcome.points)}</td>
              <td className="px-2 text-right">{r.outcome.expected_position.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
