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
    <form onSubmit={loadRace} className="border border-zinc-800 rounded-lg p-4 space-y-3">
      <div className="text-xs uppercase text-zinc-500">load race from FastF1</div>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <label className="text-sm text-zinc-400">
          <span className="block mb-1">Year</span>
          <input
            value={year}
            onChange={(event) => setYear(event.target.value)}
            inputMode="numeric"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100"
          />
        </label>
        <label className="text-sm text-zinc-400">
          <span className="block mb-1">Round</span>
          <input
            value={round}
            onChange={(event) => setRound(event.target.value)}
            inputMode="numeric"
            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-zinc-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="self-end px-4 py-2 rounded bg-zinc-200 text-black text-sm font-bold disabled:opacity-50"
        >
          {busy ? "Loading" : "Open"}
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  );
}
