// Custom hook for fetching and caching telemetry samples.
import { useState, useRef, useCallback } from "react";
import { api } from "./api-client";
import type { TelemetrySample } from "./types";

export function useTelemetryFetch(sessionKey: string) {
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(new Set());
  const samplesCacheRef = useRef<Map<string, TelemetrySample[]>>(new Map());
  const [samplesMap, setSamplesMap] = useState<Map<string, TelemetrySample[]>>(
    () => new Map()
  );

  const fetchTelemetryBatch = useCallback(
    async (keys: string[]) => {
      const keysToFetch = keys.filter((k) => !samplesCacheRef.current.has(k));
      if (keysToFetch.length === 0) return;

      setLoadingKeys((prev) => new Set([...prev, ...keysToFetch]));

      // Fetch in batches of 5
      for (let i = 0; i < keysToFetch.length; i += 5) {
        const batch = keysToFetch.slice(i, i + 5);
        await Promise.all(
          batch.map(async (key) => {
            const [carId, lapStr] = key.split("-");
            const lap = Number(lapStr);
            try {
              const samples = await api.telemetry(sessionKey, carId, lap);
              samplesCacheRef.current.set(key, samples);
            } catch (err) {
              console.error(`Failed to fetch telemetry ${key}:`, err);
            }
          })
        );
        setSamplesMap(new Map(samplesCacheRef.current));
      }

      setLoadingKeys((prev) => {
        const next = new Set(prev);
        keysToFetch.forEach((k) => next.delete(k));
        return next;
      });
    },
    [sessionKey]
  );

  return {
    samplesMap,
    loadingKeys,
    fetchTelemetryBatch,
  };
}
