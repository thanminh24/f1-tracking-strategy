import { redirect } from "next/navigation";

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

  // Determine source from URL param or session key.
  let source: "archive" | "live" | "fixture" = "archive";

  if (key === "fixture" || sourceParam === "fixture") {
    if (key !== "fixture") redirect("/session/fixture?source=fixture");
    source = "fixture";
  } else if (key === "live" || sourceParam === "live") {
    // "live" key always routes to the real-time feed — no archive lookup
    if (key !== "live") redirect("/session/live?source=live");
    source = "live";
  } else {
    // Archive session: best-effort prefetch to ensure local data exists.
    try {
      const info = await api.ensureSession(key);
      source = (info.source as "archive" | "live" | "fixture") || "archive";
    } catch {
      // network error — proceed; dashboard handles fallback
    }
  }

  const [laps, stints] = await Promise.all([
    api.laps(key).catch(() => []),
    api.stints(key).catch(() => []),
  ]);

  return (
    <SessionDashboard
      key={key}
      sessionKey={key}
      initialSource={source}
      laps={laps}
      stints={stints}
    />
  );
}
