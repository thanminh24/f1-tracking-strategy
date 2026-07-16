"use client";
// Full telemetry view with driver picker, lap filter, live-adaptive polling.
// Live mode: reads from useLiveTelemetryStore (CarData.z stream) instead of archive API.
import { useMemo, useState, useEffect } from "react";
import { useLiveTelemetryStore } from "../../lib/live-telemetry-store";
import { useRaceStateStore } from "../../lib/race-state-store";
import { isLiveTimingSource } from "../../lib/session-source";
import {
  bestLapForCar,
  carsFromLaps,
  createTelemetrySlot,
  selectedTelemetryKeys,
  type TelemetryCompareSlot,
} from "../../lib/telemetry-selection";
import { useTelemetryFetch } from "../../lib/use-telemetry-fetch";
import { TelemetryHeader } from "./telemetry-header";
import { MultiLapTracesChart } from "./multi-lap-traces-chart";
import { SectorTimeStrip } from "./sector-time-strip";
import { SectorHeatmap } from "./sector-heatmap";
import { PositionBumpChart } from "./position-bump-chart";
import type { LiveTelemetrySample } from "../../lib/live-telemetry-store";
import type { CarState, LapRow } from "../../lib/types";

type SubTab = "traces" | "sectors" | "evolution";
type VisibleChannel = "speed" | "throttle" | "brake" | "gear";

// ---- Inline live traces panel -----------------------------------------------

const LIVE_CHANNELS: { key: VisibleChannel; label: string; unit: string; max: number; color: string }[] = [
  { key: "speed",    label: "Speed",    unit: "km/h", max: 360, color: "#E91E63" },
  { key: "throttle", label: "Throttle", unit: "%",    max: 100, color: "#4CAF50" },
  { key: "brake",    label: "Brake",    unit: "%",    max: 100, color: "#F44336" },
  { key: "gear",     label: "Gear",     unit: "",     max: 8,   color: "#2196F3" },
];

