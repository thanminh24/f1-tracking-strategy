"use client";
import { useState } from "react";
import { useRaceStateStore } from "../../lib/race-state-store";
import { usePredictionStore } from "../../lib/prediction-store";
import { teamColor, formatLapTime } from "../../lib/team-colors";
import { Panel } from "../ui/panel";

export function HeadToHeadCard() {
  const cars = useRaceStateStore((s) => s.state?.cars ?? []);
  const prediction = usePredictionStore((s) => s.prediction);

  const sorted = [...cars]
    .filter((c) => c.status !== "out")
    .sort((a, b) => a.position - b.position);

  const [carAId, setCarAId] = useState<string>("");
  const [carBId, setCarBId] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);

  const firstCarId = sorted[0]?.car_id;
  const secondCarId = sorted[1]?.car_id;
  const selectedCarAId = carAId || firstCarId || "";
  const selectedCarBId = carBId || secondCarId || selectedCarAId;

  const carA = cars.find((c) => c.car_id === selectedCarAId);
  const carB = cars.find((c) => c.car_id === selectedCarBId);

  if (!carA || !carB) {
    return (
      <Panel title="H2H">
        <div className="text-xs text-f1-text-dim">No comparison data</div>
      </Panel>
    );
  }

  const gapA = carA.gap_leader_s ?? 0;
  const gapB = carB.gap_leader_s ?? 0;
  const gapDiff = Math.abs(gapA - gapB);
  const aheadDriver = gapA < gapB ? "A" : gapB < gapA ? "B" : "Equal";

  return (
    <details
      open={isOpen}
      onToggle={(e) => setIsOpen(e.currentTarget.open)}
      className="border border-f1-border rounded-lg overflow-hidden bg-f1-panel"
    >
      <summary className="cursor-pointer px-3 py-2 bg-f1-surface hover:bg-f1-surface/80 text-xs font-semibold text-f1-text uppercase tracking-widest">
        H2H Head-to-Head
      </summary>

      {isOpen && (
        <div className="p-3 space-y-2">
          {/* Selectors */}
          <div className="flex items-center gap-2 justify-between">
            <select
              value={selectedCarAId}
              onChange={(e) => setCarAId(e.target.value)}
              className="flex-1 bg-f1-panel border border-f1-border rounded px-2 py-1 text-xs text-f1-text font-data"
            >
              {sorted.map((c) => (
                <option key={c.car_id} value={c.car_id}>
                  {c.driver_code ?? c.car_id} P{c.position}
                </option>
              ))}
            </select>
            <span className="text-[10px] text-f1-text-dim uppercase">vs</span>
            <select
              value={selectedCarBId}
              onChange={(e) => setCarBId(e.target.value)}
              className="flex-1 bg-f1-panel border border-f1-border rounded px-2 py-1 text-xs text-f1-text font-data"
            >
              {sorted.map((c) => (
                <option key={c.car_id} value={c.car_id}>
                  {c.driver_code ?? c.car_id} P{c.position}
                </option>
              ))}
            </select>
          </div>

          {/* Divider */}
          <div className="border-t border-f1-border my-1" />

          {/* Position */}
          <MetricRow
            label="Position"
            a={
              <span style={{ borderLeftColor: teamColor(carA.team), borderLeftWidth: 3 }} className="pl-1">
                P{carA.position}
              </span>
            }
            b={
              <span style={{ borderLeftColor: teamColor(carB.team), borderLeftWidth: 3 }} className="pl-1">
                P{carB.position}
              </span>
            }
          />

          {/* Gap to leader */}
          <MetricRow
            label="Gap to leader"
            a={gapA === 0 ? "LEADER" : `+${gapA.toFixed(1)}s`}
            b={gapB === 0 ? "LEADER" : `+${gapB.toFixed(1)}s`}
          />

          {/* Last lap */}
          <MetricRow
            label="Last Lap"
            a={formatLapTime(carA.last_lap_ms)}
            b={formatLapTime(carB.last_lap_ms)}
          />

          {/* Tire */}
          <MetricRow
            label="Tyre"
            a={
              carA.tire
                ? `${carA.tire.compound} ${carA.tire.age_laps}`
                : "—"
            }
            b={
              carB.tire
                ? `${carB.tire.compound} ${carB.tire.age_laps}`
                : "—"
            }
          />

          {/* Pit stops */}
          <MetricRow label="Pit Stops" a={carA.pit_stops} b={carB.pit_stops} />

          {/* RL Action */}
          <MetricRow
            label="RL Action"
            a={getPrediction(carA.car_id, prediction) ?? "—"}
            b={getPrediction(carB.car_id, prediction) ?? "—"}
          />

          {/* Divider */}
          <div className="border-t border-f1-border my-1" />

          {/* Delta row */}
          <div className="text-center py-1">
            {selectedCarAId === selectedCarBId ? (
              <div className="text-xs text-f1-text-dim">Same driver</div>
            ) : (
              <div className="text-xs">
                <span className="text-f1-text font-data">{gapDiff.toFixed(3)}s</span>{" "}
                <span className="text-f1-text-dim">({aheadDriver} leads)</span>
              </div>
            )}
          </div>
        </div>
      )}
    </details>
  );
}

function MetricRow({
  label,
  a,
  b,
}: {
  label: string;
  a: React.ReactNode;
  b: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1 py-0.5 text-xs">
      <div className="flex-1 text-right font-data text-f1-text">{a}</div>
      <div className="w-24 text-center text-[10px] text-f1-text-dim uppercase tracking-wide">
        {label}
      </div>
      <div className="flex-1 text-left font-data text-f1-text">{b}</div>
    </div>
  );
}

function getPrediction(
  carId: string,
  pred: import("../../lib/prediction-types").PredictionSet | null
): string | null {
  if (!pred) return null;
  return pred.cars.find((c) => c.car_id === carId)?.recommended_action ?? null;
}
