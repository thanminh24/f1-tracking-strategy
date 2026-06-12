"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function QuickSessionEntry() {
  const router = useRouter();
  const [sessionKey, setSessionKey] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (sessionKey.trim()) {
      router.push(`/session/${sessionKey.trim()}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm flex flex-col gap-2">
      <label className="text-xs font-semibold text-f1-text-dim uppercase tracking-widest">
        Quick entry
      </label>
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="e.g. bahrain_2024_race"
          value={sessionKey}
          onChange={(e) => setSessionKey(e.target.value)}
          className="flex-1 rounded-lg border border-f1-border bg-f1-panel px-3 py-2 text-sm text-f1-text placeholder-f1-muted font-data focus:outline-none focus:border-f1-red"
        />
        <button
          type="submit"
          disabled={!sessionKey.trim()}
          className="rounded-lg border border-f1-border bg-f1-panel px-4 py-2 text-sm font-semibold text-f1-text hover:bg-f1-panel-hover hover:border-f1-border-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Go →
        </button>
      </div>
    </form>
  );
}
