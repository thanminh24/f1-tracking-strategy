"use client";
// ARCHIVE ↔ LIVE source toggle. Calls FeederClient.setSource() and syncs to
// the global Zustand store so RaceHeader can show the LIVE badge independently.
import { useState } from "react";
import type { FeederClient } from "../../lib/feeder-client";
import { useRaceStateStore } from "../../lib/race-state-store";

interface SourceToggleProps {
  client: FeederClient;
}

export function SourceToggle({ client }: SourceToggleProps) {
  const source = useRaceStateStore((s) => s.source);
  const setStoreSource = useRaceStateStore((s) => s.setSource);
  const [switching, setSwitching] = useState(false);

  async function toggle() {
    const next = source === "archive" ? "live" : "archive";
    setSwitching(true);
    try {
      await client.setSource(next);
      setStoreSource(next);
    } catch (err) {
      console.error("source switch failed", err);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={switching}
      title={source === "archive" ? "Switch to live timing" : "Switch to archive replay"}
      className={[
        "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold transition-all",
        switching ? "opacity-50 cursor-wait" : "cursor-pointer",
        source === "live"
          ? "bg-f1-red/20 text-f1-red border border-f1-red/40 hover:bg-f1-red/30"
          : "bg-f1-panel border border-f1-border text-f1-muted hover:text-f1-text hover:border-f1-red/40",
      ].join(" ")}
    >
      {source === "live" ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-f1-red animate-pulse" />
          LIVE
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-f1-muted" />
          ARCHIVE
        </>
      )}
    </button>
  );
}
