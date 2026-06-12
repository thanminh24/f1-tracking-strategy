// Weekend list for one season; links go straight to the race replay.
import Link from "next/link";
import { AppShell } from "../../../components/layout/app-shell";
import { Panel } from "../../../components/layout/panel";
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
    <AppShell headerLabel={`${year} Season`}>
      <div className="max-w-3xl mx-auto p-6">
        <Link href="/" className="text-f1-muted text-sm hover:text-f1-text transition-colors">
          ← seasons
        </Link>
        <Panel title={`${year} — ${events.length} races`} className="mt-4">
          <div className="divide-y divide-f1-border">
            {events.map((ev) => (
              <div
                key={ev.round}
                className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
              >
                <div>
                  <div className="font-semibold text-sm">
                    R{ev.round} · {ev.event_name}
                  </div>
                  <div className="text-f1-muted text-xs mt-0.5">
                    {ev.circuit}
                    {ev.country ? ` · ${ev.country}` : ""}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {ev.session_types.includes("R") && (
                    <Link
                      href={`/session/${year}_${ev.round}_R`}
                      className="px-3 py-1.5 rounded bg-f1-red text-white text-xs font-bold hover:bg-red-700 transition-colors"
                    >
                      ▶ Replay
                    </Link>
                  )}
                  <Link
                    href={`/session/${year}_${ev.round}_R/telemetry`}
                    className="px-3 py-1.5 rounded border border-f1-border text-xs hover:border-f1-red hover:text-f1-text transition-colors"
                  >
                    Telemetry
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
