// Weekend list for one season; links go straight to the race replay.
import Link from "next/link";
import { api } from "../../../lib/api-client";

export const dynamic = "force-dynamic";

export default async function SeasonPage({
  params,
}: {
  params: Promise<{ year: string }>;
}) {
  const { year } = await params;
  const events = await api.events(Number(year)).catch(() => []);

  return (
    <main className="max-w-3xl mx-auto p-8">
      <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300">
        ← seasons
      </Link>
      <h1 className="text-2xl font-bold my-4">{year} Season</h1>
      <div className="space-y-2">
        {events.map((ev) => (
          <div
            key={ev.round}
            className="flex items-center justify-between border border-zinc-800 rounded-lg p-4"
          >
            <div>
              <div className="font-bold">
                R{ev.round} · {ev.event_name}
              </div>
              <div className="text-zinc-500 text-sm">
                {ev.circuit}
                {ev.country ? ` · ${ev.country}` : ""}
              </div>
            </div>
            <div className="flex gap-2">
              {ev.session_types.includes("R") && (
                <Link
                  href={`/session/${year}_${ev.round}_R`}
                  className="px-3 py-1.5 rounded bg-zinc-200 text-black text-sm font-bold hover:bg-white"
                >
                  ▶ Replay
                </Link>
              )}
              <Link
                href={`/session/${year}_${ev.round}_R/telemetry`}
                className="px-3 py-1.5 rounded border border-zinc-700 text-sm hover:border-zinc-500"
              >
                Telemetry
              </Link>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
