"use client";
// Fetches track outline points and computes the normalized arc-length geometry
// used by both the Canvas2D track map and any future SVG fallback.
//
// For live sessions: fetches from api.multiviewer.app (free, CORS open) using
// the circuitKey from SessionInfo.Meeting.Circuit.Key.
// For archive sessions: fetches the backend-proxied FastF1 outline.
import { useEffect, useMemo, useState } from "react";
import { api } from "./api-client";
import type { OutlinePoint } from "./types";

export interface Corner {
  number: number;
  trackPosition: { x: number; y: number };
  angle: number;
  length: number;
}

export interface MarshalSector {
  number: number;
  trackPosition: { x: number; y: number };
}

export interface TrackGeo {
  /** SVG path string for the static track layer */
  d: string;
  /** Normalized points in [0, VIEWBOX] space */
  norm: Array<{ x: number; y: number }>;
  /** Project a lap_fraction [0,1] to canvas coordinates */
  at: (frac: number) => { x: number; y: number };
  /** Project raw F1 Cartesian coordinates to the same viewbox space as norm */
  projectRaw: (rawX: number, rawY: number) => { x: number; y: number };
  /** Total arc length in viewbox units */
  totalLen: number;
  /** Corner labels (multiviewer only, undefined for archive) */
  corners?: Corner[];
  /** Marshal sector positions for yellow-flag coloring (multiviewer only) */
  marshalSectors?: MarshalSector[];
}

const VIEWBOX = 1000;
const PAD = 30;

// ── Archive path (FastF1 backend proxy) ──────────────────────────────────────

const pointsCache = new Map<string, OutlinePoint[]>();
const fetchPromise = new Map<string, Promise<OutlinePoint[]>>();

function fetchPoints(sessionKey: string): Promise<OutlinePoint[]> {
  const cached = pointsCache.get(sessionKey);
  if (cached) return Promise.resolve(cached);
  let p = fetchPromise.get(sessionKey);
  if (!p) {
    const fetchFn = sessionKey.startsWith("circuit:")
      ? api.circuitOutline(sessionKey.slice(8))
      : api.trackOutline(sessionKey);
    p = fetchFn
      .then((pts) => { pointsCache.set(sessionKey, pts); fetchPromise.delete(sessionKey); return pts; })
      .catch((err) => { fetchPromise.delete(sessionKey); throw err; });
    fetchPromise.set(sessionKey, p);
  }
  return p;
}

// ── Multiviewer path (live sessions) ─────────────────────────────────────────

const MULTIVIEWER_BASE = "https://api.multiviewer.app/api/v1/circuits";

interface MultiviewerData {
  x: number[];
  y: number[];
  rotation: number;
  corners?: Corner[];
  marshalSectors?: MarshalSector[];
}

const mvCache = new Map<string, MultiviewerData>();
const mvFetch = new Map<string, Promise<MultiviewerData | null>>();