function LiveTraceRow({ samples, channel, rowH }: {
  samples: LiveTelemetrySample[];
  channel: typeof LIVE_CHANNELS[0];
  rowH: number;
}) {
  const W = 600; const PAD_L = 36; const PAD_R = 8; const PAD_T = 4; const PAD_B = 18;
  const H = rowH - PAD_T - PAD_B;
  if (samples.length < 2) return (
    <div style={{ height: rowH }} className="flex items-center px-2 text-xs text-f1-muted">
      {channel.label}: waiting for data…
    </div>
  );
  const tMin = samples[0].t;
  const tMax = samples[samples.length - 1].t;
  const tRange = Math.max(tMax - tMin, 1);
  const toX = (t: number) => PAD_L + ((t - tMin) / tRange) * (W - PAD_L - PAD_R);
  const toY = (v: number) => PAD_T + H - (v / channel.max) * H;
  const path = samples.map((s, i) => {
    const x = toX(s.t); const y = toY(s[channel.key] as number);
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${rowH}`} preserveAspectRatio="none" style={{ height: rowH, display: "block" }}>
      <text x="2" y={rowH / 2} fill="#888" fontSize="9" dominantBaseline="middle">{channel.label}</text>
      <polyline points="" />
      <path d={path} fill="none" stroke={channel.color} strokeWidth="1.5" />
      <text x={W - PAD_R} y={PAD_T + 2} fill="#888" fontSize="9" textAnchor="end">
        {(samples[samples.length - 1][channel.key] as number).toFixed(0)}{channel.unit}
      </text>
    </svg>
  );
}

function LiveTracesPanel({ primaryCarId, liveCars, liveTelemData, visibleChannels, onPrimaryChange, onChannelToggle }: {
  primaryCarId: string | null;
  liveCars: CarState[];
  liveTelemData: Record<string, LiveTelemetrySample[]>;
  visibleChannels: Set<string>;
  onPrimaryChange: (id: string) => void;
  onChannelToggle: (ch: VisibleChannel) => void;
}) {
  const sortedCars = [...liveCars].sort((a, b) => (a.position || 99) - (b.position || 99));
  const activeSamples = primaryCarId ? (liveTelemData[primaryCarId] ?? []) : [];
  const channels = LIVE_CHANNELS.filter((c) => visibleChannels.has(c.key as string));
  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Driver picker */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-f1-border shrink-0 overflow-x-auto">
        <span className="text-[10px] text-f1-muted shrink-0">Driver:</span>
        {sortedCars.map((c) => (
          <button key={c.car_id} onClick={() => onPrimaryChange(c.car_id)}
            className={`px-2 py-0.5 rounded text-[10px] font-data font-semibold transition-colors shrink-0 ${
              primaryCarId === c.car_id
                ? "bg-f1-red text-white"
                : "bg-f1-panel border border-f1-border text-f1-text-dim hover:text-f1-text"
            }`}>
            {c.driver_code ?? c.car_id}
          </button>
        ))}
        <span className="w-px h-4 bg-f1-border mx-1 shrink-0" />
        {LIVE_CHANNELS.map((channel) => (
          <button
            key={channel.key}
            onClick={() => onChannelToggle(channel.key)}
            className={`px-2 py-0.5 rounded text-[10px] font-semibold shrink-0 border ${
              visibleChannels.has(channel.key)
                ? "border-f1-green text-f1-green bg-f1-green/10"
                : "border-f1-border text-f1-text-dim bg-f1-panel"
            }`}
          >
            {channel.label}
          </button>
        ))}
      </div>
      {/* Trace rows */}
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin divide-y divide-f1-border/40">
        {channels.length === 0 && (
          <div className="text-xs text-f1-muted p-4">No channels selected.</div>
        )}
        {channels.map((ch) => (
          <LiveTraceRow key={ch.key} samples={activeSamples} channel={ch} rowH={72} />
        ))}
        {activeSamples.length === 0 && channels.length > 0 && (
          <div className="text-xs text-f1-muted p-4">Waiting for telemetry… (CarData.z stream, ~5s warm-up)</div>
        )}
      </div>
      {/* Latest values bar */}
      {activeSamples.length > 0 && (() => {
        const last = activeSamples[activeSamples.length - 1];
        return (
          <div className="shrink-0 flex gap-4 px-3 py-1.5 border-t border-f1-border bg-f1-surface text-[10px] font-data text-f1-text-dim">
            <span>Speed <span className="text-f1-text">{last.speed} km/h</span></span>
            <span>Thr <span className="text-f1-text">{last.throttle}%</span></span>
            <span>Brk <span className="text-f1-text">{last.brake}%</span></span>
            <span>Gear <span className="text-f1-text">{last.gear}</span></span>
            <span>RPM <span className="text-f1-text">{last.rpm}</span></span>
            <span>DRS <span className={last.drs ? "text-green-400" : "text-f1-text"}>{last.drs ? "ON" : "OFF"}</span></span>
          </div>
        );
      })()}
    </div>
  );
}

interface Props {
  sessionKey: string;
  laps: LapRow[];
}

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "traces", label: "Traces" },
  { id: "sectors", label: "Sectors" },
  { id: "evolution", label: "Evolution" },
];

export function TelemetryView({ sessionKey, laps }: Props) {
  const [subTab, setSubTab] = useState<SubTab>("traces");
  const [livePrimaryCarId, setLivePrimaryCarId] = useState<string | null>(null);
  const [slots, setSlots] = useState<TelemetryCompareSlot[]>(() => {
    const firstCar = carsFromLaps(laps)[0];
    const first = firstCar ? createTelemetrySlot(laps, 0, firstCar.car_id) : null;
    return first ? [first] : [];
  });
  const [visibleChannels, setVisibleChannels] = useState<
    Set<VisibleChannel>
  >(new Set(["speed", "throttle", "brake"]));

  const { samplesMap, loadingKeys, fetchTelemetryBatch } = useTelemetryFetch(sessionKey);
  const source = useRaceStateStore((s) => s.source);
  const liveCarsRaw = useRaceStateStore((s) => s.state?.cars);
  const liveCars = liveCarsRaw ?? [];
  const liveTelemData = useLiveTelemetryStore((s) => s.data);
  const isLive = isLiveTimingSource(source);
  const archiveCars = useMemo(() => carsFromLaps(laps), [laps]);
  const liveLeaderCarId = (liveCars.find((c) => c.position === 1) ?? liveCars[0])?.car_id ?? null;
  const effectiveLivePrimaryCarId = livePrimaryCarId ?? liveLeaderCarId;

  useEffect(() => {
    if (!isLive) fetchTelemetryBatch(selectedTelemetryKeys(slots));
  }, [fetchTelemetryBatch, isLive, slots]);

  const selectedLapsForChart = slots.map((slot) => {
    const row = laps.find((lap) => lap.car_id === slot.carId && lap.lap_number === slot.lap);
    return {
      carId: slot.carId,
      lap: slot.lap,
      label: `${row?.driver_code ?? slot.carId} L${slot.lap}`,
      color: slot.color,
    };
  });

  const displayedLap =
    slots.length > 0
      ? laps.find((lap) => lap.car_id === slots[0].carId && lap.lap_number === slots[0].lap) ?? null
      : null;
  const personalBestMs =
    displayedLap == null
      ? null
      : Math.min(
          ...laps
            .filter((lap) => lap.car_id === displayedLap.car_id && lap.lap_time_ms != null)
            .map((lap) => lap.lap_time_ms ?? Infinity)
        );

  const addSlot = () => {
    setSlots((current) => {
      if (current.length >= 5) return current;
      const unused = archiveCars.find((car) => !current.some((slot) => slot.carId === car.car_id));
      const next = createTelemetrySlot(laps, current.length, unused?.car_id);
      return next ? [...current, next] : current;
    });
  };

  const updateSlotDriver = (slotId: string, carId: string) => {
    setSlots((current) =>
      current.map((slot) =>
        slot.id === slotId ? { ...slot, carId, lap: bestLapForCar(laps, carId) } : slot
      )
    );
  };

  const updateSlotLap = (slotId: string, lap: number) => {
    setSlots((current) =>
      current.map((slot) => (slot.id === slotId ? { ...slot, lap } : slot))
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 gap-0">
      {/* Sub-tab bar — archive only; live uses streaming traces only */}
      {!isLive && (
        <div className="flex items-center gap-0.5 px-3 pt-2 border-b border-f1-border shrink-0">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                subTab === t.id
                  ? "bg-f1-panel text-f1-text"
                  : "text-f1-text-dim hover:text-f1-text hover:bg-f1-panel/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {isLive && (
        <div className="px-3 py-2 border-b border-f1-border shrink-0 text-[10px] uppercase tracking-widest text-f1-muted">
          Live CarData traces · select driver below
        </div>
      )}

      {/* Sectors and Evolution tabs — archive only */}
      {!isLive && subTab === "sectors" && <SectorHeatmap laps={laps} />}
      {!isLive && subTab === "evolution" && <PositionBumpChart laps={laps} />}

      {/* Traces tab */}
      {(isLive || subTab === "traces") && (isLive ? (
        // Live mode: continuous streaming traces from CarData.z ring buffer
        <LiveTracesPanel
          primaryCarId={effectiveLivePrimaryCarId}
          liveCars={liveCars}
          liveTelemData={liveTelemData}
          visibleChannels={visibleChannels}
          onPrimaryChange={setLivePrimaryCarId}
          onChannelToggle={(ch) => setVisibleChannels((prev) => {
            const next = new Set(prev);
            if (next.has(ch)) next.delete(ch);
            else next.add(ch);
            return next;
          })}
        />
      ) : (
        <>
        <TelemetryHeader
          laps={laps}
          slots={slots}
          onSlotDriverChange={updateSlotDriver}
          onSlotLapChange={updateSlotLap}
          onAddSlot={addSlot}
          onRemoveSlot={(slotId) => setSlots((current) => current.filter((slot) => slot.id !== slotId))}
          visibleChannels={visibleChannels}
          onChannelToggle={(ch) => {
            setVisibleChannels((prev) => {
              const next = new Set(prev);
              if (next.has(ch)) next.delete(ch);
              else next.add(ch);
              return next;
            });
          }}
        />
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <div className="p-3">
            <MultiLapTracesChart samples={samplesMap} selectedLaps={selectedLapsForChart} visibleChannels={visibleChannels} />
          </div>
        </div>
        {displayedLap && <SectorTimeStrip lap={displayedLap} personalBestMs={personalBestMs} />}
        {loadingKeys.size > 0 && (
          <div className="px-3 py-2 text-xs text-f1-muted border-t border-f1-border bg-f1-surface/50">
            Loading {loadingKeys.size} lap{loadingKeys.size > 1 ? "s" : ""}…
          </div>
        )}
        </>
      ))}
    </div>
  );
}
