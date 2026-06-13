"use client";
import { useEffect, useRef, useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import { useTrackGeo } from "../lib/use-track-geo";
import { DRS_ZONES, normalizeDrsCircuit } from "../lib/drs-zones";
import { drawDrsZones } from "../lib/draw-drs-zones";

interface Props {
  sessionKey: string;
  circuit?: string;
  /** F1 internal circuit key from SessionInfo.Meeting.Circuit.Key (live only) */
  circuitKey?: number;
  /** Session year for multiviewer API lookup */
  sessionYear?: number;
}

const TRACK_STATUS_COLORS: Record<string, string> = {
  green: "#3A3A3A",
  yellow_zone: "#78350F",
  vsc: "#713F12",
  sc: "#78350F",
  red: "#450A0A",
};

// For live sessions we also have the raw status string code ("1"-"7")
const LIVE_TRACK_STATUS: Record<string, { trackColor: string; bySector?: boolean }> = {
  "1": { trackColor: "#3A3A3A" },
  "2": { trackColor: "#78350F", bySector: true },
  "3": { trackColor: "#78350F", bySector: true },
  "4": { trackColor: "#78350F" },    // Safety Car
  "5": { trackColor: "#450A0A" },    // Red Flag
  "6": { trackColor: "#713F12" },    // VSC
  "7": { trackColor: "#713F12" },    // VSC Ending
};

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: { width: number; height: number },
  geo: ReturnType<typeof useTrackGeo>,
  state: ReturnType<typeof useRaceStateStore.getState>["state"],
  focusedCarId: string | null,
  circuit: string | undefined,
  showDrs: boolean
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

  // DRS zones (before driver dots so they appear behind)
  if (showDrs && circuit) {
    const circuitKey = normalizeDrsCircuit(circuit);
    const zones = circuitKey ? DRS_ZONES[circuitKey] : undefined;
    if (zones) {
      const isGreen = state.track_status === "green";
      const drsColor = isGreen ? "#22C55E" : "#707070";
      drawDrsZones(ctx, geo, zones, drsColor, offX, offY, scale);
    }
  }

  // Driver dots with team-color halos
  const sorted = [...state.cars].sort((a, b) => a.position - b.position);
  for (const car of sorted) {
    if (car.status === "out") continue;

    // Use real GPS coords when available (live mode), else arc-length fraction
    const pt = (car.x != null && car.y != null)
      ? geo.projectRaw(car.x, car.y)
      : geo.at(car.lap_fraction);
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

export function TrackMap({ sessionKey, circuit, circuitKey, sessionYear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useRaceStateStore((s) => s.state);
  const isLive = sessionKey === "live";
  // Live sessions: prefer multiviewer API via circuitKey.
  // Fallback: old circuit-name-based endpoint for archive sessions.
  const geoKey = !isLive && circuit ? `circuit:${circuit}` : sessionKey;
  const geo = useTrackGeo(geoKey, isLive ? circuitKey : undefined, sessionYear);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const [showDrs, setShowDrs] = useState(true);
  // Version counter incremented on resize so the draw effect re-fires after canvas reset.
  const [sizeVersion, setSizeVersion] = useState(0);

  // SC status from authoritative track_status field.
  const scActive = state?.track_status === "sc" || state?.track_status === "vsc";

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
      const pt = (car.x != null && car.y != null && geo)
        ? geo.projectRaw(car.x, car.y)
        : geo?.at(car.lap_fraction);
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
    const observer = new ResizeObserver(() => {
      updateCanvasSize();
      // Bump version so the draw effect re-fires after canvas context reset.
      setSizeVersion((v) => v + 1);
    });
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  // Prefetch track outline data
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = sessionKey === "live" && circuit
      ? `/api/circuits/${encodeURIComponent(circuit)}/track-outline`
      : `/api/sessions/${sessionKey}/track-outline`;
    fetch(url, { priority: "low" }).catch(() => {});
  }, [sessionKey, circuit]);

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
    drawFrame(ctx, tempCanvas, geo, state, focusedCarId, circuit, showDrs);
  }, [state, geo, focusedCarId, circuit, showDrs, sizeVersion]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full ${scActive ? "sc-pulse-overlay" : ""}`}
    >
      {/* Skeleton shown while track outline is loading */}
      {!geo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <svg viewBox="0 0 220 130" className="w-48 opacity-[0.12] animate-pulse">
            {/* Generic F1-circuit-like placeholder shape */}
            <path
              d="M40,90 Q10,90 10,65 L10,50 Q10,20 35,15 L80,10 Q110,8 130,15 L170,28
                 Q195,35 205,55 L208,75 Q210,100 190,108 L150,118 Q120,125 90,120 L55,112 Q42,108 40,90 Z"
              fill="none"
              stroke="#888"
              strokeWidth="10"
              strokeLinejoin="round"
            />
          </svg>
          <span className="text-[11px] text-f1-muted">Loading track…</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        style={{ display: "block" }}
        onClick={handleCanvasClick}
      />
      <div className="absolute top-2 right-2 flex gap-2 z-10">
        {scActive && (
          <div className="chip bg-amber-900/60 text-amber-400 border border-amber-400/40 pointer-events-none text-[10px]">
            SC
          </div>
        )}
        {normalizeDrsCircuit(circuit) && (
          <button
            onClick={() => setShowDrs(s => !s)}
            className={`chip text-[10px] font-medium transition-colors ${
              showDrs
                ? "bg-green-900/60 text-green-400 border border-green-400/40"
                : "bg-zinc-800 text-f1-text-dim border border-f1-border"
            }`}
          >
            DRS
          </button>
        )}
      </div>
    </div>
  );
}
