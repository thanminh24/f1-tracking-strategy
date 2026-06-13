"use client";
import { useEffect, useRef, useState } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import { teamColor } from "../lib/team-colors";
import type { CarStatus } from "../lib/types";

interface PitStopEntry {
  carId: string;
  driverCode: string;
  team: string;
  entryTime: number;
  status: CarStatus;
  isFlashing: boolean;
}

export function PitStopTimerBoard() {
  const state = useRaceStateStore((s) => s.state);
  const [entries, setEntries] = useState<PitStopEntry[]>([]);
  const [counter, setCounter] = useState(0);

  // Track pit entry times and previous statuses per car
  const pitTimesRef = useRef<Map<string, number>>(new Map());
  const prevStatusesRef = useRef<Map<string, CarStatus>>(new Map());
  const flashingRef = useRef<Set<string>>(new Set());

  // Update pit entries whenever state changes
  useEffect(() => {
    if (!state) return;

    const newEntries: PitStopEntry[] = [];
    const currentPitTimes = pitTimesRef.current;
    const prevStatuses = prevStatusesRef.current;

    state.cars.forEach((car) => {
      const prevStatus = prevStatuses.get(car.car_id) ?? car.status;
      const currentStatus = car.status;
      const isPitting = currentStatus === "pitting" || currentStatus === "in_pit";

      // Record entry time when entering pit
      if ((prevStatus !== "pitting" && prevStatus !== "in_pit") && isPitting) {
        currentPitTimes.set(car.car_id, state.t_session_s);
      }

      // Handle pit exit
      if ((prevStatus === "pitting" || prevStatus === "in_pit") && currentStatus === "running") {
        // Mark for flashing, then remove after 2s
        flashingRef.current.add(car.car_id);
        setTimeout(() => {
          flashingRef.current.delete(car.car_id);
          currentPitTimes.delete(car.car_id);
          setEntries((prev) => prev.filter((e) => e.carId !== car.car_id));
        }, 2000);
      }

      // Add active pit entry
      if (isPitting || flashingRef.current.has(car.car_id)) {
        const entryTime = currentPitTimes.get(car.car_id);
        if (entryTime != null) {
          newEntries.push({
            carId: car.car_id,
            driverCode: car.driver_code ?? car.car_id,
            team: car.team ?? "Unknown",
            entryTime,
            status: currentStatus,
            isFlashing: flashingRef.current.has(car.car_id),
          });
        }
      }

      prevStatuses.set(car.car_id, currentStatus);
    });

    setEntries(newEntries);
  }, [state]);

  // Update display timer every 250ms
  useEffect(() => {
    const interval = setInterval(() => {
      setCounter((c) => c + 1);
    }, 250);
    return () => clearInterval(interval);
  }, []);

  if (!state || entries.length === 0) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="text-[10px] text-f1-muted font-semibold">PIT STOPS</div>
        <div className="text-xs text-f1-text-dim">No active pit stops</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0 px-2 py-2">
      <div className="flex items-center gap-2 px-1 py-1">
        <span className="text-[10px] text-f1-muted font-semibold">PIT STOPS</span>
        <span className="inline-flex items-center justify-center w-5 h-5 bg-f1-border rounded text-[9px] text-f1-muted">
          {entries.length}
        </span>
      </div>

      <div className="flex flex-col gap-0.5">
        {entries.map((entry) => {
          const elapsedSeconds = state
            ? (state.t_session_s - entry.entryTime).toFixed(1)
            : "0.0";
          const color = teamColor(entry.team);
          const statusLabel = entry.status === "pitting" ? "PITTING" : "PIT";

          return (
            <div
              key={entry.carId}
              className={`flex items-center gap-2 px-2 py-1 rounded text-xs transition-colors ${
                entry.isFlashing ? "bg-green-900/30" : "bg-f1-panel/40"
              }`}
            >
              {/* Team stripe */}
              <span
                className="w-1 h-4 rounded-sm shrink-0"
                style={{ backgroundColor: color }}
              />

              {/* Driver code */}
              <span
                className="font-data font-semibold w-7 shrink-0"
                style={{ color }}
              >
                {entry.driverCode}
              </span>

              {/* Status label */}
              <span className="text-[10px] text-f1-text-dim w-12 shrink-0">
                {statusLabel}
              </span>

              {/* Elapsed time */}
              <span className="font-data text-sm font-semibold ml-auto text-f1-green">
                {elapsedSeconds}s
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
