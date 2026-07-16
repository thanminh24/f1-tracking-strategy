import type { RaceControlMessage } from "./types";

export const RACE_CONTROL_MAX = 80;

export function raceControlKey(msg: RaceControlMessage): string {
  return `${msg.lap ?? ""}:${msg.category}:${msg.message}`;
}

/** Merge race-control messages; newest first, deduped by stable key. */
export function mergeRaceControlMessages(
  existing: RaceControlMessage[],
  incoming: RaceControlMessage[] | RaceControlMessage | undefined,
): RaceControlMessage[] {
  const batch = incoming == null ? [] : Array.isArray(incoming) ? incoming : [incoming];
  if (batch.length === 0) return existing;

  const seen = new Set<string>();
  const newestIncoming = [...batch].reverse();
  return [...newestIncoming, ...existing]
    .filter((msg) => {
      const key = raceControlKey(msg);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, RACE_CONTROL_MAX);
}
