"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { FeederClient } from "../../../lib/feeder-client";
import { api } from "../../../lib/api-client";
import { useKeyboardShortcuts } from "../../../lib/use-keyboard-shortcuts";
import { useLiveTelemetryStore } from "../../../lib/live-telemetry-store";
import { usePredictionStore } from "../../../lib/prediction-store";
import { useRaceStateStore } from "../../../lib/race-state-store";
import type { LapRow, RuntimeCapabilities, StintRow, WorkspaceMode } from "../../../lib/types";
import { useWorkspaceStore } from "../../../lib/workspace-store";
import { AppShell } from "../../../components/shell/app-shell";
import { HelpLegendModal } from "../../../components/widgets/help-legend-modal";
import { BroadcastRaceView } from "../../../components/workspace/broadcast-race-view";
import { PitWallRaceView, SessionLoadingState } from "../../../components/workspace/pit-wall-race-view";
import { TelemetryView } from "../../../components/telemetry/telemetry-view";
import { StatsTab } from "../../../components/stats/stats-tab";

type Tab = "race" | "telemetry" | "stats";

const TABS: { id: Tab; label: string; shortcut: string }[] = [
  { id: "race", label: "Race", shortcut: "1" },
  { id: "telemetry", label: "Telemetry", shortcut: "2" },
  { id: "stats", label: "Stats", shortcut: "3" },
];

interface Props {
  sessionKey: string;
  initialSource: "archive" | "live" | "fixture";
  laps: LapRow[];
  stints: StintRow[];
}

export function SessionDashboard({ sessionKey, initialSource, laps, stints }: Props) {
  const [tab, setTab] = useState<Tab>("race");
  const [showHelp, setShowHelp] = useState(false);
  const [liveCircuit, setLiveCircuit] = useState<string | undefined>(undefined);
  const [liveSessionLabel, setLiveSessionLabel] = useState<string | undefined>(undefined);
  const [capabilities, setCapabilities] = useState<RuntimeCapabilities | null>(null);
  const client = useMemo(() => new FeederClient(sessionKey), [sessionKey]);
  const router = useRouter();
  const searchParams = useSearchParams();
  const workspaceMode = useWorkspaceStore((s) => s.mode);
  const setWorkspaceMode = useWorkspaceStore((s) => s.setMode);
  const raceState = useRaceStateStore((s) => s.state);
  const source = useRaceStateStore((s) => s.source);
  const sessionInfo = useRaceStateStore((s) => s.sessionInfo);
  const liveCircuitKey = sessionInfo?.Meeting?.Circuit?.Key ?? undefined;
  const liveSessionYear = useMemo(() => new Date().getFullYear(), []);

  // Seed the workspace mode from a deep link (?workspace=…) exactly once on mount.
  // The store is the source of truth afterwards; re-importing the URL on every
  // change would fight the store→URL effect below and loop forever (the two would
  // keep swapping values when they disagree, remounting the race view each render).
  const didSeedWorkspace = useRef(false);
  useEffect(() => {
    if (didSeedWorkspace.current) return;
    didSeedWorkspace.current = true;
    const queryMode = searchParams.get("workspace");
    if (queryMode === "broadcast" || queryMode === "pit-wall") {
      setWorkspaceMode(queryMode);
    }
  }, [searchParams, setWorkspaceMode]);

  // Reflect the active workspace mode back into the URL (one-directional).
  useEffect(() => {
    const current = searchParams.get("workspace");
    if (current === workspaceMode) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("workspace", workspaceMode);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
  }, [router, searchParams, workspaceMode]);

  useEffect(() => {
    api.capabilities().then(setCapabilities).catch(() => setCapabilities(null));
  }, []);

  const resolvedCircuit = liveCircuit ?? sessionInfo?.Meeting?.Circuit?.ShortName;

  useEffect(() => {
    useRaceStateStore.getState().clearSessionData(initialSource);
    usePredictionStore.getState().reset();
    useLiveTelemetryStore.getState().reset();

    if (initialSource === "live") {
      api.liveSession()
        .then((info) => {
          if (info.circuit) setLiveCircuit(info.circuit);
          if (info.session_type || info.circuit) {
            setLiveSessionLabel([info.session_type, info.circuit].filter(Boolean).join(" · "));
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
      : initialSource === "fixture"
        ? "DEV FIXTURE · FIXTURE RING"
      : sessionKey.replace(/_/g, " ").toUpperCase();
  const isWaitingForCurrentSession = raceState !== null && raceState.session_key !== sessionKey;

  const renderRaceView = () => {
    if (isWaitingForCurrentSession) return <SessionLoadingState source={initialSource} />;
    if (workspaceMode === "broadcast") {
      return (
        <BroadcastRaceView
          sessionKey={sessionKey}
          client={client}
          laps={laps}
          circuit={resolvedCircuit}
          circuitKey={liveCircuitKey}
          sessionYear={liveSessionYear}
          capabilities={capabilities}
          dataSource={initialSource}
        />
      );
    }
    return (
      <PitWallRaceView
        sessionKey={sessionKey}
        client={client}
        laps={laps}
        circuit={resolvedCircuit}
        circuitKey={liveCircuitKey}
        sessionYear={liveSessionYear}
        dataSource={initialSource}
        radioAsrAvailable={capabilities?.features.radio_asr}
      />
    );
  };

  return (
    <>
      <AppShell
        sessionLabel={sessionLabel}
        sessionKey={sessionKey}
        sourceMode={source}
        workspaceMode={workspaceMode}
        onWorkspaceChange={(mode: WorkspaceMode) => setWorkspaceMode(mode)}
      >
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

        <div className="flex-1 min-h-0 overflow-hidden">
          {tab === "race" ? renderRaceView() : tab === "telemetry" ? (
            <TelemetryView sessionKey={sessionKey} laps={laps} />
          ) : (
            <StatsTab laps={laps} stints={stints} dataSource={initialSource} sessionKey={sessionKey} />
          )}
        </div>
      </AppShell>
      <HelpLegendModal isOpen={showHelp} onClose={() => setShowHelp(false)} />
    </>
  );
}
