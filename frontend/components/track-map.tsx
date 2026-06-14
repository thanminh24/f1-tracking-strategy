"use client";
import { useEffect, useRef, useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import { useTrackGeo } from "../lib/use-track-geo";
import { DRS_ZONES, normalizeDrsCircuit } from "../lib/drs-zones";
import { drawDrsZones } from "../lib/draw-drs-zones";

/** Lerp factor per rAF frame (~60 Hz). 0.15 → ~200 ms smooth catch-up. */
const LERP_ALPHA = 0.15;

interface SmoothPos {
  x: number | null;
  y: number | null;
  lapFraction: number;
}

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
  smoothPos: Map<string, SmoothPos>,
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
  // Filter out DNS/DNF/OUT cars entirely, then sort by position
  const sorted = state.cars
    .filter((car) => car.status !== "out")
    .sort((a, b) => a.position - b.position);

  for (const car of sorted) {
    // Lerp toward the car's current state position
    const prev = smoothPos.get(car.car_id);
    const targetX = car.x ?? null;
    const targetY = car.y ?? null;
    const targetFrac = car.lap_fraction;

    let sp: SmoothPos;
    if (!prev) {
      // First time we see this car — snap to exact position
      sp = { x: targetX, y: targetY, lapFraction: targetFrac };
    } else {
      // Lerp GPS coords when both prev and target have raw values
      const canLerpRaw =
        prev.x !== null && targetX !== null &&
        prev.y !== null && targetY !== null;
      sp = {
        x: canLerpRaw ? prev.x! + (targetX! - prev.x!) * LERP_ALPHA : targetX,
        y: canLerpRaw ? prev.y! + (targetY! - prev.y!) * LERP_ALPHA : targetY,
        lapFraction: prev.lapFraction + (targetFrac - prev.lapFraction) * LERP_ALPHA,
      };
    }
    smoothPos.set(car.car_id, sp);

    // Use smoothed GPS coords when available (live mode), else arc-length fraction
    const pt = (sp.x !== null && sp.y !== null && geo.supportsRawLiveProjection)
      ? geo.projectRaw(sp.x, sp.y)
      : geo.at(sp.lapFraction);
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
    ctx.beginPath();
    ctx.arc(c.x, c.y, 9 * scale, 0, Math.PI * 2);
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

  // Remove smoothPos entries for cars no longer in state (retired mid-session)
  const activeIds = new Set(sorted.map((c) => c.car_id));
  for (const id of smoothPos.keys()) {
    if (!activeIds.has(id)) smoothPos.delete(id);
  }
}

export function TrackMap({ sessionKey, circuit, circuitKey, sessionYear }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isLive = sessionKey === "live";
  // For live sessions: always pass "live" key + circuitKey to useTrackGeo.
  // The hook tries multiviewer first; if unavailable it falls back to the FastF1
  // circuit outline via `fallbackCircuit` — so the map always shows something.
  const geoKey = isLive ? "live" : (circuit ? `circuit:${circuit}` : sessionKey);
  const geo = useTrackGeo(
    geoKey,
    isLive ? circuitKey : undefined,
    sessionYear,
    isLive ? circuit : undefined,  // fallbackCircuit: FastF1 outline when multiviewer missing
  );

  // Refs for rAF loop — no React re-render needed for drawing
  const geoRef = useRef(geo);
  const lastValidGeoRef = useRef(geo);  // keep last non-null geo to avoid blank on source switch
  const stateRef = useRef(useRaceStateStore.getState().state);
  const focusedCarIdRef = useRef(useRaceStateStore.getState().focusedCarId);
  const showDrsRef = useRef(true);
  const dprRef = useRef(typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1);
  // Persistent lerp state for smooth position animation — mutated by drawFrame each rAF tick
  const smoothPosRef = useRef<Map<string, SmoothPos>>(new Map());
  if (geo !== null) lastValidGeoRef.current = geo;
  geoRef.current = geo ?? lastValidGeoRef.current;

  const [showDrs, setShowDrs] = useState(true);
  showDrsRef.current = showDrs;

  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);

  // Derive SC status for CSS overlay (needs React render)
  const scActive = useRaceStateStore(
    (s) => s.state?.track_status === "sc" || s.state?.track_status === "vsc"
  );

  // Subscribe to store changes without causing re-renders
  useEffect(() => {
    return useRaceStateStore.subscribe((s) => {
      stateRef.current = s.state;
      focusedCarIdRef.current = s.focusedCarId;
    });
  }, []);

  // Handle canvas click for driver selection
  const handleCanvasClick = (evt: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const state = stateRef.current;
    const geo = geoRef.current;
    if (!canvas || !state) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = evt.clientX - rect.left;
    const clickY = evt.clientY - rect.top;

    const dpr = dprRef.current;
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
      // Use smoothed positions for click hit-test so they match what's drawn
      const sp = smoothPosRef.current.get(car.car_id);
      const pt = (sp && sp.x !== null && sp.y !== null && geo?.supportsRawLiveProjection)
        ? geo.projectRaw(sp.x, sp.y)
        : geo?.at(sp?.lapFraction ?? car.lap_fraction);
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

    if (nearest) setFocusedCarId(nearest);
  };

  // DPI-aware canvas sizing with ResizeObserver
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const updateCanvasSize = () => {
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      const rect = container.getBoundingClientRect();
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
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

  // rAF draw loop — reads from refs, never re-subscribes
  useEffect(() => {
    let rafId: number;
    const loop = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        const dpr = dprRef.current;
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawFrame(
            ctx,
            { width: canvas.width / dpr, height: canvas.height / dpr },
            geoRef.current,
            stateRef.current,
            smoothPosRef.current,
            focusedCarIdRef.current,
            circuit,
            showDrsRef.current,
          );
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [circuit]); // only re-mount when circuit identity changes

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
