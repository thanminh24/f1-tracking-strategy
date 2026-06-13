"use client";
import { useState } from "react";
import type { LiveChampionship } from "../../lib/types";

interface Props {
  prediction: LiveChampionship | undefined;
}

function DeltaChip({ current, predicted }: { current: number; predicted: number }) {
  const delta = predicted - current;
  if (delta === 0) return <span className="font-data text-xs text-f1-text-dim">±0</span>;
  const positive = delta > 0;
  return (
    <span className={`font-data text-xs ${positive ? "text-green-400" : "text-red-400"}`}>
      {positive ? "+" : ""}{delta}
    </span>
  );
}

function PositionArrow({ current, predicted }: { current: number; predicted: number }) {
  const diff = current - predicted; // lower position number = higher in standings
  if (diff === 0) return <span className="text-zinc-600 text-xs">—</span>;
  return (
    <span className={`text-xs ${diff > 0 ? "text-green-400" : "text-red-400"}`}>
      {diff > 0 ? `↑${diff}` : `↓${Math.abs(diff)}`}
    </span>
  );
}

export function ChampionshipPredictionPanel({ prediction }: Props) {
  const [tab, setTab] = useState<"drivers" | "teams">("drivers");

  if (!prediction || (!prediction.Drivers && !prediction.Teams)) {
    return (
      <div className="p-3 text-xs text-f1-muted text-center">
        Championship prediction not available
      </div>
    );
  }

  const drivers = prediction.Drivers
    ? Object.values(prediction.Drivers).sort((a, b) => a.PredictedPosition - b.PredictedPosition)
    : [];
  const teams = prediction.Teams
    ? Object.values(prediction.Teams).sort((a, b) => a.PredictedPosition - b.PredictedPosition)
    : [];

  return (
    <div className="flex flex-col">
      {/* Tab switcher */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-f1-border">
        {(["drivers", "teams"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-[10px] px-2 py-0.5 rounded transition-colors capitalize ${
              tab === t
                ? "bg-zinc-700 text-f1-text"
                : "text-f1-text-dim hover:text-f1-text"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Drivers tab */}
      {tab === "drivers" && (
        <div className="flex flex-col">
          <div className="grid grid-cols-[16px_32px_1fr_44px_44px_28px] gap-1 px-3 py-1 border-b border-f1-border">
            <span className="text-[9px] text-f1-muted">P</span>
            <span className="text-[9px] text-f1-muted">↕</span>
            <span className="text-[9px] text-f1-muted">Driver</span>
            <span className="text-[9px] text-f1-muted text-right">Now</span>
            <span className="text-[9px] text-f1-muted text-right">Pred.</span>
            <span className="text-[9px] text-f1-muted text-right">Δ</span>
          </div>
          {drivers.map((d) => (
            <div
              key={d.RacingNumber}
              className="grid grid-cols-[16px_32px_1fr_44px_44px_28px] gap-1 items-center px-3 py-1 border-b border-f1-border/40 last:border-0 hover:bg-f1-panel-hover"
            >
              <span className="font-data text-xs text-f1-text-dim">{d.PredictedPosition}</span>
              <PositionArrow current={d.CurrentPosition} predicted={d.PredictedPosition} />
              <span className="font-data text-xs text-f1-text truncate">{d.RacingNumber}</span>
              <span className="font-data text-xs text-f1-text-dim text-right">{d.CurrentPoints}</span>
              <span className="font-data text-xs text-f1-text text-right">{d.PredictedPoints}</span>
              <div className="flex justify-end">
                <DeltaChip current={d.CurrentPoints} predicted={d.PredictedPoints} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Teams tab */}
      {tab === "teams" && (
        <div className="flex flex-col">
          <div className="grid grid-cols-[16px_32px_1fr_44px_44px_28px] gap-1 px-3 py-1 border-b border-f1-border">
            <span className="text-[9px] text-f1-muted">P</span>
            <span className="text-[9px] text-f1-muted">↕</span>
            <span className="text-[9px] text-f1-muted">Team</span>
            <span className="text-[9px] text-f1-muted text-right">Now</span>
            <span className="text-[9px] text-f1-muted text-right">Pred.</span>
            <span className="text-[9px] text-f1-muted text-right">Δ</span>
          </div>
          {teams.map((t, i) => (
            <div
              key={t.TeamName ?? i}
              className="grid grid-cols-[16px_32px_1fr_44px_44px_28px] gap-1 items-center px-3 py-1 border-b border-f1-border/40 last:border-0 hover:bg-f1-panel-hover"
            >
              <span className="font-data text-xs text-f1-text-dim">{t.PredictedPosition}</span>
              <PositionArrow current={t.CurrentPosition} predicted={t.PredictedPosition} />
              <span className="font-data text-xs text-f1-text truncate">{t.TeamName}</span>
              <span className="font-data text-xs text-f1-text-dim text-right">{t.CurrentPoints}</span>
              <span className="font-data text-xs text-f1-text text-right">{t.PredictedPoints}</span>
              <div className="flex justify-end">
                <DeltaChip current={t.CurrentPoints} predicted={t.PredictedPoints} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
