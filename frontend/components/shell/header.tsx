"use client";
import { useRouter, usePathname } from "next/navigation";
import { F1Logo } from "../ui/f1-logo";

interface HeaderProps {
  sessionLabel?: string;
  /** "live" | "archive" — shows coloured badge */
  sourceMode?: "live" | "archive";
  /** Current tab — "race" | "telemetry" */
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const TABS = [
  { id: "race", label: "Race" },
  { id: "telemetry", label: "Telemetry" },
];

export function Header({ sessionLabel, sourceMode, activeTab, onTabChange }: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  const handleSourceToggle = (newSource: "live" | "archive") => {
    // Update URL with source param without full page reload
    const url = new URL(window.location.href);
    url.searchParams.set("source", newSource);
    router.push(url.toString());
  };

  return (
    <header className="flex items-center gap-4 px-4 h-12 border-b border-f1-border bg-f1-surface shrink-0">
      {/* brand */}
      <div className="flex items-center gap-2.5 shrink-0">
        <F1Logo className="h-5 w-auto" />
        <span className="text-sm font-semibold tracking-tight text-f1-text hidden sm:block">
          Pit&nbsp;Wall
        </span>
      </div>

      {/* session label + source toggle */}
      {sessionLabel && (
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-f1-text-dim truncate font-data">{sessionLabel}</span>

          {/* Source toggle chip — only visible when inside a session */}
          {onTabChange && sourceMode && (
            <div className="flex items-center gap-1 border border-f1-border rounded-lg p-0.5">
              <button
                onClick={() => handleSourceToggle("live")}
                className={`chip text-[10px] transition-colors ${
                  sourceMode === "live"
                    ? "bg-red-900/60 text-f1-red border border-f1-red/40 live-pulse"
                    : "bg-transparent text-f1-text-dim border border-transparent hover:border-f1-border/50"
                }`}
              >
                ● LIVE
              </button>
              <button
                onClick={() => handleSourceToggle("archive")}
                className={`chip text-[10px] transition-colors ${
                  sourceMode === "archive"
                    ? "bg-zinc-800 text-f1-text border border-f1-border"
                    : "bg-transparent text-f1-text-dim border border-transparent hover:border-f1-border/50"
                }`}
              >
                ARCHIVE
              </button>
            </div>
          )}
        </div>
      )}

      {/* spacer */}
      <div className="flex-1" />

      {/* tabs */}
      {onTabChange && (
        <nav className="flex items-center gap-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-f1-panel text-f1-text"
                  : "text-f1-text-dim hover:text-f1-text hover:bg-f1-panel/50"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}
