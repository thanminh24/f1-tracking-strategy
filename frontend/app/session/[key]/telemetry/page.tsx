// Telemetry comparison page.
import Link from "next/link";
import { TelemetryCompare } from "./telemetry-compare";

export default async function TelemetryPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  return (
    <main className="max-w-5xl mx-auto p-6">
      <div className="flex items-center gap-4 text-sm mb-6">
        <Link href={`/session/${key}`} className="text-zinc-500 hover:text-zinc-300">
          ← replay
        </Link>
        <span className="font-mono font-bold">{key} · telemetry</span>
      </div>
      <TelemetryCompare sessionKey={key} />
    </main>
  );
}
