const LIVE_STATIC_BASE = "https://livetiming.formula1.com/static";

/** Build a playable URL for a live SignalR TeamRadio capture path. */
export function resolveLiveRadioUrl(
  sessionPath: string | undefined,
  capturePath: string,
): string | null {
  if (!capturePath) return null;
  if (capturePath.startsWith("http://") || capturePath.startsWith("https://")) {
    return capturePath;
  }
  const session = (sessionPath ?? "").replace(/^\/+|\/+$/g, "");
  const rel = capturePath.startsWith("/") ? capturePath : `/${capturePath}`;
  if (!session) {
    return `${LIVE_STATIC_BASE}${rel}`;
  }
  return `${LIVE_STATIC_BASE}/${session}${rel}`;
}
