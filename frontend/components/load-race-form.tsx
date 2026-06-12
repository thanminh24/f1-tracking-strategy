"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api-client";

export function LoadRaceForm() {
  const router = useRouter();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [round, setRound] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadRace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const key = `${year}_${round}_R`;
    try {
      await api.ensureSession(key);
      router.push(`/session/${key}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "race load failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={loadRace} className="border border-f1-border rounded-lg p-4 space-y-3">
      <div className="text-xs uppercase text-f1-muted">
        load race from FastF1 — view only, not archived
      </div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <label className="text-sm text-f1-muted">
          <span className="block mb-1">Year</span>
          <input
            value={year}
            onChange={(event) => setYear(event.target.value)}
            inputMode="numeric"
            className="w-full bg-f1-surface border border-f1-border rounded px-3 py-2 text-f1-text focus:outline-none focus:border-f1-red"
          />
        </label>
        <label className="text-sm text-f1-muted">
          <span className="block mb-1">Round</span>
          <input
            value={round}
            onChange={(event) => setRound(event.target.value)}
            inputMode="numeric"
            className="w-full bg-f1-surface border border-f1-border rounded px-3 py-2 text-f1-text focus:outline-none focus:border-f1-red"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-end px-4 py-2 rounded bg-f1-red text-white text-sm font-bold disabled:opacity-50 hover:bg-red-700 transition-colors"
        >
          {busy ? "Loading" : "Open"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
