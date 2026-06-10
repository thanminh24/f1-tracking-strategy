"use client";
// Client shell of the replay dashboard: owns the WS client lifecycle.
import { useEffect, useMemo } from "react";
import { GapChart } from "../../../components/gap-chart";
import { PlaybackControls } from "../../../components/playback-controls";
import { StintBars } from "../../../components/stint-bars";
import { TimingTower } from "../../../components/timing-tower";
import { TrackMap } from "../../../components/track-map";
import { ReplayWsClient } from "../../../lib/ws-replay-client";

export function ReplayDashboard({ sessionKey }: { sessionKey: string }) {
  const client = useMemo(() => new ReplayWsClient(sessionKey), [sessionKey]);

  useEffect(() => {
    client.connect();
    return () => client.close();
  }, [client]);

  return (
    <div className="flex flex-col gap-3 h-full">
      <PlaybackControls client={client} />
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3 flex-1 min-h-0">
        <div className="flex flex-col gap-3 min-h-0">
          <div className="border border-zinc-800 rounded-lg p-2 flex-1 min-h-[300px]">
            <TrackMap sessionKey={sessionKey} />
          </div>
          <div className="border border-zinc-800 rounded-lg p-2">
            <GapChart sessionKey={sessionKey} />
          </div>
        </div>
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          <div className="border border-zinc-800 rounded-lg py-2">
            <TimingTower />
          </div>
          <div className="border border-zinc-800 rounded-lg p-3">
            <div className="text-xs uppercase text-zinc-500 mb-2">stints</div>
            <StintBars sessionKey={sessionKey} />
          </div>
        </div>
      </div>
    </div>
  );
}
