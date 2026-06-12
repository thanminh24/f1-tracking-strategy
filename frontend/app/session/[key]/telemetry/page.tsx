// Telemetry is now accessible via home dashboard tabs — no standalone page needed.
import { redirect } from "next/navigation";

export default function TelemetryPage() {
  redirect("/");
}
