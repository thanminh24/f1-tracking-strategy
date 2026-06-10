// Season grid — archive entry point.
import Link from "next/link";
import { LoadRaceForm } from "../components/load-race-form";
import { api } from "../lib/api-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let seasons: number[] = [];
  let error = "";
  try {
    seasons = await api.seasons();
  } catch {
    error = "backend unreachable — start it with `make dev-backend`";
  }
  return (
    <main className="max-w-3xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-1">F1 Strategy Viewer</h1>
      <p className="text-zinc-500 mb-8 text-sm">
        archive · replay · telemetry · probabilistic strategy
      </p>
      <LoadRaceForm />
      {error && <p className="text-red-400 mt-6">{error}</p>}
      <div className="grid grid-cols-3 gap-4 mt-6">
        {seasons.map((year) => (
          <Link
            key={year}
            href={`/season/${year}`}
            className="border border-zinc-800 rounded-lg p-6 text-center text-xl font-bold hover:border-zinc-500 hover:bg-zinc-900 transition"
          >
            {year}
          </Link>
        ))}
      </div>
    </main>
  );
}
