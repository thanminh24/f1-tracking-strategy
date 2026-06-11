"use client";
// Undercut-threat toasts: rival within undercut range AND likely to pit next laps.
// Cooldown per car pair prevents alert spam; dismissible; copy stays probabilistic.
import { useEffect, useRef, useState } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import { pct } from "../../lib/prediction-types";
import { useRaceStateStore } from "../../lib/race-state-store";

const UNDERCUT_RANGE_S = 3.5; // close enough behind for an undercut to work
const PIT_PROB_THRESHOLD = 0.35; // P(rival pits within 2 laps) that triggers an alert
const COOLDOWN_LAPS = 5;

interface Alert {
  id: string;
  text: string;
}

export function UndercutAlertToasts() {
  const prediction = usePredictionStore((s) => s.prediction);
  const cars = useRaceStateStore((s) => s.state?.cars);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const lastFired = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!prediction || !cars) return;
    const byId = new Map(prediction.cars.map((c) => [c.car_id, c]));
    const running = [...cars]
      .filter((c) => c.status === "running" || c.status === "pitting")
      .sort((a, b) => a.position - b.position);
    const fresh: Alert[] = [];
    for (let i = 1; i < running.length; i++) {
      const ahead = running[i - 1], behind = running[i];
      if ((behind.interval_s ?? 99) > UNDERCUT_RANGE_S) continue;
      const pred = byId.get(behind.car_id);
      if (!pred) continue;
      const pPit2 = [1, 2].reduce(
        (acc, k) => acc + (pred.pit_window_probs[String(prediction.lap + k)] ?? 0), 0);
      if (pPit2 < PIT_PROB_THRESHOLD) continue;
      const pairKey = `${behind.car_id}>${ahead.car_id}`;
      const last = lastFired.current.get(pairKey) ?? -99;
      if (prediction.lap - last < COOLDOWN_LAPS) continue;
      lastFired.current.set(pairKey, prediction.lap);
      fresh.push({
        id: `${pairKey}@${prediction.lap}`,
        text: `undercut threat: ${behind.driver_code ?? behind.car_id} ` +
          `(${(behind.interval_s ?? 0).toFixed(1)}s behind ${ahead.driver_code ?? ahead.car_id}) ` +
          `— P(pits within 2 laps) = ${pct(Math.min(pPit2, 1))}`,
      });
    }
    if (fresh.length) setAlerts((a) => [...a, ...fresh].slice(-4));
  }, [prediction, cars]);

  if (!alerts.length) return null;
  return (
    <div className="fixed bottom-4 right-4 space-y-2 z-50">
      {alerts.map((a) => (
        <div
          key={a.id}
          className="bg-zinc-900 border border-yellow-700/60 text-yellow-100 text-xs
                     rounded px-3 py-2 flex items-center gap-3 shadow-lg"
        >
          <span>{a.text}</span>
          <button
            className="text-zinc-500 hover:text-zinc-200"
            onClick={() => setAlerts((cur) => cur.filter((x) => x.id !== a.id))}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
