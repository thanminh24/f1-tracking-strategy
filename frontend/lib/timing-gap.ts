export type GapDisplayMode = "leader" | "interval";

const STORAGE_KEY = "f1-pw:gap-mode";

export function loadGapMode(): GapDisplayMode {
  if (typeof window === "undefined") return "leader";
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "interval" ? "interval" : "leader";
}

export function saveGapMode(mode: GapDisplayMode): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, mode);
}

/** Leader gap: seconds on same lap, lap notation when lapped (up to displayed lap count). */
export function formatLeaderGap(
  gapS: number | null | undefined,
  rawGapStr?: string,
): string {
  if (rawGapStr?.trim() && /^leader/i.test(rawGapStr.trim())) return "Leader";
  if (gapS === 0) return "Leader";
  if (rawGapStr) {
    const normalized = rawGapStr.startsWith("+") ? rawGapStr : `+${rawGapStr}`;
    return normalized;
  }
  if (gapS != null) return `+${gapS.toFixed(3)}`;
  return "—";
}

/** Interval to car directly ahead. */
export function formatIntervalGap(
  intervalS: number | null | undefined,
  rawIntervalStr?: string,
  position?: number,
): string {
  if (position === 1) return "—";
  if (rawIntervalStr?.trim()) {
    return rawIntervalStr.startsWith("+") ? rawIntervalStr : `+${rawIntervalStr}`;
  }
  if (intervalS != null) return `+${intervalS.toFixed(3)}`;
  return "—";
}
