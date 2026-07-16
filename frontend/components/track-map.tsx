"use client";
import { memo, useEffect, useMemo, useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import { useTrackGeo } from "../lib/use-track-geo";
import { useSmoothCarPositions } from "../lib/use-smooth-car-positions";
import { DRS_ZONES, normalizeDrsCircuit } from "../lib/drs-zones";
import { LiveTelemetryPanel } from "./live-telemetry-panel";

interface Props {
  sessionKey: string;
  circuit?: string;
  circuitKey?: number;
  sessionYear?: number;
}

const TRACK_STATUS_COLORS: Record<string, string> = {
  green: "#3A3A3A",
  yellow_zone: "#78350F",
  vsc: "#713F12",
  sc: "#78350F",
  red: "#450A0A",
};

/** Build an SVG path string along arc-length fractions [start, end]. */
function drsZonePath(
  geo: ReturnType<typeof useTrackGeo>,
  activation: number,
  end: number,
  steps = 20,
): string {
  const span = end >= activation ? end - activation : 1 - activation + end;
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const frac = (activation + (span * i) / steps) % 1;
    return geo!.at(frac);
  });
  return `M${pts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("L")}`;
}

// Position is driven imperatively by useSmoothCarPositions via registerRef, so
// this only re-renders when team/label/focus change — never per position tick.
const CarDot = memo(function CarDot({
  team,
  label,
  focused,
  registerRef,
}: {
  team: string | null;
  label: string;
  focused: boolean;
  registerRef: (el: SVGGElement | null) => void;
}) {
  const color = teamColor(team);

  return (
    <g ref={registerRef} style={{ willChange: "transform" }}>
      {focused && (
        <circle r={13} fill="none" stroke="#FFFFFF" strokeWidth={1.5} />
      )}
      {/* Team-color halo */}
      <circle r={9} fill={color + "66"} />
      {/* Inner dot */}
      <circle
        r={focused ? 8 : 6}
        fill={color}
        stroke="#080808"
        strokeWidth={1}
      />
      {/* Driver code label */}
      <text
        y={-11}
        fontSize={8}
        fontWeight="bold"
        fontFamily='"JetBrains Mono", monospace'
        fill="#EFEFEF"
        textAnchor="middle"
        style={{ userSelect: "none", pointerEvents: "none" }}
      >
        {label}
      </text>
    </g>
  );
});

