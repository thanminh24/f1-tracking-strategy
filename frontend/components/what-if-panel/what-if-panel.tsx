"use client";
// What-if explorer: pick car + action → forced-rollout outcome vs baseline.
// Two scenarios can be pinned side by side; copy is distribution-only by design.
import { FormEvent, useState } from "react";
import { pct, WhatIfResponse } from "../../lib/prediction-types";
import { useRaceStateStore } from "../../lib/race-state-store";
import { runWhatIf } from "../../lib/whatif-client";

const ACTIONS = [
  { value: "PIT_SOFT", label: "pit now → SOFT" },
  { value: "PIT_MEDIUM", label: "pit now → MEDIUM" },
  { value: "PIT_HARD", label: "pit now → HARD" },
  { value: "STAY_N", label: "stay out 5 more laps" },
];

function ResultCard({ r, onPin }: { r: WhatIfResponse; onPin?: () => void }) {
  const gain = -r.delta_expected_position;
  return (
    <div className="border border-f1-border rounded p-2 text-xs space-y-1 font-mono"
         title={`${r.meta.n_rollouts} rollouts · ${r.meta.compute_ms.toFixed(0)}ms`}>
      <div className="flex justify-between text-f1-text">
        <span>car {r.car_id} · lap {r.lap} · {r.action}</span>
        {onPin && <button onClick={onPin} className="text-f1-muted hover:text-f1-text transition-colors">pin</button>}
      </div>
      <div className={gain > 0 ? "text-f1-green" : gain < 0 ? "text-f1-red" : "text-f1-muted"}>
        Δ E[position] = {gain > 0 ? "+" : ""}{gain.toFixed(2)} places
      </div>
      <div className="grid grid-cols-2 gap-2 text-f1-muted">
        <div>
          <div className="text-f1-muted/60 uppercase text-[9px] tracking-wider">baseline</div>
          <div>E[pos] {r.baseline.expected_position.toFixed(1)}</div>
          <div>P(podium) = {pct(r.baseline.podium)}</div>
        </div>
        <div>
          <div className="text-f1-muted/60 uppercase text-[9px] tracking-wider">if forced</div>
          <div>E[pos] {r.forced.expected_position.toFixed(1)}</div>
          <div>P(podium) = {pct(r.forced.podium)}</div>
        </div>
      </div>
    </div>
  );
}

export function WhatIfPanel({ sessionKey }: { sessionKey: string }) {
  const state = useRaceStateStore((s) => s.state);
  const [carId, setCarId] = useState("");
  const [action, setAction] = useState(ACTIONS[0].value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<WhatIfResponse | null>(null);
  const [pinned, setPinned] = useState<WhatIfResponse | null>(null);

  const cars = (state?.cars ?? []).filter((c) => c.status === "running");

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!state || !carId) return;
    setBusy(true);
    setError("");
    try {
      setResult(await runWhatIf({
        session_key: sessionKey, lap: state.leader_lap, car_id: carId,
        action, stay_laps: 5,
      }));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        setError(err instanceof Error ? err.message : "what-if failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <form onSubmit={submit} className="flex gap-2 items-center text-xs">
        <select value={carId} onChange={(e) => setCarId(e.target.value)}
          className="bg-f1-surface border border-f1-border rounded px-2 py-1 text-f1-text focus:outline-none focus:border-f1-red">
          <option value="">car…</option>
          {cars.map((c) => (
            <option key={c.car_id} value={c.car_id}>
              P{c.position} {c.driver_code ?? c.car_id}
            </option>
          ))}
        </select>
        <select value={action} onChange={(e) => setAction(e.target.value)}
          className="bg-f1-surface border border-f1-border rounded px-2 py-1 text-f1-text focus:outline-none focus:border-f1-red">
          {ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
        </select>
        <button type="submit" disabled={busy || !carId}
          className="px-3 py-1 rounded bg-f1-red text-white font-bold disabled:opacity-40 hover:bg-red-700 transition-colors">
          {busy ? "rolling out…" : "simulate"}
        </button>
      </form>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <div className="grid grid-cols-1 gap-2">
        {result && <ResultCard r={result} onPin={() => setPinned(result)} />}
        {pinned && pinned !== result && <ResultCard r={pinned} />}
      </div>
    </div>
  );
}
