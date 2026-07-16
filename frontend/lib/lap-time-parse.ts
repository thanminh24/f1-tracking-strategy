/** Parse F1-style lap time strings ("1:32.456" or "92.456") to milliseconds. */
export function parseLapTimeMs(value: string | undefined | null): number | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (trimmed.includes(":")) {
    const [minPart, secPart] = trimmed.split(":");
    const minutes = Number(minPart);
    const seconds = Number(secPart);
    if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
    return (minutes * 60 + seconds) * 1000;
  }
  const seconds = Number(trimmed);
  return Number.isNaN(seconds) ? null : seconds * 1000;
}

export function formatLapMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  const rem = (s % 60).toFixed(3).padStart(6, "0");
  return m > 0 ? `${m}:${rem}` : rem;
}
