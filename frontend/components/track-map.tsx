"use client";
import { useEffect, useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import { useTrackGeo } from "../lib/use-track-geo";
import { DRS_ZONES, normalizeDrsCircuit } from "../lib/drs-zones";
import { LiveTelemetryPanel } from "./live-telemetry-panel";
import type { CarState } from "../lib/types";

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

function CarDot({
  car,
  focused,
  geo,
}: {
  car: CarState;
  focused: boolean;
  geo: ReturnType<typeof useTrackGeo>;
}) {
  const color = teamColor(car.team);
  const pt = car.x != null && car.y != null && geo!.supportsRawLiveProjection
    ? geo!.projectRaw(car.x, car.y)
    : geo!.at(car.lap_fraction);

  const label = car.driver_code?.slice(0, 3) ?? car.car_id;

  return (
    // CSS translate inside SVG uses SVG user units — transition gives smooth 0.8s linear glide
    <g
      style={{
        transform: `translate(${pt.x.toFixed(2)}px, ${pt.y.toFixed(2)}px)`,
        transition: "transform 0.8s linear",
      }}
    >
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
}

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

  // Prefetch track outline
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

  // Active cars (not retired) sorted by position — OUT cars hidden from map entirely
  const activeCars = state?.cars.filter((c) => c.status !== "out") ?? [];
  const sorted = [...activeCars].sort((a, b) => a.position - b.position);

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
            for (const car of activeCars) {
              const cp = car.x != null && car.y != null && geo.supportsRawLiveProjection
                ? geo.projectRaw(car.x, car.y)
                : geo.at(car.lap_fraction);
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
          {sorted.reverse().map((car) => (
            <CarDot
              key={car.car_id}
              car={car}
              focused={car.car_id === focusedCarId}
              geo={geo}
            />
          ))}
        </svg>
      )}

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
