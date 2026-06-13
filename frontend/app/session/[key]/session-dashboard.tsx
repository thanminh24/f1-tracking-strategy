"use client";
// Main interactive session dashboard — WebSocket lifecycle, tab routing, layout.
import { useEffect, useMemo, useRef, useState } from "react";
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

  // Derive circuit name from live stream when api.liveSession() has no circuit info
  useEffect(() => {
    const shortName = sessionInfo?.Meeting?.Circuit?.ShortName;
    if (!liveCircuit && shortName) setLiveCircuit(shortName);
  }, [liveCircuit, sessionInfo]);

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

const PANEL_STORAGE_KEY = "f1-pw:panel-sizes";
const MIN_LEFT = 200;
const MIN_RIGHT = 240;

function readPanelSizes(): { left: number; right: number } {
  if (typeof window === "undefined") return { left: 320, right: 380 };
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_STORAGE_KEY) ?? "{}");
    return {
      left: typeof saved.left === "number" ? saved.left : 320,
      right: typeof saved.right === "number" ? saved.right : 380,
    };
  } catch {
    return { left: 320, right: 380 };
  }
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
  const [leftWidth, setLeftWidth] = useState<number>(() => readPanelSizes().left);
  const [rightWidth, setRightWidth] = useState<number>(() => readPanelSizes().right);
  const [showLayout, setShowLayout] = useState(false);
  const dragRef = useRef<{ side: "left" | "right"; startX: number; startWidth: number } | null>(null);

  // Debounced persist to localStorage
  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify({ left: leftWidth, right: rightWidth }));
    }, 200);
    return () => clearTimeout(t);
  }, [leftWidth, rightWidth]);

  const onDragStart = (side: "left" | "right") => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.setAttribute("data-dragging", "");
    dragRef.current = { side, startX: e.clientX, startWidth: side === "left" ? leftWidth : rightWidth };
  };

  const onDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = e.clientX - drag.startX;
    if (drag.side === "left") setLeftWidth(Math.max(MIN_LEFT, drag.startWidth + delta));
    else setRightWidth(Math.max(MIN_RIGHT, drag.startWidth - delta));
  };

  const onDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.removeAttribute("data-dragging");
    dragRef.current = null;
  };

  return (
    <div className="flex h-full min-h-0">
      {/* Left panel */}
      <div className="hidden xl:flex flex-col shrink-0" style={{ width: leftWidth }}>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin p-3">
          <DriverFocusCard />
        </div>
        <div className="border-t border-f1-border">
          <PlaybackControls client={client} />
        </div>
        <div className="px-3 py-2 border-t border-f1-border">
          <StintBars />
        </div>
      </div>

      {/* Left drag handle */}
      <div
        className="drag-handle hidden xl:block"
        onPointerDown={onDragStart("left")}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      />

      {/* Center: track map + race control + layout settings */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        <div className="relative flex-1 min-h-0">
          <TrackMap sessionKey={sessionKey} circuit={circuit} circuitKey={circuitKey} sessionYear={sessionYear} />
        </div>
        <div className="border-t border-f1-border bg-f1-surface/60 shrink-0 flex items-stretch relative">
          <div className="flex-1 min-w-0">
            <RaceControlStrip />
          </div>
          {/* Layout settings toggle */}
          <button
            onClick={() => setShowLayout((s) => !s)}
            title="Adjust column widths"
            className={`px-2.5 shrink-0 border-l border-f1-border text-f1-muted hover:text-f1-text hover:bg-f1-panel transition-colors text-sm ${
              showLayout ? "bg-f1-panel text-f1-text" : ""
            }`}
          >
            ⊞
          </button>

          {/* Layout popover */}
          {showLayout && (
            <div className="absolute bottom-full right-0 mb-1 w-64 bg-f1-panel border border-f1-border shadow-xl z-30 p-3 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-f1-text">Column Widths</span>
                <button
                  onClick={() => { setLeftWidth(320); setRightWidth(380); }}
                  className="text-[10px] text-f1-muted hover:text-f1-text transition-colors"
                >
                  Reset
                </button>
              </div>

              {/* Left panel slider */}
              <div className="hidden xl:block">
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-f1-muted">Left panel</span>
                  <span className="text-[10px] font-data text-f1-text-dim">{leftWidth}px</span>
                </div>
                <input
                  type="range"
                  min={MIN_LEFT}
                  max={520}
                  value={leftWidth}
                  onChange={(e) => setLeftWidth(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5"
                />
                <div className="flex justify-between text-[9px] text-f1-muted mt-0.5">
                  <span>{MIN_LEFT}</span><span>520</span>
                </div>
              </div>

              {/* Right panel slider */}
              <div>
                <div className="flex justify-between mb-1">
                  <span className="text-[10px] text-f1-muted">Right panel</span>
                  <span className="text-[10px] font-data text-f1-text-dim">{rightWidth}px</span>
                </div>
                <input
                  type="range"
                  min={MIN_RIGHT}
                  max={540}
                  value={rightWidth}
                  onChange={(e) => setRightWidth(Number(e.target.value))}
                  className="w-full accent-blue-500 h-1.5"
                />
                <div className="flex justify-between text-[9px] text-f1-muted mt-0.5">
                  <span>{MIN_RIGHT}</span><span>540</span>
                </div>
              </div>

              <p className="text-[9px] text-f1-muted">
                Drag the ▌ handles between panels to resize. Sizes are remembered.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right drag handle */}
      <div
        className="drag-handle"
        onPointerDown={onDragStart("right")}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
      />

      {/* Right: timing tower + pit stop timer */}
      <div className="shrink-0 flex flex-col min-h-0" style={{ width: rightWidth }}>
        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
          <TimingTower laps={laps} />
        </div>
        <div className="border-t border-f1-border shrink-0">
          <PitStopTimerBoard />
        </div>
      </div>
    </div>
  );
}
