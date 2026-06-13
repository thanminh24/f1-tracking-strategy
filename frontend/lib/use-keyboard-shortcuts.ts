// Keyboard shortcut hook — one persistent listener, dispatches via ref to avoid stale closures.
import { useEffect, useRef } from "react";

export function useKeyboardShortcuts(
  shortcuts: Record<string, () => void>,
): void {
  const shortcutsRef = useRef(shortcuts);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      const fn = shortcutsRef.current[e.key];
      if (fn) {
        e.preventDefault();
        fn();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []); // register once — ref keeps shortcuts current
}
