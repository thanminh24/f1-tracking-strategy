"use client";

import type { LapRow } from "../../lib/types";
import type { SessionDataSource } from "../../lib/session-source";
import { hasLiveComms } from "../../lib/session-source";
import { FeederClient } from "../../lib/feeder-client";
import { useResizablePanels } from "../../lib/use-resizable-panels";
import { DriverFocusCard } from "../race/driver-focus-card";
import { PlaybackControls } from "../playback-controls";
import { StintBars } from "../stint-bars";
import { StrategyPanel } from "../strategy/strategy-panel";
import { RaceControlStrip } from "../race/race-control-log";
import { TimingTower } from "../timing-tower";
import { TrackMap } from "../track-map";
import { useRaceStateStore } from "../../lib/race-state-store";
import { ResizeHandle } from "./resize-handle";

export function PitWallRaceView({
  sessionKey,
  client,
  laps,
  circuit,
  circuitKey,
  sessionYear,
  dataSource,
  radioAsrAvailable = false,
}: {
  sessionKey: string;
  client: FeederClient | null;
  laps: LapRow[];
  circuit?: string;
  circuitKey?: number;
  sessionYear?: number;
  dataSource: SessionDataSource;
  radioAsrAvailable?: boolean;
}) {
  const showComms = hasLiveComms(dataSource);
  const { sizes, startDrag, moveDrag, endDrag } = useResizablePanels(
    "f1-pw:pit-wall-layout",
    { left: 360, right: 420, focus: 384, centerTop: 26 },
    { left: 260, right: 280, focus: 280, centerTop: 18 },
  );

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden xl:flex flex-col shrink-0 border-r border-f1-border bg-f1-surface/35" style={{ width: sizes.left }}>
        <div className="px-3 py-2 border-b border-f1-border">
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-f1-text-dim">Strategy Desk</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          <StrategyPanel sessionKey={sessionKey} asrAvailable={radioAsrAvailable} />
        </div>
      </div>

      <ResizeHandle
        axis="x"
        className="hidden xl:block"
        onPointerDown={startDrag("left", "x")}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      />

      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="flex border-b border-f1-border min-h-0 shrink-0" style={{ height: `${sizes.centerTop}rem` }}>
          <div
            className="min-h-0 overflow-y-auto border-r border-f1-border bg-f1-surface/25 shrink-0"
            style={{ width: sizes.focus }}
          >
            <DriverFocusCard />
          </div>

          <ResizeHandle
            axis="x"
            onPointerDown={startDrag("focus", "x")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />

          <div className="relative min-h-0 flex-1">
            <TrackMap sessionKey={sessionKey} circuit={circuit} circuitKey={circuitKey} sessionYear={sessionYear} />
          </div>
        </div>

        <ResizeHandle
          axis="y"
          onPointerDown={startDrag("centerTop", "y", true)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        />

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {showComms ? (
            <div className="border-t border-f1-border bg-f1-surface/60 shrink-0">
              <RaceControlStrip />
            </div>
          ) : null}
          <div className="border-t border-f1-border shrink-0">
            <PlaybackControls client={client} />
          </div>
          <div className="px-3 py-2 border-t border-f1-border bg-f1-surface/35 shrink-0">
            <StintBars />
          </div>
        </div>
      </div>

      <ResizeHandle
        axis="x"
        onPointerDown={startDrag("right", "x", true)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      />

      <div className="shrink-0 flex flex-col min-h-0 bg-f1-surface/20" style={{ width: sizes.right }}>
        <div className="px-3 py-2 border-b border-f1-border">
          <span className="text-xs font-semibold tracking-[0.18em] uppercase text-f1-text-dim">Timing</span>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <TimingTower laps={laps} />
        </div>
      </div>
    </div>
  );
}

export function SessionLoadingState({ source }: { source: SessionDataSource }) {
  const mode = useRaceStateStore((s) => s.source);
  return (
    <div className="flex h-full items-center justify-center bg-f1-bg">
      <div className="border border-f1-border bg-f1-panel px-5 py-4 text-sm text-f1-text-dim">
        {source === "live" || mode === "live" ? "Connecting to latest live session..." : "Loading replay session..."}
      </div>
    </div>
  );
}
