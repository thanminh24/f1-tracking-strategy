"use client";
// Canvas2D track map at 60fps. Two stacked canvases:
//   staticCanvas — track outline, redrawn only when geo or track_status changes
//   dynamicCanvas — car dots, redrawn every rAF with lerp between 1Hz ticks
import { useEffect, useRef } from "react";
import { COLORS, TRACK_STATUS_COLORS } from "../lib/design-tokens";
import { useCanvasLoop } from "../lib/use-canvas-loop";
import { useTrackGeo } from "../lib/use-track-geo";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import type { CarState } from "../lib/types";

const VIEWBOX = 1000;
const DOT_R = 10;
const TRACK_WIDTH = 14;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * clamp(t, 0, 1);

export function TrackMap({ sessionKey }: { sessionKey: string }) {
  const geo = useTrackGeo(sessionKey);
  const state = useRaceStateStore((s) => s.state);

  // ── Static canvas: track outline ────────────────────────────────────────
  const staticRef = useRef<HTMLCanvasElement | null>(null);
  const geoRef = useRef(geo);

  useEffect(() => {
    geoRef.current = geo;
    const canvas = staticRef.current;
    if (!canvas || !geo) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    ctx.scale(ratio, ratio);

    const scaleX = canvas.offsetWidth / VIEWBOX;
    const scaleY = canvas.offsetHeight / VIEWBOX;

    ctx.clearRect(0, 0, canvas.offsetWidth, canvas.offsetHeight);
    ctx.beginPath();
    for (let i = 0; i < geo.norm.length; i++) {
      const x = geo.norm[i].x * scaleX;
      const y = geo.norm[i].y * scaleY;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const trackColor = TRACK_STATUS_COLORS[state?.track_status ?? "green"];
    ctx.strokeStyle = trackColor;
    ctx.lineWidth = TRACK_WIDTH;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }, [geo, state?.track_status]);

  // ── Dynamic canvas: interpolated car dots ───────────────────────────────
  // Refs hold previous/current tick data for interpolation
  const prevCarsRef = useRef<CarState[]>([]);
  const currCarsRef = useRef<CarState[]>([]);
  const tickTimeRef = useRef(0); // initialized to 0; set to performance.now() on first tick

  useEffect(() => {
    if (!state) return;
    prevCarsRef.current = currCarsRef.current;
    currCarsRef.current = state.cars;
    tickTimeRef.current = performance.now();
  }, [state]);

  const dynRef = useCanvasLoop((ctx) => {
    const canvas = ctx.canvas;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    const ratio = window.devicePixelRatio || 1;
    if (canvas.width !== w * ratio || canvas.height !== h * ratio) {
      canvas.width = w * ratio;
      canvas.height = h * ratio;
      ctx.scale(ratio, ratio);
    }

    ctx.clearRect(0, 0, w, h);
    const g = geoRef.current;
    if (!g) return;

    const scaleX = w / VIEWBOX;
    const scaleY = h / VIEWBOX;

    // Fraction of time elapsed since last 1Hz tick (0-1 → smooth interpolation)
    const elapsed = performance.now() - tickTimeRef.current;
    const t = Math.min(elapsed / 1000, 1);

    const prev = new Map(prevCarsRef.current.map((c) => [c.car_id, c]));
    const curr = currCarsRef.current;

    for (const car of curr) {
      if (car.status === "out" || car.status === "finished") continue;
      const p = prev.get(car.car_id);

      const fromFrac = p?.lap_fraction ?? car.lap_fraction;
      // Avoid snapping backward on new lap: if fraction resets (<0.1 diff going backward), skip lerp
      const fracDiff = car.lap_fraction - fromFrac;
      const adjustedFrom = fracDiff < -0.5 ? car.lap_fraction : fromFrac;
      const frac = lerp(adjustedFrom, car.lap_fraction, t);

      const pt = g.at(frac);
      const x = pt.x * scaleX;
      const y = pt.y * scaleY;
      const r = DOT_R * Math.min(scaleX, scaleY);

      const color = teamColor(car.team);

      // Outer ring for contrast
      ctx.beginPath();
      ctx.arc(x, y, r + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = COLORS.surface;
      ctx.fill();

      // Team-colored dot
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      // Position number inside dot
      const posSize = Math.round(9 * scaleX);
      ctx.font = `bold ${posSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = COLORS.surface;
      ctx.fillText(String(car.position), x, y + 0.5);

      // Driver code label above the dot
      const code = (car.driver_code ?? car.car_id).slice(0, 3).toUpperCase();
      const labelSize = Math.max(8, Math.round(r * 1.1));
      ctx.font = `bold ${labelSize}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      // Background pill for readability
      const tw = ctx.measureText(code).width;
      const pillW = tw + 4;
      const pillH = labelSize + 2;
      const pillX = x - pillW / 2;
      const pillY = y - r - 3 - pillH;
      ctx.fillStyle = "rgba(0,0,0,0.7)";
      ctx.fillRect(pillX, pillY, pillW, pillH);
      ctx.fillStyle = color;
      ctx.fillText(code, x, y - r - 3);
    }
  });

  if (!geo) {
    return (
      <div className="flex items-center justify-center h-full text-f1-muted text-sm">
        track map loading…
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {/* Static layer: track outline */}
      <canvas
        ref={staticRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: "pixelated" }}
      />
      {/* Dynamic layer: car dots at 60fps */}
      <canvas
        ref={dynRef as React.RefObject<HTMLCanvasElement>}
        className="absolute inset-0 w-full h-full"
      />
    </div>
  );
}