function fetchMultiviewerCircuit(circuitKey: number, year: number): Promise<MultiviewerData | null> {
  const cacheKey = `${circuitKey}:${year}`;
  const cached = mvCache.get(cacheKey);
  if (cached) return Promise.resolve(cached);
  let p = mvFetch.get(cacheKey);
  if (!p) {
    p = fetch(`${MULTIVIEWER_BASE}/${circuitKey}/${year}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: MultiviewerData | null) => {
        if (data) mvCache.set(cacheKey, data);
        mvFetch.delete(cacheKey);
        return data;
      })
      .catch(() => { mvFetch.delete(cacheKey); return null; });
    mvFetch.set(cacheKey, p);
  }
  return p;
}

// ── Rotation helper (ported from f1-dash lib/map.ts) ─────────────────────────

function rotatePoint(
  x: number, y: number,
  angleDeg: number,
  cx: number, cy: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = x - cx, dy = y - cy;
  return { x: dx * cos - dy * sin + cx, y: dx * sin + dy * cos + cy };
}

function buildGeoFromMultiviewer(data: MultiviewerData): TrackGeo | null {
  const { x: xs, y: ys, rotation, corners, marshalSectors } = data;
  if (!xs || xs.length < 10) return null;

  // Center of raw coordinates
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  // f1-dash uses fixedRotation = rotation + 90 degrees for correct display
  const fixedRot = rotation + 90;

  // Rotate all track points
  const rotated = xs.map((x, i) => rotatePoint(x, ys[i], fixedRot, cx, cy));

  // Normalize to viewbox
  const rxs = rotated.map((p) => p.x);
  const rys = rotated.map((p) => p.y);
  const minX = Math.min(...rxs), maxX = Math.max(...rxs);
  const minY = Math.min(...rys), maxY = Math.max(...rys);
  const range = Math.max(maxX - minX, maxY - minY);
  if (range < 0.001) return null;
  const scale = (VIEWBOX - PAD * 2) / range;

  const norm = rotated.map((p) => ({
    x: (p.x - minX) * scale + PAD,
    // Flip Y: telemetry coords are y-up; canvas is y-down
    y: (maxY - p.y) * scale + PAD,
  }));

  const projectRaw = (rawX: number, rawY: number) => {
    const r = rotatePoint(rawX, rawY, fixedRot, cx, cy);
    return {
      x: (r.x - minX) * scale + PAD,
      y: (maxY - r.y) * scale + PAD,
    };
  };

  const cum: number[] = [0];
  for (let i = 1; i < norm.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(norm[i].x - norm[i - 1].x, norm[i].y - norm[i - 1].y));
  }
  const totalLen = cum[cum.length - 1];

  const at = (frac: number) => {
    const target = (((frac % 1) + 1) % 1) * totalLen;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    return norm[Math.min(lo, norm.length - 1)];
  };

  const d = `M ${norm.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;

  // Transform corner label positions using same rotation+normalization
  const transformedCorners = corners?.map((c) => {
    const tp = c.trackPosition;
    const r = rotatePoint(tp.x, tp.y, fixedRot, cx, cy);
    return {
      ...c,
      trackPosition: {
        x: (r.x - minX) * scale + PAD,
        y: (maxY - r.y) * scale + PAD,
      },
    };
  });

  const transformedSectors = marshalSectors?.map((s) => {
    const tp = s.trackPosition;
    const r = rotatePoint(tp.x, tp.y, fixedRot, cx, cy);
    return {
      ...s,
      trackPosition: {
        x: (r.x - minX) * scale + PAD,
        y: (maxY - r.y) * scale + PAD,
      },
    };
  });

  return {
    d, norm, at, projectRaw, totalLen,
    corners: transformedCorners,
    marshalSectors: transformedSectors,
  };
}

// ── Archive geo builder ───────────────────────────────────────────────────────

function buildGeo(points: OutlinePoint[]): TrackGeo | null {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const [minX, maxX] = [Math.min(...xs), Math.max(...xs)];
  const [minY, maxY] = [Math.min(...ys), Math.max(...ys)];
  const range = Math.max(maxX - minX, maxY - minY);
  if (range < 0.001) return null;
  const scale = (VIEWBOX - PAD * 2) / range;

  const norm = points.map((p) => ({
    x: (p.x - minX) * scale + PAD,
    y: (maxY - p.y) * scale + PAD,
  }));

  const projectRaw = (rawX: number, rawY: number) => ({
    x: (rawX - minX) * scale + PAD,
    y: (maxY - rawY) * scale + PAD,
  });

  const cum: number[] = [0];
  for (let i = 1; i < norm.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(norm[i].x - norm[i - 1].x, norm[i].y - norm[i - 1].y));
  }
  const totalLen = cum[cum.length - 1];

  const at = (frac: number) => {
    const target = (((frac % 1) + 1) % 1) * totalLen;
    let lo = 0, hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1; else hi = mid;
    }
    return norm[Math.min(lo, norm.length - 1)];
  };

  const d = `M ${norm.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" L ")} Z`;
  return { d, norm, at, projectRaw, totalLen };
}

// ── Caches ───────────────────────────────────────────────────────────────────

const geoCache = new Map<string, TrackGeo>();
const mvGeoCache = new Map<string, TrackGeo>();

// ── Hook ─────────────────────────────────────────────────────────────────────

/**
 * For live sessions pass circuitKey (number from SessionInfo.Meeting.Circuit.Key)
 * and year — the hook will fetch from multiviewer.app.
 * For archive sessions only sessionKey is needed.
 */
export function useTrackGeo(
  sessionKey: string,
  circuitKey?: number,
  year?: number,
): TrackGeo | null {
  const isLive = sessionKey === "live" || sessionKey.startsWith("live");
  const mvKey = circuitKey != null ? `${circuitKey}:${year ?? new Date().getFullYear()}` : null;

  // ── Multiviewer path ──────────────────────────────────────────────────────
  const [mvGeo, setMvGeo] = useState<TrackGeo | null>(
    () => (mvKey ? mvGeoCache.get(mvKey) ?? null : null),
  );

  useEffect(() => {
    if (!isLive || circuitKey == null) return;
    const ck = circuitKey;
    const yr = year ?? new Date().getFullYear();
    const key = `${ck}:${yr}`;
    const cached = mvGeoCache.get(key);
    if (cached) { setMvGeo(cached); return; }
    let cancelled = false;
    fetchMultiviewerCircuit(ck, yr).then((data) => {
      if (cancelled || !data) return;
      const geo = buildGeoFromMultiviewer(data);
      if (geo) {
        mvGeoCache.set(key, geo);
        setMvGeo(geo);
      }
    });
    return () => { cancelled = true; };
  }, [isLive, circuitKey, year]);

  // ── Archive path ──────────────────────────────────────────────────────────
  const [points, setPoints] = useState<OutlinePoint[]>(
    () => (isLive ? [] : (pointsCache.get(sessionKey) ?? [])),
  );

  useEffect(() => {
    if (isLive) return;
    let cancelled = false;
    const cached = pointsCache.get(sessionKey);
    if (cached) {
      Promise.resolve().then(() => { if (!cancelled) setPoints(cached); });
      return () => { cancelled = true; };
    }
    fetchPoints(sessionKey)
      .then((pts) => { if (!cancelled) setPoints(pts); })
      .catch(() => { if (!cancelled) setPoints([]); });
    return () => { cancelled = true; };
  }, [sessionKey, isLive]);

  return useMemo(() => {
    if (isLive) return mvGeo;

    if (points.length < 10) return null;
    const existing = geoCache.get(sessionKey);
    if (existing) return existing;
    const geo = buildGeo(points);
    if (!geo) return null;
    geoCache.set(sessionKey, geo);
    return geo;
  }, [isLive, mvGeo, points, sessionKey]);
}