// Pit-lane box — lists cars currently in the pit so they are not drawn stopped
// in the middle of the track. Click a chip to focus that car.
const PitLaneBox = memo(function PitLaneBox({
  cars,
  focusedCarId,
  onFocus,
}: {
  cars: { car_id: string; driver_code: string | null; team: string | null }[];
  focusedCarId: string | null;
  onFocus: (id: string) => void;
}) {
  if (cars.length === 0) return null;
  return (
    <div className="absolute top-2 left-2 z-10 max-w-[45%]">
      <div className="rounded bg-f1-surface/85 border border-f1-border px-2 py-1.5 backdrop-blur-sm">
        <div className="text-[9px] font-semibold tracking-wider text-f1-text-dim mb-1">
          PIT LANE · {cars.length}
        </div>
        <div className="flex flex-wrap gap-1">
          {cars.map((c) => {
            const color = teamColor(c.team);
            const focused = c.car_id === focusedCarId;
            return (
              <button
                key={c.car_id}
                onClick={() => onFocus(c.car_id)}
                className="chip text-[10px] font-bold leading-none px-1.5 py-1 rounded"
                style={{
                  backgroundColor: color + "26",
                  color,
                  border: `1px solid ${focused ? "#FFFFFF" : color + "66"}`,
                }}
              >
                {c.driver_code?.slice(0, 3) ?? c.car_id}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
});

export function TrackMap({ sessionKey, circuit, circuitKey, sessionYear }: Props) {
  const isLive = sessionKey === "live";
  const geoKey = isLive ? "live" : (circuit ? `circuit:${circuit}` : sessionKey);
  const geo = useTrackGeo(
    geoKey,
    isLive ? circuitKey : undefined,
    sessionYear,
    isLive ? circuit : undefined,
  );

  const state = useRaceStateStore((s) => s.state);
  const focusedCarId = useRaceStateStore((s) => s.focusedCarId);
  const setFocusedCarId = useRaceStateStore((s) => s.setFocusedCarId);
  const scActive = useRaceStateStore(
    (s) => s.state?.track_status === "sc" || s.state?.track_status === "vsc",
  );

  const [showDrs, setShowDrs] = useState(true);

  // Cars on track get a moving dot (running + finished — the latter keep valid
  // last positions). Cars in the pit lane have stale/garage GPS coords that
  // would otherwise render them stopped mid-track, so they go in the pit box.
  const runningCars = useMemo(
    () => state?.cars.filter((c) => c.status === "running" || c.status === "finished") ?? [],
    [state?.cars],
  );
  const pitCars = useMemo(
    () =>
      (state?.cars.filter((c) => c.status === "in_pit" || c.status === "pitting") ?? [])
        .sort((a, b) => a.position - b.position),
    [state?.cars],
  );
  const sortedCars = useMemo(
    () => [...runningCars].sort((a, b) => b.position - a.position),
    [runningCars],
  );

  const { registerCar, getRenderedPoint } = useSmoothCarPositions(geo, runningCars);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = sessionKey === "live" && circuit
      ? `/api/circuits/${encodeURIComponent(circuit)}/track-outline`
      : `/api/sessions/${sessionKey}/track-outline`;
    fetch(url, { priority: "low" }).catch(() => {});
  }, [sessionKey, circuit]);

  const trackColor = state ? TRACK_STATUS_COLORS[state.track_status] ?? "#3A3A3A" : "#3A3A3A";
  const isGreen = state?.track_status === "green";
  const drsCircuit = normalizeDrsCircuit(circuit);
  const drsZones = drsCircuit ? DRS_ZONES[drsCircuit] : undefined;

  return (
    <div className={`relative w-full h-full ${scActive ? "sc-pulse-overlay" : ""}`}>
      {/* Skeleton while loading */}
      {!geo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
          <svg viewBox="0 0 220 130" className="w-48 opacity-[0.12] animate-pulse">
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

      {geo && (
        <svg
          viewBox={geo.svgViewBox}
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
          style={{ display: "block", cursor: "crosshair" }}
          onClick={(e) => {
            // Hit-test: find nearest car within 15 SVG units of click
            const svgEl = e.currentTarget as SVGSVGElement;
            const pt = svgEl.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgPt = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
            let nearest: string | null = null;
            let minDist = 15;
            for (const car of runningCars) {
              // Hit-test against the smoothed on-screen position the user sees.
              const cp = getRenderedPoint(car.car_id)
                ?? (car.x != null && car.y != null && geo.supportsRawLiveProjection
                  ? geo.projectRaw(car.x, car.y)
                  : geo.at(car.lap_fraction));
              const dist = Math.hypot(svgPt.x - cp.x, svgPt.y - cp.y);
              if (dist < minDist) { minDist = dist; nearest = car.car_id; }
            }
            if (nearest) setFocusedCarId(nearest);
          }}
        >
          {/* Track shadow */}
          <path
            d={geo.d}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={12}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Track main */}
          <path
            d={geo.d}
            stroke={trackColor}
            strokeWidth={6}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {/* DRS zones */}
          {showDrs && drsZones && geo && drsZones.map((z, i) => (
            <path
              key={i}
              d={drsZonePath(geo, z.activation, z.end)}
              stroke={isGreen ? "#22C55E" : "#707070"}
              strokeWidth={4}
              fill="none"
              strokeLinecap="round"
            />
          ))}

          {/* Car dots — sorted so higher-position cars render below lower-position */}
          {sortedCars.map((car) => (
            <CarDot
              key={car.car_id}
              team={car.team}
              label={car.driver_code?.slice(0, 3) ?? car.car_id}
              focused={car.car_id === focusedCarId}
              registerRef={registerCar(car.car_id)}
            />
          ))}
        </svg>
      )}

      {/* Pit-lane box — top left */}
      <PitLaneBox cars={pitCars} focusedCarId={focusedCarId} onFocus={setFocusedCarId} />

      {/* Overlay chips — top right */}
      <div className="absolute top-2 right-2 flex gap-2 z-10">
        {scActive && (
          <div className="chip bg-amber-900/60 text-amber-400 border border-amber-400/40 pointer-events-none text-[10px]">
            SC
          </div>
        )}
        {drsCircuit && (
          <button
            onClick={() => setShowDrs((s) => !s)}
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

      {/* Live telemetry panel — bottom left overlay */}
      <LiveTelemetryPanel isLive={isLive} />
    </div>
  );
}
