"use client";
import { useEffect, useRef } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import type { RaceState } from "../lib/types";

interface GapHistory {
  [carId: string]: { t: number; gap: number }[];
}

const MAX_POINTS = 200;

let history: GapHistory = {};
let lastSessionKey = "";

function drawChart(
  ctx: CanvasRenderingContext2D,
  logicalW: number,
  logicalH: number,
  state: RaceState,
) {
  const padL = 38, padR = 10, padT = 10, padB = 22;
  const W = logicalW - padL - padR;
  const H = logicalH - padT - padB;
  if (W <= 0 || H <= 0) return;

  ctx.clearRect(0, 0, logicalW, logicalH);
  ctx.fillStyle = "#181818";
  ctx.fillRect(0, 0, logicalW, logicalH);

  const allGaps = Object.values(history)
    .flatMap((arr) => arr.map((p) => p.gap))
    .filter((g) => g < 120);
  if (allGaps.length === 0) {
    ctx.fillStyle = "#707070";
    ctx.font = "11px ui-monospace,monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Gap data loading…", logicalW / 2, logicalH / 2);
    return;
  }

  const maxGap = Math.max(...allGaps, 5);
  const allTs = Object.values(history).flatMap((arr) => arr.map((p) => p.t));
  const minT = Math.min(...allTs);
  const maxT = Math.max(...allTs, minT + 1);

  // Grid lines + Y labels
  const gridSteps = 5;
  ctx.strokeStyle = "#2D2D2D";
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSteps; i++) {
    const g = (maxGap / gridSteps) * i;
    const y = padT + H - (g / maxGap) * H;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + W, y);
    ctx.stroke();
    ctx.fillStyle = "#707070";
    ctx.font = "10px ui-monospace,monospace";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(g)}s`, padL - 5, y);
  }

  // Lines per car
  const sorted = [...state.cars].sort((a, b) => a.position - b.position);
  for (const car of sorted) {
    const pts = history[car.car_id];
    if (!pts || pts.length < 2) continue;
    const color = teamColor(car.team);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    pts.forEach(({ t, gap }, i) => {
      const x = padL + ((t - minT) / (maxT - minT)) * W;
      const y = padT + H - Math.min(gap / maxGap, 1) * H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Driver label at end of line
    const last = pts[pts.length - 1];
    const lx = padL + ((last.t - minT) / (maxT - minT)) * W;
    const ly = padT + H - Math.min(last.gap / maxGap, 1) * H;
    ctx.fillStyle = color;
    ctx.font = "bold 9px ui-monospace,monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const label = car.driver_code?.slice(0, 3) ?? car.car_id;
    if (lx > padL + W * 0.6) {
      ctx.fillText(label, Math.min(lx + 3, padL + W - 2), ly);
    }
  }

  // X axis label
  ctx.fillStyle = "#505050";
  ctx.font = "9px ui-monospace,monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("session time →", padL + W / 2, padT + H + 5);
}

export function GapChart() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(useRaceStateStore.getState().state);
  const rafRef = useRef<number | null>(null);
  const dirtyRef = useRef(true);

  // Keep stateRef current and collect history
  useEffect(() => {
    return useRaceStateStore.subscribe((s) => {
      const state = s.state;
      if (!state) return;
      if (state.session_key !== lastSessionKey) {
        history = {};
        lastSessionKey = state.session_key;
      }
      for (const car of state.cars) {
        if (car.gap_leader_s == null || car.position === 1) continue;
        if (!history[car.car_id]) history[car.car_id] = [];
        const arr = history[car.car_id];
        const last = arr[arr.length - 1];
        // Deduplicate same-time entries
        if (!last || last.t !== state.t_session_s) {
          arr.push({ t: state.t_session_s, gap: car.gap_leader_s });
          if (arr.length > MAX_POINTS) arr.splice(0, arr.length - MAX_POINTS);
        }
      }
      stateRef.current = state;
      dirtyRef.current = true;
    });
  }, []);

  // DPI-aware ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = container.getBoundingClientRect();
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      dirtyRef.current = true;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // rAF draw loop — only redraws when dirty
  useEffect(() => {
    const loop = () => {
      if (dirtyRef.current) {
        dirtyRef.current = false;
        const canvas = canvasRef.current;
        const state = stateRef.current;
        if (canvas && state) {
          const ctx = canvas.getContext("2d");
          const dpr = window.devicePixelRatio || 1;
          if (ctx) drawChart(ctx, canvas.width / dpr, canvas.height / dpr, state);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full">
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: "100%" }} />
    </div>
  );
}
