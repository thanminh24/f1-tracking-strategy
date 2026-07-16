"use client";

import type { LapRow, RuntimeCapabilities } from "../../lib/types";
import type { SessionDataSource } from "../../lib/session-source";
import { hasLiveComms } from "../../lib/session-source";
import type { FeederClient } from "../../lib/feeder-client";
import { useResizablePanels } from "../../lib/use-resizable-panels";
import { TimingTower } from "../timing-tower";
import { TrackMap } from "../track-map";
import { RaceControlLog } from "../race/race-control-log";
import { TeamRadioTimeline } from "../widgets/team-radio-timeline";
import { DriverFocusCard } from "../race/driver-focus-card";
import { PlaybackControls } from "../playback-controls";
import { ResizeHandle } from "./resize-handle";

function Panel({
  title,
  subtitle,
  children,
  accent = "rgba(255,255,255,0.08)",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  accent?: string;
}) {
  return (
    <section
      className="broadcast-panel min-h-0 flex flex-col overflow-hidden rounded-[14px] border border-f1-border bg-f1-surface/85 p-2 h-full"
      style={{ boxShadow: `inset 0 1px 0 ${accent}` }}
    >
      <div className="flex items-center justify-between gap-3 px-2 pb-2 border-b border-f1-border/70 shrink-0">
        <div>
          <h3 className="text-[11px] font-semibold tracking-[0.24em] uppercase text-f1-text">{title}</h3>
          {subtitle ? <p className="text-[11px] text-f1-muted mt-0.5">{subtitle}</p> : null}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function BroadcastDriverGlance() {
  return <DriverFocusCard fallback="leader" />;
}

export function BroadcastRaceView({
  sessionKey,
  client,
  laps,
  circuit,
  circuitKey,
  sessionYear,
  capabilities,
  dataSource,
}: {
  sessionKey: string;
  client: FeederClient | null;
  laps: LapRow[];
  circuit?: string;
  circuitKey?: number;
  sessionYear?: number;
  capabilities: RuntimeCapabilities | null;
  dataSource: SessionDataSource;
}) {
  const showComms = hasLiveComms(dataSource);
  const { sizes, startDrag, moveDrag, endDrag } = useResizablePanels(
    showComms ? "f1-pw:broadcast-layout" : "f1-pw:broadcast-archive-layout",
    showComms
      ? { tower: 380, bottom: 240, bottomLeft: 300, bottomMid: 340 }
      : { tower: 380, bottom: 280 },
    showComms
      ? { tower: 280, bottom: 160, bottomLeft: 220, bottomMid: 220 }
      : { tower: 280, bottom: 180 },
  );

  return (
    <div className="broadcast-shell flex h-full min-h-0 flex-col gap-2 p-2">
      <div className="rounded-[16px] border border-f1-border bg-[linear-gradient(135deg,rgba(225,6,0,0.18),rgba(255,255,255,0.02)_34%,rgba(0,0,0,0.14))] px-3 py-3 shrink-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.34em] text-f1-red">Broadcast workspace</p>
        <h2 className="mt-1 text-base font-semibold tracking-[0.14em] uppercase text-f1-text">
          {dataSource === "live" ? "Live race desk" : dataSource === "fixture" ? "Fixture desk" : "Archive replay desk"}
        </h2>
        {dataSource !== "live" ? (
          <div className="mt-3 rounded-[12px] border border-f1-border bg-f1-panel/80">
            <PlaybackControls client={client} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="min-h-0 shrink-0" style={{ width: sizes.tower }}>
          <Panel title="Leaderboard" subtitle="Timing, gaps, sectors, and tyre callouts" accent="rgba(225,6,0,0.22)">
            <div className="h-full overflow-y-auto scrollbar-thin">
              <TimingTower laps={laps} />
            </div>
          </Panel>
        </div>

        <ResizeHandle
          axis="x"
          onPointerDown={startDrag("tower", "x")}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
        />

        <div className="min-h-0 flex-1 min-w-0">
          <Panel title="Track Map" subtitle="Position focus, DRS zones, telemetry overlay" accent="rgba(255,255,255,0.12)">
            <div className="h-full min-h-[18rem]">
              <TrackMap sessionKey={sessionKey} circuit={circuit} circuitKey={circuitKey} sessionYear={sessionYear} />
            </div>
          </Panel>
        </div>
      </div>

      <ResizeHandle
        axis="y"
        onPointerDown={startDrag("bottom", "y", true)}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
      />

      {showComms ? (
        <div className="flex min-h-0 shrink-0" style={{ height: sizes.bottom }}>
          <div className="min-h-0 shrink-0" style={{ width: sizes.bottomLeft }}>
            <Panel title="Race Control" subtitle="Full message log — flags, SC, incidents" accent="rgba(245,158,11,0.16)">
              <RaceControlLog />
            </Panel>
          </div>

          <ResizeHandle
            axis="x"
            onPointerDown={startDrag("bottomLeft", "x")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />

          <div className="min-h-0 shrink-0" style={{ width: sizes.bottomMid }}>
            <Panel title="Team Radio Log" subtitle="Text · audio · optional live transcription" accent="rgba(34,211,238,0.16)">
              <TeamRadioTimeline sessionKey={sessionKey} asrAvailable={capabilities?.features.radio_asr} />
            </Panel>
          </div>

          <ResizeHandle
            axis="x"
            onPointerDown={startDrag("bottomMid", "x")}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
          />

          <div className="min-h-0 flex-1 min-w-0">
            <Panel
              title="Driver Focus"
              subtitle="Leader timing · tyres · compact RL glance"
              accent="rgba(34,197,94,0.12)"
            >
              <div className="h-full overflow-y-auto scrollbar-thin">
                <BroadcastDriverGlance />
              </div>
            </Panel>
          </div>
        </div>
      ) : (
        <div className="min-h-0 shrink-0 flex flex-col" style={{ height: sizes.bottom }}>
          <Panel
            title="Driver Focus"
            subtitle="Leader timing · tyres · compact RL glance"
            accent="rgba(34,197,94,0.12)"
          >
            <div className="h-full overflow-y-auto scrollbar-thin">
              <BroadcastDriverGlance />
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
