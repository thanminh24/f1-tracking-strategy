"use client";
// Main interactive session dashboard — WebSocket lifecycle, tab routing, layout.
import { useEffect, useMemo, useState } from "react";
import { FeederClient } from "../../../lib/feeder-client";
import { useLiveTelemetryStore } from "../../../lib/live-telemetry-store";
import { usePredictionStore } from "../../../lib/prediction-store";
import { useRaceStateStore } from "../../../lib/race-state-store";
import { useKeyboardShortcuts } from "../../../lib/use-keyboard-shortcuts";
import { AppShell } from "../../../components/shell/app-shell";
import { TimingTower } from "../../../components/timing-tower";
import { TrackMap } from "../../../components/track-map";
import { PlaybackControls } from "../../../components/playback-controls";
import { StintBars } from "../../../components/stint-bars";
import { DriverFocusCard } from "../../../components/race/driver-focus-card";
import { RaceControlStrip } from "../../../components/race/race-control-strip";
import { TelemetryView } from "../../../components/telemetry/telemetry-view";
import { StatsTab } from "../../../components/stats/stats-tab";
import { PitStopTimerBoard } from "../../../components/pit-stop-timer-board";
import { HelpLegendModal } from "../../../components/widgets/help-legend-modal";
import { api } from "../../../lib/api-client";
import type { LapRow, StintRow } from "../../../lib/types";

type Tab = "race" | "telemetry" | "stats";

const TABS: { id: Tab; label: string; shortcut: string }[] = [
  { id: "race", label: "Race", shortcut: "1" },
  { id: "telemetry", label: "Telemetry", shortcut: "2" },
  { id: "stats", label: "Stats", shortcut: "3" },
];

interface Props {
  sessionKey: string;
  initialSource: "archive" | "live";
  laps: LapRow[];
  stints: StintRow[];
}

export function SessionDashboard({ sessionKey, initialSource, laps, stints }: Props) {
  const [tab, setTab] = useState<Tab>("race");
  const [showHelp, setShowHelp] = useState(false);
  const [liveCircuit, setLiveCircuit] = useState<string | undefined>(undefined);
  const [liveSessionLabel, setLiveSessionLabel] = useState<string | undefined>(undefined);
  const client = useMemo(() => new FeederClient(sessionKey), [sessionKey]);
  const raceState = useRaceStateStore((s) => s.state);
  const source = useRaceStateStore((s) => s.source);
  const sessionInfo = useRaceStateStore((s) => s.sessionInfo);
  // Prefer circuitKey from live stream (SignalR Core SessionInfo); fall back to 0
  const liveCircuitKey = sessionInfo?.Meeting?.Circuit?.Key ?? undefined;
  const liveSessionYear = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    useRaceStateStore.getState().clearSessionData(initialSource);
    usePredictionStore.getState().reset();
    useLiveTelemetryStore.getState().reset();

    if (initialSource === "live") {
      // Fetch circuit name for live track outline, then start the WS feed
      api.liveSession()
        .then((info) => {
          if (info.circuit) setLiveCircuit(info.circuit);
          if (info.session_type || info.circuit) {
            setLiveSessionLabel(
              [info.session_type, info.circuit].filter(Boolean).join(" · ")
            );
          }
        })
        .catch(() => {})
        .finally(() => {
          fetch(`/api/sessions/${sessionKey}/source/auto`, { method: "POST" })
            .catch(() => {})
            .finally(() => client.connect());
        });
    } else {
      client.connect();
    }

    return () => {
      client.close();
    };
  }, [client, sessionKey, initialSource]);

  useKeyboardShortcuts({
    "1": () => setTab("race"),
    "2": () => setTab("telemetry"),
    "3": () => setTab("stats"),
    "?": () => setShowHelp((s) => !s),
    Escape: () => setShowHelp(false),
  });

  const sessionLabel =
    initialSource === "live"
      ? (liveSessionLabel ?? "LIVE SESSION")
      : sessionKey.replace(/_/g, " ").toUpperCase();
  const isWaitingForCurrentSession =
    raceState !== null && raceState.session_key !== sessionKey;

  return (
    <>
      <AppShell
        sessionLabel={sessionLabel}
        sessionKey={sessionKey}
        sourceMode={source}
      >
        {/* Secondary tab nav bar */}
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-f1-border bg-f1-surface shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
                tab === t.id
                  ? "bg-f1-panel text-f1-text"
                  : "text-f1-text-dim hover:text-f1-text hover:bg-f1-panel/50"
              }`}
            >
              {t.label}
              <span className="text-[9px] text-f1-muted font-mono hidden sm:inline">[{t.shortcut}]</span>
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={() => setShowHelp(true)}
            className="text-xs text-f1-muted hover:text-f1-text-dim px-2 py-1 rounded hover:bg-f1-panel/50 transition-colors"
            title="Show keyboard shortcuts [?]"
          >
            ?
          </button>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === "race" ? (
            isWaitingForCurrentSession ? (
              <SessionLoadingState source={initialSource} />
            ) : (
              <RaceView
              sessionKey={sessionKey}
              client={client}
              laps={laps}
              circuit={liveCircuit}
              circuitKey={liveCircuitKey}
              sessionYear={liveSessionYear}
            />
            )
          ) : tab === "telemetry" ? (
            <TelemetryView sessionKey={sessionKey} laps={laps} />
          ) : (
            <StatsTab laps={laps} stints={stints} />
          )}
        </div>
      </AppShell>
      <HelpLegendModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}

function SessionLoadingState({ source }: { source: "archive" | "live" }) {
  return (
    <div className="flex h-full items-center justify-center bg-f1-bg">
      <div className="border border-f1-border bg-f1-panel px-5 py-4 text-sm text-f1-text-dim">
        {source === "live" ? "Connecting to latest live session..." : "Loading replay session..."}
      </div>
    </div>
  );
}

function RaceView({
  sessionKey,
  client,
  laps,
  circuit,
  circuitKey,
  sessionYear,
}: {
  sessionKey: string;
  client: FeederClient | null;
  laps: LapRow[];
  circuit?: string;
  circuitKey?: number;
  sessionYear?: number;
}) {
  return (
    <div className="flex h-full min-h-0">
      {/* Left panel: DriverFocusCard + PlaybackControls + StintBars */}
      <div className="hidden lg:flex flex-col w-[280px] shrink-0 border-r border-f1-border">
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-2">
          <DriverFocusCard />
        </div>
        <div className="border-t border-f1-border">
          <PlaybackControls client={client} />
        </div>
        <div className="px-2 py-1 border-t border-f1-border">
          <StintBars />
        </div>
      </div>

      {/* Center: track map + race control */}
      <div className="flex flex-col flex-1 min-w-0 border-r border-f1-border">
        <div className="relative flex-1 min-h-0">
          <TrackMap sessionKey={sessionKey} circuit={circuit} circuitKey={circuitKey} sessionYear={sessionYear} />
        </div>
        <div className="border-t border-f1-border bg-f1-surface/50">
          <RaceControlStrip />
        </div>
      </div>

      {/* Right: timing tower + pit stop timer */}
      <div className="w-[300px] shrink-0 overflow-y-auto scrollbar-thin">
        <TimingTower laps={laps} />
        <div className="border-t border-f1-border">
          <PitStopTimerBoard />
        </div>
      </div>
    </div>
  );
}
