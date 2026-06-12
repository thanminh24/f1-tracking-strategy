// Session-specific URL is no longer a standalone view.
// All replay + telemetry is served from the home dashboard tabs.
import { redirect } from "next/navigation";

export default function SessionPage() {
  redirect("/");
}
