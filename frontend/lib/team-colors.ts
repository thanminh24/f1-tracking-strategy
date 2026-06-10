// Team + compound display colors. Lookup is fuzzy (substring) so sponsor-name
// churn across seasons ("RB", "Visa Cash App RB", "Racing Bulls") still matches.

const TEAM_COLOR_PATTERNS: [string, string][] = [
  ["red bull", "#3671C6"],
  ["ferrari", "#E8002D"],
  ["mercedes", "#27F4D2"],
  ["mclaren", "#FF8000"],
  ["aston martin", "#229971"],
  ["alpine", "#FF87BC"],
  ["williams", "#64C4FF"],
  ["racing bulls", "#6692FF"],
  ["rb", "#6692FF"],
  ["sauber", "#52E252"],
  ["audi", "#00E701"],
  ["haas", "#B6BABD"],
  ["cadillac", "#D4AF37"],
];

export function teamColor(team: string | null): string {
  if (!team) return "#888888";
  const lower = team.toLowerCase();
  for (const [pattern, color] of TEAM_COLOR_PATTERNS) {
    if (lower.includes(pattern)) return color;
  }
  return "#888888";
}

export const COMPOUND_COLORS: Record<string, string> = {
  SOFT: "#ef4444",
  MEDIUM: "#eab308",
  HARD: "#e5e7eb",
  INTERMEDIATE: "#22c55e",
  WET: "#3b82f6",
};

export function compoundColor(compound: string | undefined | null): string {
  return COMPOUND_COLORS[compound ?? ""] ?? "#9ca3af";
}

export function formatLapTime(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, "0");
  return `${m}:${s}`;
}

export function formatGap(s: number | null | undefined): string {
  if (s == null) return "—";
  return s === 0 ? "LEADER" : `+${s.toFixed(1)}s`;
}
