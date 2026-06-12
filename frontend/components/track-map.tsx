"use client";
import { useEffect, useRef } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import { useTrackGeo } from "../lib/use-track-geo";

interface Props {
  sessionKey: string;
}

const TRACK_STATUS_COLORS: Record<string, string> = {
  green: "#3A3A3A",
  yellow_zone: "#78350F",
  vsc: "#713F12",
  sc: "#78350F",
  red: "#450A0A",
};

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  geo: ReturnType<typeof useTrackGeo>,
  state: ReturnType<typeof useRaceStateStore.getState>["state"],
  focusedCarId: string | null
) {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  if (!geo) return;

  // Scale from VIEWBOX (1000) to canvas size
  const scale = Math.min(width, height) / 1000;
  const offX = (width - 1000 * scale) / 2;
  const offY = (height - 1000 * scale) / 2;

  const toCanvas = (vx: number, vy: number) => ({
    x: offX + vx * scale,
    y: offY + vy * scale,
  });

  // Track outline — double-pass for shadow + brightness
  const trackColor = state ? TRACK_STATUS_COLORS[state.track_status] ?? "#3A3A3A" : "#3A3A3A";

  // Shadow pass
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 12 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  geo.norm.forEach(({ x, y }, i) => {
    const c = toCanvas(x, y);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.closePath();
  ctx.stroke();

  // Main track pass
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 6 * scale;
  ctx.beginPath();
  geo.norm.forEach(({ x, y }, i) => {
    const c = toCanvas(x, y);
    if (i === 0) ctx.moveTo(c.x, c.y);
    else ctx.lineTo(c.x, c.y);
  });
  ctx.closePath();
  ctx.stroke();

  if (!state) return;

  // Driver dots with team-color halos
  const sorted = [...state.cars].sort((a, b) => a.position - b.position);
  for (const car of sorted) {
    if (car.status === "out") continue;
    const pt = geo.at(car.lap_fraction);
    const c = toCanvas(pt.x, pt.y);
    const color = teamColor(car.team);
    const isFocused = focusedCarId === car.car_id;

    if (isFocused) {
      // Focused driver: white outer ring
      ctx.beginPath();
      ctx.arc(c.x, c.y, 11 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 2 * scale;
      ctx.stroke();
    }

    // Team-color halo (outer, 40% opacity)
    const haloRadius = isFocused ? 9 * scale : 9 * scale;
    ctx.beginPath();
    ctx.arc(c.x, c.y, haloRadius, 0, Math.PI * 2);
    ctx.fillStyle = color + "66"; // 40% opacity
    ctx.fill();

    // Inner dot
    const dotRadius = isFocused ? 8 * scale : 6 * scale;
    ctx.beginPath();
    ctx.arc(c.x, c.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = "#080808";
    ctx.lineWidth = 1.5 * scale;
    ctx.stroke();

    // Driver code label with JetBrains Mono
    const label = car.driver_code?.slice(0, 3) ?? car.car_id;
    ctx.font = `bold ${Math.max(8, 10 * scale)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = "#EFEFEF";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(label, c.x, c.y - dotRadius - 1 * scale);
  }
}

export function TrackMap({ sessionKey }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useRaceStateStore((s) => s.state);
  const geo = useTrackGeo(sessionKey);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const raceControlMessages = useRaceStateStore((s) => s.raceControlMessages);

  // Detect SC status: any message with category "SafetyCar"
  const scActive = raceControlMessages.length > 0 && raceControlMessages[0].category === "SafetyCar";

  // Handle canvas click for driver selection
  const handleCanvasClick = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !state) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = evt.clientX - rect.left;
    const clickY = evt.clientY - rect.top;

    // Find nearest car within 20px using simple distance
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const scale = Math.min(canvas.width / dpr, canvas.height / dpr) / 1000;
    const offX = (canvas.width / dpr - 1000 * scale) / 2;
    const offY = (canvas.height / dpr - 1000 * scale) / 2;

    const toCanvas = (vx: number, vy: number) => ({
      x: offX + vx * scale,
      y: offY + vy * scale,
    });

    let nearest: string | null = null;
    let minDist = 20;

    for (const car of state.cars) {
      if (car.status === "out") continue;
      const pt = geo?.at(car.lap_fraction);
      if (!pt) continue;
      const c = toCanvas(pt.x, pt.y);
      const dx = clickX - c.x;
      const dy = clickY - c.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) {
        minDist = dist;
        nearest = car.car_id;
      }
    }

    if (nearest) {
      setFocusedCarId(nearest);
    }
  };

  // DPI-aware canvas sizing with ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Prefetch track outline data
  useEffect(() => {
    if (typeof window !== "undefined") {
      fetch(`/api/sessions/${sessionKey}/track-outline`, {
        priority: "low",
      }).catch(() => {});
    }
  }, [sessionKey]);

  // Draw frame on state/geo changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get logical size (after DPI scaling)
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const logicalWidth = canvas.width / dpr;
    const logicalHeight = canvas.height / dpr;

    // Create temp canvas for logical coords
    const tempCanvas = { width: logicalWidth, height: logicalHeight };
    drawFrame(ctx, tempCanvas as any, geo, state, focusedCarId);
  }, [state, geo, focusedCarId]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${scActive ? "sc-pulse-overlay" : ""}`}
    >
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{ display: "block" }}
        onClick={handleCanvasClick}
      />
      {scActive && (
        <div className="absolute top-2 right-2 chip bg-amber-900/60 text-amber-400 border border-amber-400/40 pointer-events-none">
          SC
        </div>
      )}
    </div>
  );
}
