"use client";
// Play/pause/speed/seek controls wired to WS control messages. Space = play/pause.
import { useEffect } from "react";
import { useRaceStateStore } from "../lib/race-state-store";
import type { ReplayWsClient } from "../lib/ws-replay-client";

const SPEEDS = [1, 2, 5, 10, 25, 100];

export function PlaybackControls({ client }: { client: ReplayWsClient }) {
  const status = useRaceStateStore((s) => s.status);
  const state = useRaceStateStore((s) => s.state);
  const connected = useRaceStateStore((s) => s.connected);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        client.control(status?.playing ? "pause" : "play");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, status?.playing]);

  return (
    <div className="flex items-center gap-3 text-sm">
      <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-red-500"}`} />
      <button
        className="px-3 py-1 rounded bg-zinc-800 hover:bg-zinc-700 font-bold"
        onClick={() => client.control(status?.playing ? "pause" : "play")}
      >
        {status?.playing ? "⏸" : "▶"}
      </button>
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => client.control("speed", s)}
            className={`px-2 py-0.5 rounded text-xs ${
              status?.speed === s ? "bg-zinc-200 text-black" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {s}×
          </button>
        ))}
      </div>
      {state?.total_laps && (
        <input
          type="range"
          min={1}
          max={state.total_laps}
          value={state.leader_lap}
          onChange={(e) => client.control("seek", Number(e.target.value))}
          className="flex-1 accent-zinc-300"
        />
      )}
      <span className="font-mono text-zinc-400 whitespace-nowrap">
        L{state?.leader_lap ?? "—"}/{state?.total_laps ?? "—"}
      </span>
      <span
        className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
          state?.track_status === "green"
            ? "bg-green-900 text-green-300"
            : state?.track_status === "red"
              ? "bg-red-900 text-red-300"
              : "bg-yellow-900 text-yellow-300"
        }`}
      >
        {state?.track_status ?? "—"}
      </span>
    </div>
  );
}
