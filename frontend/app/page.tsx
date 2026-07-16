// Root server component: pre-fetches live schedule. Archive calendar loads client-side.
import { api } from "../lib/api-client";
import { HomeDashboard } from "../components/home-dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [scheduleResult, backendResult, capabilityResult] = await Promise.allSettled([
    api.schedule(),
    api.seasons(),
    api.capabilities(),
  ]);

  const scheduleData = scheduleResult.status === "fulfilled" ? scheduleResult.value : [];
  const backendOnline = backendResult.status === "fulfilled" || scheduleResult.status === "fulfilled";
  const capabilities = capabilityResult.status === "fulfilled" ? capabilityResult.value : null;

  return (
    <HomeDashboard
      schedule={scheduleData}
      backendOnline={backendOnline}
      capabilities={capabilities}
    />
  );
}
