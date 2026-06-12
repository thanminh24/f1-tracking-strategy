"use client";
// Fetches track outline points and computes the normalized arc-length geometry
// used by both the Canvas2D track map and any future SVG fallback.
// Module-level cache so geometry survives component unmount/remount (tab switches).
import { useEffect, useMemo, useState } from "react";
import { api } from "./api-client";
import type { OutlinePoint } from "./types";

export interface TrackGeo {
  /** SVG path string for the static track layer */
  d: string;
  /** Normalized points in [0, VIEWBOX] space */
  norm: Array<{ x: number; y: number }>;
  /** Project a lap_fraction [0,1] to canvas coordinates */
  at: (frac: number) => { x: number; y: number };
  /** Total arc length in viewbox units (for DRS zone fraction math) */
  totalLen: number;
}

const VIEWBOX = 1000;
const PAD = 30;

// Points cache: keyed by sessionKey; shared across all hook instances in the page.
const pointsCache = new Map<string, OutlinePoint[]>();
// In-flight dedup: one fetch per sessionKey, even if multiple hooks call simultaneously.
const fetchPromise = new Map<string, Promise<OutlinePoint[]>>();

function fetchPoints(sessionKey: string): Promise<OutlinePoint[]> {
  const cached = pointsCache.get(sessionKey);
  if (cached) return Promise.resolve(cached);

  let p = fetchPromise.get(sessionKey);
  if (!p) {
    p = api.trackOutline(sessionKey).then((pts) => {
      pointsCache.set(sessionKey, pts);
      fetchPromise.delete(sessionKey);
      return pts;
    }).catch((err) => {
      fetchPromise.delete(sessionKey);
      throw err;
    });
    fetchPromise.set(sessionKey, p);
  }
  return p;
}

function buildGeo(points: OutlinePoint[]): TrackGeo {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const scale = (VIEWBOX - PAD * 2) / Math.max(maxX - minX, maxY - minY);

  // Flip Y: telemetry coords are y-up; canvas is y-down
  const norm = points.map((p) => ({
    x: (p.x - minX) * scale + PAD,
    y: (maxY - p.y) * scale + PAD,
  }));

  // Cumulative arc lengths for O(log n) fraction lookup
  const cum: number[] = [0];
  for (let i = 1; i < norm.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(norm[i].x - norm[i - 1].x, norm[i].y - norm[i - 1].y));
  }
  const totalLen = cum[cum.length - 1];

  const at = (frac: number): { x: number; y: number } => {
    const target = (((frac % 1) + 1) % 1) * totalLen;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    return norm[Math.min(lo, norm.length - 1)];
  };

  const d = `M ${norm.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;
  return { d, norm, at, totalLen };
}

// Computed geo cache: avoids re-running buildGeo after pointsCache hit.
const geoCache = new Map<string, TrackGeo>();

export function useTrackGeo(sessionKey: string): TrackGeo | null {
  // If already computed, return synchronously via state initializer to avoid flicker.
  const [points, setPoints] = useState<OutlinePoint[]>(
    () => pointsCache.get(sessionKey) ?? []
  );

  useEffect(() => {
    // Already cached — nothing to fetch.
    if (pointsCache.has(sessionKey)) {
      setPoints(pointsCache.get(sessionKey)!);
      return;
    }
    let cancelled = false;
    fetchPoints(sessionKey)
      .then((pts) => { if (!cancelled) setPoints(pts); })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [sessionKey]);

  return useMemo(() => {
    if (points.length < 10) return null;

    // Return cached geo object if points haven't changed.
    const existing = geoCache.get(sessionKey);
    if (existing) return existing;

    const geo = buildGeo(points);
    geoCache.set(sessionKey, geo);
    return geo;
  }, [points, sessionKey]);
}
