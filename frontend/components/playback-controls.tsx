"use client";
// Playback controls: play/pause, speed, seek bar. Space = play/pause.
// Hidden in live mode (no playback concept). Source toggle embedded here.
import { useEffect } from "react";
import type { FeederClient } from "../lib/feeder-client";
import { useRaceStateStore } from "../lib/race-state-store";
import { SourceToggle } from "./layout/source-toggle";

const SPEEDS = [1, 2, 5, 10, 25, 100];

export function PlaybackControls({ client }: { client: FeederClient }) {
  const status = useRaceStateStore((s) => s.status);
  const state = useRaceStateStore((s) => s.state);
  const source = useRaceStateStore((s) => s.source);
  const isLive = source === "live";

  useEffect(() => {
    if (isLive) return; // no keyboard controls in live mode
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        client.control(status?.playing ? "pause" : "play");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [client, status?.playing, isLive]);

  return (
    <div className="flex items-center gap-2 text-xs h-9 px-1">
      {/* Source toggle — always visible */}
      <SourceToggle client={client} />

      {/* Divider */}
      <div className="w-px h-5 bg-f1-border shrink-0" />

      {/* Playback controls hidden in live mode */}
      {!isLive && (
        <>
          <button
            className="w-7 h-7 flex items-center justify-center rounded bg-f1-panel border border-f1-border hover:border-f1-red hover:text-f1-text transition-colors font-bold text-f1-text"
            onClick={() => client.control(status?.playing ? "pause" : "play")}
            title="Space to play/pause"
          >
            {status?.playing ? "⏸" : "▶"}
          </button>

          <div className="flex gap-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => client.control("speed", s)}
                className={[
                  "px-1.5 py-0.5 rounded transition-colors font-mono",
                  status?.speed === s
                    ? "bg-f1-red text-white"
                    : "bg-f1-panel border border-f1-border text-f1-muted hover:text-f1-text",
                ].join(" ")}
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
              className="flex-1 min-w-0"
            />
          )}

          <span className="font-mono text-f1-muted whitespace-nowrap tabular-nums shrink-0">
            L{state?.leader_lap ?? "—"}/{state?.total_laps ?? "—"}
          </span>
        </>
      )}

      {isLive && (
        <span className="text-f1-muted text-xs ml-1">
          Live — lap {state?.leader_lap ?? "…"}/{state?.total_laps ?? "…"}
        </span>
      )}
    </div>
  );
}
