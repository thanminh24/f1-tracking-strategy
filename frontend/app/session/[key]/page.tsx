import { api } from "../../../lib/api-client";
import { SessionDashboard } from "./session-dashboard";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ source?: string }>;
}

export default async function SessionPage({ params, searchParams }: Props) {
  const { key } = await params;
  const { source: sourceParam } = await searchParams;

  // Determine source from URL param, or via ensureSession for archive detection.
  let source: "archive" | "live" = "archive";

  if (sourceParam === "live") {
    source = "live";
  } else {
    // Best-effort prefetch — ensure archive data exists; live sessions skip ingestion.
    try {
      const info = await api.ensureSession(key);
      source = (info.source as "archive" | "live") || "archive";
    } catch {
      // live session or network error — proceed; dashboard handles fallback
    }
  }

  const [laps, stints] = await Promise.all([
    api.laps(key).catch(() => []),
    api.stints(key).catch(() => []),
  ]);

  return (
    <SessionDashboard
      sessionKey={key}
      initialSource={source}
      laps={laps}
      stints={stints}
    />
  );
}
