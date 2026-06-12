"use client";
// Client shell of the replay dashboard. Owns the WS client lifecycle and
// composes all panels into a 3-column pit-wall layout.
import { useEffect, useMemo } from "react";
import { GapChart } from "../../../components/gap-chart";
import { Panel } from "../../../components/layout/panel";
import { PlaybackControls } from "../../../components/playback-controls";
import { StintBars } from "../../../components/stint-bars";
import { StrategyPanel } from "../../../components/strategy-overlay/strategy-panel";
import { TimingTower } from "../../../components/timing-tower";
import { TrackMap } from "../../../components/track-map";
import { FeederClient } from "../../../lib/feeder-client";

export function ReplayDashboard({ sessionKey }: { sessionKey: string }) {
  const client = useMemo(() => new FeederClient(sessionKey), [sessionKey]);

  useEffect(() => {
    client.connect();
    return () => client.close();
  }, [client]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls bar */}
      <div className="shrink-0 border-b border-f1-border bg-f1-panel px-3">
        <PlaybackControls client={client} />
      </div>

      {/*
        Main grid — 3 columns at ≥1024px, stacked below that:
        [track map + gap chart] | [timing tower + stints] | [strategy]
      */}
      <div className="flex-1 min-h-0 overflow-hidden p-3 grid gap-3
        grid-cols-1
        lg:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_minmax(0,1.2fr)]">

        {/* Left: track map + gap chart */}
        <div className="flex flex-col gap-3 min-h-0">
          <Panel noPad className="flex-1 min-h-[280px]">
            <TrackMap sessionKey={sessionKey} />
          </Panel>
          <Panel title="Gap to Leader" noPad>
            <GapChart sessionKey={sessionKey} />
          </Panel>
        </div>

        {/* Center: timing tower + stint bars */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          <Panel title="Timing Tower" noPad className="flex-1 overflow-y-auto">
            <TimingTower />
          </Panel>
          <Panel title="Stints">
            <StintBars sessionKey={sessionKey} />
          </Panel>
        </div>

        {/* Right: strategy overlay */}
        <div className="flex flex-col min-h-0 overflow-y-auto">
          <StrategyPanel sessionKey={sessionKey} />
        </div>
      </div>
    </div>
  );
}
