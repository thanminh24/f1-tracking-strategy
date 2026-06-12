"use client";

interface LiveSession {
  session_key: string | null;
  openf1_key: number | null;
  status: string;
  session_type?: string;
  circuit?: string;
  year?: number;
}

interface Props {
  liveSession: LiveSession | null;
}

export function LiveSessionCard({ liveSession }: Props) {
  const liveAvailable = liveSession?.session_key != null;

  if (!liveAvailable) {
    return (
      <div className="w-full max-w-sm rounded-xl border-2 border-f1-border bg-f1-panel/50 px-5 py-4 opacity-60">
        <div className="text-sm font-semibold text-f1-text-dim">● LIVE</div>
        <div className="text-base font-semibold text-f1-text mt-2">No live session active</div>
        <div className="text-xs text-f1-text-dim mt-1">Check back during a race weekend</div>
      </div>
    );
  }

  return (
    <a
      href={`/session/${liveSession.session_key}?source=live`}
      className="w-full max-w-sm rounded-xl border-2 border-f1-red bg-f1-panel px-5 py-4 hover:bg-f1-panel-hover transition-colors group"
    >
      <div className="flex items-center justify-between mb-1">
        <span className="chip bg-red-900/60 text-f1-red border border-f1-red/40 live-pulse">
          ● LIVE
        </span>
        <span className="text-xs text-f1-text-dim font-data">{liveSession.year}</span>
      </div>
      <div className="text-base font-semibold text-f1-text mt-2">
        {liveSession.circuit ?? "Live Session"}
      </div>
      <div className="text-sm text-f1-text-dim">
        {liveSession.session_type ?? liveSession.status}
      </div>
      <div className="mt-3 text-xs text-f1-red group-hover:underline">Join →</div>
    </a>
  );
}
