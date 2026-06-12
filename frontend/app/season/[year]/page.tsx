import { api } from "../../../lib/api-client";
import { AppShell } from "../../../components/shell/app-shell";
import type { EventRow } from "../../../lib/types";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ year: string }>;
}

function SessionLink({ sessionKey, type }: { sessionKey: string; type: string }) {
  return (
    <a
      href={`/session/${sessionKey}`}
      className="px-3 py-1 rounded text-xs font-data border border-f1-border bg-f1-surface hover:bg-f1-panel hover:border-f1-border-light transition-colors text-f1-text-dim hover:text-f1-text"
    >
      {type}
    </a>
  );
}

function EventCard({ event, year }: { event: EventRow; year: number }) {
  return (
    <div className="rounded-lg border border-f1-border bg-f1-panel p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-f1-muted font-data mb-0.5">R{event.round}</div>
          <div className="text-base font-semibold text-f1-text">{event.event_name}</div>
          <div className="text-sm text-f1-text-dim">{event.circuit}</div>
          {event.country && (
            <div className="text-xs text-f1-muted mt-0.5">{event.country}</div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {event.session_types.map((type, idx) => {
          // session key format: {year}_{round}_{sessionIndex+1}
          const sessionKey = `${year}_${event.round}_${idx + 1}`;
          return <SessionLink key={type} sessionKey={sessionKey} type={type} />;
        })}
      </div>
    </div>
  );
}

export default async function SeasonPage({ params }: Props) {
  const { year } = await params;
  const yearNum = Number(year);

  let events: EventRow[] = [];
  try {
    events = await api.events(yearNum);
  } catch {
    // show empty state
  }

  return (
    <AppShell sessionLabel={`${year} Season`}>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <a href="/" className="text-xs text-f1-text-dim hover:text-f1-text transition-colors">
            ← Home
          </a>
          <h1 className="text-xl font-bold text-f1-text">{year} Season</h1>
          <span className="font-data text-xs text-f1-muted">{events.length} events</span>
        </div>

        {events.length === 0 ? (
          <div className="text-sm text-f1-muted text-center py-12">
            No events found for {year}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {events.map((event) => (
              <EventCard key={event.round} event={event} year={yearNum} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
