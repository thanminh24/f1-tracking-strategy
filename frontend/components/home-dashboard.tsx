"use client";
import { AppShell } from "./shell/app-shell";
import { F1Logo } from "./ui/f1-logo";
import { LiveSessionCard } from "./home/live-session-card";
import { ReplayBrowserCard } from "./home/replay-browser-card";
import { QuickSessionEntry } from "./home/quick-session-entry";
import { BackendOfflineCard } from "./home/backend-offline-card";

interface LiveSession {
  session_key: string | null;
  openf1_key: number | null;
  status: string;
  session_type?: string;
  circuit?: string;
  year?: number;
}

interface Props {
  seasons: number[];
  liveSession: LiveSession | null;
  backendOnline?: boolean;
}

export function HomeDashboard({ seasons, liveSession, backendOnline = true }: Props) {
  const liveAvailable = liveSession?.session_key != null;
  const isOffline = !backendOnline && seasons.length === 0 && !liveAvailable;

  return (
    <AppShell>
      <div className="flex flex-col items-center justify-center min-h-full gap-8 p-6">
        {/* Hero */}
        <div className="flex flex-col items-center gap-3 text-center">
          <F1Logo className="h-10 w-auto" />
          <h1 className="text-2xl font-bold text-f1-text tracking-tight">Pit Wall</h1>
          <p className="text-sm text-f1-text-dim max-w-sm">
            Real-time F1 strategy dashboard with RL model recommendations
          </p>
        </div>

        {/* Offline fallback — replaces all cards */}
        {isOffline && <BackendOfflineCard />}

        {/* Main content: two-card layout + quick entry */}
        {!isOffline && (
          <>
            {/* Two-card grid: LIVE | REPLAY */}
            <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl">
              <div className="flex-1">
                <LiveSessionCard liveSession={liveSession} />
              </div>
              <div className="flex-1">
                <ReplayBrowserCard seasons={seasons} backendOnline={backendOnline} />
              </div>
            </div>

            {/* Quick session entry — always visible power-user shortcut */}
            <QuickSessionEntry />
          </>
        )}
      </div>
    </AppShell>
  );
}
