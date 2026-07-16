import { useCallback, useSyncExternalStore } from "react";

/**
 * Client-only persisted UI preference (e.g. localStorage-backed toggle).
 *
 * Uses useSyncExternalStore so the server render and first client paint share
 * the default snapshot (no hydration mismatch), then the stored value is applied
 * without a synchronous setState-in-effect cascade. `load` must be SSR-safe
 * (return the default when `window` is undefined) and return a stable primitive.
 */
export function usePersistedPreference<T extends string>(
  load: () => T,
  save: (value: T) => void,
): [T, (value: T) => void] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener("f1pw:preference-change", onStoreChange);
    return () => {
      window.removeEventListener("storage", onStoreChange);
      window.removeEventListener("f1pw:preference-change", onStoreChange);
    };
  }, []);

  const value = useSyncExternalStore(subscribe, load, load);

  const setValue = useCallback(
    (next: T) => {
      save(next);
      // notify other hook instances in this tab (storage event only fires cross-tab)
      window.dispatchEvent(new Event("f1pw:preference-change"));
    },
    [save],
  );

  return [value, setValue];
}
