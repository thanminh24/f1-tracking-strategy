"use client";
// Home screen — lives inside AppShell so it looks like the app, not an external chooser.
// Two tabs: Live (schedule + join) and Archive (year/event/session picker with ensure).
import { useState } from "react";
import { AppShell } from "./shell/app-shell";
import { BackendOfflineCard } from "./home/backend-offline-card";
import { LiveSchedule } from "./home/live-schedule";
import { ArchiveBrowser } from "./home/archive-browser";
import type { ScheduleSession } from "../lib/api-client";

interface Props {
  schedule: ScheduleSession[];
  backendOnline: boolean;
}

type HomeTab = "live" | "archive";

export function HomeDashboard({ schedule, backendOnline }: Props) {
  const hasLiveActivity = schedule.some(
    (s) => s.status === "active" || s.status === "upcoming"
  );
  const [tab, setTab] = useState<HomeTab>(hasLiveActivity ? "live" : "archive");

  if (!backendOnline) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
          <BackendOfflineCard />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Tab bar — same style as the session dashboard tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-f1-border bg-f1-surface shrink-0">
        <button
          onClick={() => setTab("live")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
            tab === "live"
              ? "bg-f1-panel text-f1-text"
              : "text-f1-text-dim hover:text-f1-text hover:bg-f1-panel/50"
          }`}
        >
          {hasLiveActivity && (
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-f1-red live-pulse" />
          )}
          Live
        </button>
        <button
          onClick={() => setTab("archive")}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold transition-colors ${
            tab === "archive"
              ? "bg-f1-panel text-f1-text"
              : "text-f1-text-dim hover:text-f1-text hover:bg-f1-panel/50"
          }`}
        >
          Archive
        </button>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        {tab === "live" ? (
          <LiveSchedule
            initialSchedule={schedule.filter((s) => s.status !== "recent")}
          />
        ) : (
          <ArchiveBrowser />
        )}
      </div>
    </AppShell>
  );
}
