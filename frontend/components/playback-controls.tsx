"use client";
import { useRaceStateStore } from "../lib/race-state-store";
import { useKeyboardShortcuts } from "../lib/use-keyboard-shortcuts";
import type { FeederClient } from "../lib/feeder-client";

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

const SPEEDS = [0.5, 1, 2, 4, 8];

interface Props {
  client: FeederClient | null;
}

export function PlaybackControls({ client }: Props) {
  const status = useRaceStateStore((s) => s.status);
  const connected = useRaceStateStore((s) => s.connected);
  const source = useRaceStateStore((s) => s.source);

  // Keyboard shortcuts for playback controls (archive mode only)
  useKeyboardShortcuts(
    source === "archive" && status && connected
      ? {
          " ": () => client?.control(status.playing ? "pause" : "play"),
          ArrowRight: () => client?.control("seek", status.t_session_s + 5),
          ArrowLeft: () => client?.control("seek", Math.max(0, status.t_session_s - 5)),
          "]": () => {
            const currentIdx = SPEEDS.indexOf(status.speed);
            const nextIdx = (currentIdx + 1) % SPEEDS.length;
            client?.control("speed", SPEEDS[nextIdx]);
          },
          "[": () => {
            const currentIdx = SPEEDS.indexOf(status.speed);
            const prevIdx = currentIdx === 0 ? SPEEDS.length - 1 : currentIdx - 1;
            client?.control("speed", SPEEDS[prevIdx]);
          },
          "+": () => {
            const currentIdx = SPEEDS.indexOf(status.speed);
            const nextIdx = (currentIdx + 1) % SPEEDS.length;
            client?.control("speed", SPEEDS[nextIdx]);
          },
          "-": () => {
            const currentIdx = SPEEDS.indexOf(status.speed);
            const prevIdx = currentIdx === 0 ? SPEEDS.length - 1 : currentIdx - 1;
            client?.control("speed", SPEEDS[prevIdx]);
          },
        }
      : {},
  );

  // Hide for live source — no scrubbing on real-time feed
  if (source === "live") {
    return (
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="chip bg-red-900/60 text-f1-red border border-f1-red/40 text-[10px]">
          ● LIVE
        </span>
        <span className="text-xs text-f1-text-dim font-data">
          {connected ? "Connected" : "Connecting…"}
        </span>
      </div>
    );
  }

  if (!status) return null;

  const playing = status.playing;

  return (
    <div className="flex items-center gap-2 px-3 py-2 flex-wrap">
      {/* play/pause */}
      <button
        onClick={() => client?.control(playing ? "pause" : "play")}
        disabled={!connected}
        className="w-8 h-8 flex items-center justify-center rounded bg-f1-panel border border-f1-border hover:border-f1-border-light disabled:opacity-40 transition-colors text-f1-text"
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
            <rect x="3" y="2" width="4" height="12" rx="1" />
            <rect x="9" y="2" width="4" height="12" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current">
            <path d="M4 2l10 6-10 6V2z" />
          </svg>
        )}
      </button>

      {/* time */}
      <span className="font-data text-sm text-f1-text-dim w-12">
        {fmtTime(status.t_session_s)}
      </span>

      {/* speed selector */}
      <div className="flex items-center gap-0.5">
        {SPEEDS.map((spd) => (
          <button
            key={spd}
            onClick={() => client?.control("speed", spd)}
            disabled={!connected}
            className={`px-1.5 py-0.5 rounded text-[11px] font-data transition-colors disabled:opacity-40 ${
              status.speed === spd
                ? "bg-f1-red text-white"
                : "bg-f1-panel border border-f1-border text-f1-text-dim hover:text-f1-text"
            }`}
          >
            {spd}×
          </button>
        ))}
      </div>

      {status.finished && (
        <span className="text-xs text-f1-amber font-data">Session ended</span>
      )}
    </div>
  );
}
