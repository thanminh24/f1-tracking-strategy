// Root server component: pre-fetches live schedule. Archive calendar loads client-side.
import { api } from "../lib/api-client";
import { HomeDashboard } from "../components/home-dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [scheduleResult, backendResult] = await Promise.allSettled([
    api.schedule(),
    api.seasons(),
  ]);

  const scheduleData = scheduleResult.status === "fulfilled" ? scheduleResult.value : [];
  const backendOnline = backendResult.status === "fulfilled" || scheduleResult.status === "fulfilled";

  return (
    <HomeDashboard
      schedule={scheduleData}
      backendOnline={backendOnline}
    />
  );
}
