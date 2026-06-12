// Root server component: fetches seasons + live session, hands off to client dashboard.
import { api } from "../lib/api-client";
import { HomeDashboard } from "../components/home-dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [seasons, live] = await Promise.allSettled([
    api.seasons(),
    api.liveSession(),
  ]);

  const seasonData = seasons.status === "fulfilled" ? seasons.value : [];
  const liveData = live.status === "fulfilled" ? live.value : null;
  const backendOnline = seasons.status === "fulfilled" || live.status === "fulfilled";

  return (
    <HomeDashboard
      seasons={seasonData}
      liveSession={liveData}
      backendOnline={backendOnline}
    />
  );
}
