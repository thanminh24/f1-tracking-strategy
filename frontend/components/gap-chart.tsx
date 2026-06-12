"use client";
import { useEffect, useRef } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";

interface GapHistory {
  [carId: string]: { t: number; gap: number }[];
}

const MAX_POINTS = 120;

// Module-level history buffer — survives re-renders.
let history: GapHistory = {};
let lastSessionKey = "";

export function GapChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRaceStateStore((s) => s.state);

  useEffect(() => {
    if (!state) return;
    // Reset on new session
    if (state.session_key !== lastSessionKey) {
      history = {};
      lastSessionKey = state.session_key;
    }
    for (const car of state.cars) {
      if (car.gap_leader_s == null || car.position === 1) continue;
      if (!history[car.car_id]) history[car.car_id] = [];
      const arr = history[car.car_id];
      arr.push({ t: state.t_session_s, gap: car.gap_leader_s });
      if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
    }
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { width, height } = canvas;
    const padL = 36, padR = 8, padT = 8, padB = 20;
    const W = width - padL - padR;
    const H = height - padT - padB;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#181818";
    ctx.fillRect(0, 0, width, height);

    const allGaps = Object.values(history)
      .flatMap((arr) => arr.map((p) => p.gap))
      .filter((g) => g < 120);
    if (allGaps.length === 0) return;

    const maxGap = Math.max(...allGaps, 5);
    const allTs = Object.values(history).flatMap((arr) => arr.map((p) => p.t));
    const minT = Math.min(...allTs);
    const maxT = Math.max(...allTs, minT + 1);

    // Grid lines
    ctx.strokeStyle = "#2D2D2D";
    ctx.lineWidth = 1;
    for (let g = 0; g <= maxGap; g += Math.ceil(maxGap / 4)) {
      const y = padT + H - (g / maxGap) * H;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + W, y);
      ctx.stroke();
      ctx.fillStyle = "#707070";
      ctx.font = "9px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(`${g}s`, padL - 4, y + 3);
    }

    // Lines per car
    const sorted = [...state.cars].sort((a, b) => a.position - b.position);
    for (const car of sorted) {
      const pts = history[car.car_id];
      if (!pts || pts.length < 2) continue;
      const color = teamColor(car.team);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach(({ t, gap }, i) => {
        const x = padL + ((t - minT) / (maxT - minT)) * W;
        const y = padT + H - Math.min(gap / maxGap, 1) * H;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  }, [state]);

  return (
    <canvas
      ref={canvasRef}
      width={420}
      height={160}
      className="w-full h-full"
      style={{ display: "block" }}
    />
  );
}
