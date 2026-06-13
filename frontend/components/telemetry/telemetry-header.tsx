"use client";
// Driver picker, lap filter, and channel toggle controls for telemetry view.
import type { LapRow } from "../../lib/types";
import type { TelemetryCompareSlot } from "../../lib/telemetry-selection";

interface Props {
  laps: LapRow[];
  slots: TelemetryCompareSlot[];
  onSlotDriverChange: (slotId: string, carId: string) => void;
  onSlotLapChange: (slotId: string, lap: number) => void;
  onAddSlot: () => void;
  onRemoveSlot: (slotId: string) => void;
  visibleChannels: Set<"speed" | "throttle" | "brake" | "gear">;
  onChannelToggle: (channel: "speed" | "throttle" | "brake" | "gear") => void;
}

export function TelemetryHeader({
  laps,
  slots,
  onSlotDriverChange,
  onSlotLapChange,
  onAddSlot,
  onRemoveSlot,
  visibleChannels,
  onChannelToggle,
}: Props) {
  // Unique cars from laps
  const cars = Array.from(
    new Map(
      laps.map((l) => [
        l.car_id,
        { car_id: l.car_id, driver_code: l.driver_code, team: l.team },
      ])
    ).values()
  ).sort((a, b) => a.driver_code.localeCompare(b.driver_code));

  const maxLap = Math.max(...laps.map((l) => l.lap_number), 1);
  const lapsByCar = new Map<string, LapRow[]>();
  for (const lap of laps) {
    if (!lapsByCar.has(lap.car_id)) lapsByCar.set(lap.car_id, []);
    lapsByCar.get(lap.car_id)!.push(lap);
  }

  const channels: Array<"speed" | "throttle" | "brake" | "gear"> = [
    "speed",
    "throttle",
    "brake",
    "gear",
  ];

  return (
    <div className="flex flex-col gap-3 px-3 pt-3 shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">
          Compare driver laps
        </div>
        <button
          onClick={onAddSlot}
          disabled={slots.length >= 5 || cars.length === 0}
          className="px-3 py-1 rounded border border-f1-border bg-f1-surface text-xs text-f1-text hover:bg-f1-panel disabled:opacity-40 disabled:cursor-not-allowed"
        >
          + Add trace
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-2">
        {slots.map((slot, index) => {
          const availableLaps = (lapsByCar.get(slot.carId) ?? [])
            .filter((lap) => lap.lap_time_ms != null)
            .sort((a, b) => a.lap_number - b.lap_number);
          return (
            <div
              key={slot.id}
              className="border border-f1-border bg-f1-surface px-2 py-2"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: slot.color }}
                  />
                  <span className="text-[10px] text-f1-muted uppercase tracking-widest">
                    Trace {index + 1}
                  </span>
                </div>
                {slots.length > 1 && (
                  <button
                    onClick={() => onRemoveSlot(slot.id)}
                    className="text-xs text-f1-muted hover:text-f1-red"
                    title="Remove trace"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="grid grid-cols-[1fr_72px] gap-2">
                <select
                  value={slot.carId}
                  onChange={(e) => onSlotDriverChange(slot.id, e.target.value)}
                  className="min-w-0 bg-f1-bg border border-f1-border px-2 py-1 text-xs text-f1-text font-data focus:outline-none focus:border-f1-red"
                >
                  {cars.map((c) => (
                    <option key={c.car_id} value={c.car_id}>
                      {c.driver_code} ({c.team})
                    </option>
                  ))}
                </select>
                <select
                  value={slot.lap}
                  onChange={(e) => onSlotLapChange(slot.id, Number(e.target.value))}
                  className="bg-f1-bg border border-f1-border px-2 py-1 text-xs text-f1-text font-data focus:outline-none focus:border-f1-red"
                >
                  {availableLaps.length === 0 ? (
                    <option value={slot.lap}>L{Math.min(slot.lap, maxLap)}</option>
                  ) : (
                    availableLaps.map((lap) => (
                      <option key={lap.lap_number} value={lap.lap_number}>
                        L{lap.lap_number}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>
          );
        })}
      </div>

      {/* Channel toggles */}
      <div className="flex gap-1 flex-wrap">
        <span className="text-[10px] text-f1-muted uppercase tracking-widest mr-2 self-center">
          Channels:
        </span>
        {channels.map((ch) => (
          <button
            key={ch}
            onClick={() => onChannelToggle(ch)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
              visibleChannels.has(ch)
                ? "bg-f1-green/20 border border-f1-green text-f1-green"
                : "bg-f1-surface border border-f1-border text-f1-text hover:bg-f1-panel"
            }`}
          >
            {ch === "speed"
              ? "Speed"
              : ch === "throttle"
                ? "Throttle"
                : ch === "brake"
                  ? "Brake"
                  : "Gear"}
          </button>
        ))}
      </div>
    </div>
  );
}
