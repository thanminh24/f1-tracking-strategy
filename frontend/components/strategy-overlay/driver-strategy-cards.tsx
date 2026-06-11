"use client";
// Compact per-driver strategy cards: recommended action chip + pit-window mini-dist.
// Copy rule: windows always phrased as "likely window: laps A-B (NN%)".
import { useMemo, useState } from "react";
import { usePredictionStore } from "../../lib/prediction-store";
import type { CarPrediction } from "../../lib/prediction-types";
import { pct } from "../../lib/prediction-types";
import { useRaceStateStore } from "../../lib/race-state-store";

const CHIP_COLOR: Record<string, string> = {
  STAY: "bg-zinc-800 text-zinc-300",
  PIT_SOFT: "bg-red-900/60 text-red-200",
  PIT_MEDIUM: "bg-yellow-900/60 text-yellow-200",
  PIT_HARD: "bg-zinc-200/20 text-zinc-100",
};

function likelyWindow(probs: Record<string, number>): string | null {
  const laps = Object.keys(probs).map(Number).sort((a, b) => a - b);
  if (!laps.length) return null;
  let mass = 0;
  const sorted = [...laps].sort((a, b) => (probs[String(b)] ?? 0) - (probs[String(a)] ?? 0));
  const picked: number[] = [];
  for (const lap of sorted) {
    picked.push(lap);
    mass += probs[String(lap)] ?? 0;
    if (mass >= 0.6) break;
  }
  return `likely window: laps ${Math.min(...picked)}-${Math.max(...picked)} (${pct(mass)})`;
}

function Card({ car, code }: { car: CarPrediction; code: string }) {
  const [open, setOpen] = useState(false);
  const action = car.recommended_action;
  const window_ = likelyWindow(car.pit_window_probs);
  return (
    <button
      onClick={() => setOpen(!open)}
      className="text-left border border-zinc-800 rounded p-2 hover:border-zinc-600"
      title={action ? `action probs: ${Object.entries(car.action_probs)
        .map(([a, p]) => `${a} ${pct(p)}`).join(" · ")}` : "no policy recommendation"}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold text-zinc-200">{code}</span>
        {action && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${CHIP_COLOR[action] ?? ""}`}>
            {action.replace("_", " ")} {pct(car.action_probs[action] ?? 0)}
          </span>
        )}
      </div>
      {window_ && <div className="text-[10px] text-zinc-500 mt-1">{window_}</div>}
      {open && (
        <div className="mt-1 space-y-0.5">
          {Object.entries(car.next_compound_probs).map(([c, p]) => (
            <div key={c} className="text-[10px] text-zinc-400">
              P(next = {c}) = {pct(p)}
            </div>
          ))}
          <div className="text-[10px] text-zinc-400">
            P(win) = {pct(car.outcome.win)} · P(podium) = {pct(car.outcome.podium)}
          </div>
        </div>
      )}
    </button>
  );
}

export function DriverStrategyCards() {
  const prediction = usePredictionStore((s) => s.prediction);
  const cars = useRaceStateStore((s) => s.state?.cars);
  const ordered = useMemo(() => {
    if (!prediction) return [];
    const posOf = new Map(cars?.map((c) => [c.car_id, c.position]) ?? []);
    const codeOf = new Map(cars?.map((c) => [c.car_id, c.driver_code ?? c.car_id]) ?? []);
    return [...prediction.cars]
      .sort((a, b) => (posOf.get(a.car_id) ?? 99) - (posOf.get(b.car_id) ?? 99))
      .map((c) => ({ car: c, code: codeOf.get(c.car_id) ?? c.car_id }));
  }, [prediction, cars]);

  if (!prediction) return null;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {ordered.map(({ car, code }) => (
        <Card key={car.car_id} car={car} code={code} />
      ))}
    </div>
  );
}
