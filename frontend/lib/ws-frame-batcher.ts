type FlushFn = () => void;

let rafId: number | null = null;
const flushers = new Set<FlushFn>();

export function scheduleWsFrameFlush(flush: FlushFn): void {
  flushers.add(flush);
  if (rafId != null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    const pending = [...flushers];
    flushers.clear();
    for (const run of pending) run();
  });
}

export function cancelWsFrameFlush(flush: FlushFn): void {
  flushers.delete(flush);
}
