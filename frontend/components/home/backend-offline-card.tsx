"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function BackendOfflineCard() {
  const router = useRouter();
  const [sessionKey, setSessionKey] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionKey.trim()) {
      router.push(`/session/${sessionKey.trim()}`);
    }
  };

  return (
    <div className="w-full max-w-sm flex flex-col gap-4">
      {/* Offline notice */}
      <div className="rounded-xl border-2 border-f1-amber bg-f1-panel px-5 py-4">
        <div className="text-sm font-semibold text-f1-text mb-1">⚠ Backend Offline</div>
        <p className="text-xs text-f1-text-dim">
          Cannot reach the live data server. Try refreshing, or enter a session key manually.
        </p>
      </div>

      {/* Manual session entry form */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <input
          type="text"
          placeholder="e.g. bahrain_2024_race"
          value={sessionKey}
          onChange={(e) => setSessionKey(e.target.value)}
          className="rounded-lg border border-f1-border bg-f1-panel px-4 py-2 text-sm text-f1-text placeholder-f1-muted font-data focus:outline-none focus:border-f1-red"
        />
        <button
          type="submit"
          disabled={!sessionKey.trim()}
          className="rounded-lg border border-f1-border bg-f1-panel px-4 py-2 text-sm font-semibold text-f1-text hover:bg-f1-panel-hover hover:border-f1-border-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Go →
        </button>
      </form>

      {/* Refresh prompt */}
      <button
        onClick={() => window.location.reload()}
        className="text-xs text-f1-text-dim hover:text-f1-text transition-colors"
      >
        or refresh to try again
      </button>
    </div>
  );
}
