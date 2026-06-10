// Replay dashboard page (server wrapper → client dashboard).
import Link from "next/link";
import { api } from "../../../lib/api-client";
import { ReplayDashboard } from "./replay-dashboard";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const [year] = key.split("_");
  let loadError = "";
  try {
    await api.ensureSession(key);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "session load failed";
  }

  if (loadError) {
    return (
      <main className="max-w-3xl mx-auto p-8">
        <Link href="/" className="text-zinc-500 text-sm hover:text-zinc-300">
          ← sessions
        </Link>
        <h1 className="text-2xl font-bold my-4">{key}</h1>
        <p className="text-red-400 whitespace-pre-wrap">{loadError}</p>
      </main>
    );
  }

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
