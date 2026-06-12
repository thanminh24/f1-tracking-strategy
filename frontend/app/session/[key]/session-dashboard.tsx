"use client";
// Main interactive session dashboard — WebSocket lifecycle, tab routing, layout.
import { useEffect, useRef, useState } from "react";
import { FeederClient } from "../../../lib/feeder-client";
import { useRaceStateStore } from "../../../lib/race-state-store";
import { AppShell } from "../../../components/shell/app-shell";
import { TimingTower } from "../../../components/timing-tower";
import { TrackMap } from "../../../components/track-map";
import { PlaybackControls } from "../../../components/playback-controls";
import { StintBars } from "../../../components/stint-bars";
import { DriverFocusCard } from "../../../components/race/driver-focus-card";
import { RaceControlStrip } from "../../../components/race/race-control-strip";
import { TelemetryCompare } from "../../../components/telemetry/telemetry-compare";
import type { LapRow, StintRow } from "../../../lib/types";

interface Props {
  sessionKey: string;
  initialSource: "archive" | "live";
  laps: LapRow[];
  stints: StintRow[];
}

export function SessionDashboard({ sessionKey, initialSource, laps, stints }: Props) {
  const [tab, setTab] = useState<"race" | "telemetry">("race");
  const clientRef = useRef<FeederClient | null>(null);
  const source = useRaceStateStore((s) => s.source);
  const setSource = useRaceStateStore((s) => s.setSource);

  // Boot WebSocket on mount; tear down on unmount.
  useEffect(() => {
    setSource(initialSource);
    const client = new FeederClient(sessionKey);
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [sessionKey, initialSource, setSource]);

  const sessionLabel = sessionKey.replace(/_/g, " ").toUpperCase();

  return (
    <AppShell
      sessionLabel={sessionLabel}
      sourceMode={source}
      activeTab={tab}
      onTabChange={(t) => setTab(t as "race" | "telemetry")}
    >
      {tab === "race" ? (
        <RaceView sessionKey={sessionKey} client={clientRef.current} />
      ) : (
        <TelemetryCompare sessionKey={sessionKey} laps={laps} />
      )}
    </AppShell>
  );
}

function RaceView({
  sessionKey,
  client,
}: {
  sessionKey: string;
  client: FeederClient | null;
}) {
  return (
    <div className="flex h-full min-h-0">
      {/* Left panel: DriverFocusCard + PlaybackControls + StintBars (hidden on mobile) */}
      <div className="hidden lg:flex flex-col w-[280px] shrink-0 border-r border-f1-border">
        {/* Driver focus card with fallback to gap chart */}
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2">
          <DriverFocusCard />
        </div>

        {/* Playback controls */}
        <div className="border-t border-f1-border">
          <PlaybackControls client={client} />
        </div>

        {/* Stint bars */}
        <div className="px-2 py-1 border-t border-f1-border">
          <StintBars />
        </div>
      </div>

      {/* Center panel: Track map + race control strip */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-f1-border">
        {/* Track map */}
        <div className="relative flex-1 min-h-0">
          <TrackMap sessionKey={sessionKey} />
        </div>

        {/* Race control messages */}
        <div className="border-t border-f1-border bg-f1-surface/50">
          <RaceControlStrip />
        </div>
      </div>

      {/* Right panel: Timing tower */}
      <div className="w-[300px] shrink-0 overflow-y-auto scrollbar-thin">
        <TimingTower />
      </div>
    </div>
  );
}
