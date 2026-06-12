// Main entry point: full race dashboard with session picker + live mode.
// Server component fetches seasons + most recent race, then hands off to
// the client HomeDashboard which owns the picker and dashboard state.
import { HomeDashboard } from "./home-dashboard";
import { api } from "../lib/api-client";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  let seasons: number[] = [];
  let defaultKey: string | null = null;
  let defaultLabel = "";

  try {
    seasons = await api.seasons();
    if (seasons.length > 0) {
      // Auto-select most recent race from the latest season
      const latestSeason = seasons[seasons.length - 1];
      const events = await api.events(latestSeason).catch(() => []);
      const raceEvents = events.filter((e) => e.session_types.includes("R"));
      if (raceEvents.length > 0) {
        const latest = raceEvents[raceEvents.length - 1];
        defaultKey = `${latestSeason}_${latest.round}_R`;
        defaultLabel = `${latest.event_name} ${latestSeason}`;
      }
    }
  } catch {
    // Backend unreachable — HomeDashboard shows empty state
  }

  return (
    <HomeDashboard
      seasons={[...seasons].reverse()} // newest season first
      defaultKey={defaultKey}
      defaultLabel={defaultLabel}
    />
  );
}
