// Replay dashboard page (server wrapper → client dashboard).
import Link from "next/link";
import { ReplayDashboard } from "./replay-dashboard";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const [year] = key.split("_");
  return (
    <main className="h-screen flex flex-col p-4 gap-2">
      <div className="flex items-center gap-4 text-sm">
        <Link href={`/season/${year}`} className="text-zinc-500 hover:text-zinc-300">
          ← {year}
        </Link>
        <span className="font-mono font-bold">{key}</span>
        <Link
          href={`/session/${key}/telemetry`}
          className="ml-auto text-zinc-400 hover:text-zinc-200 underline underline-offset-4"
        >
          telemetry compare →
        </Link>
      </div>
      <div className="flex-1 min-h-0">
        <ReplayDashboard sessionKey={key} />
      </div>
    </main>
  );
}
