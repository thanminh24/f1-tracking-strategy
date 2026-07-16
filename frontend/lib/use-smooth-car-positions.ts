"use client";
// Fluid car-dot motion for the track map.
//
// Why this is non-trivial: when GPS is unavailable the backend derives a car's
// lap_fraction from mini-sector segment status, so the value only changes when
// the car crosses a segment (~20-30/lap → roughly every few SECONDS) and holds
// constant in between. Naive interpolation between two equal samples produces no
// motion, so cars visibly "move then stop".
//
// Approach: velocity dead-reckoning along the track ARC LENGTH. We estimate each
// car's arc speed (lap fraction per ms) from successive samples and *coast* at
// that speed every frame, easing toward the coasted prediction. Between samples
// the dot keeps gliding; each new sample re-anchors position and re-estimates
// speed. Motion stays on the racing line (rendered via geo.at) and never stalls.
//
// A single requestAnimationFrame loop writes each <g> transform imperatively —
// no React re-render per frame, so 20+ cars at 60fps stay cheap.
import { useCallback, useEffect, useRef } from "react";
import type { TrackGeo } from "./use-track-geo";
import type { CarState } from "./types";

// Smoothing time-constant (ms) for easing the rendered position toward the
// coasted prediction. Lower = snappier re-anchoring, higher = smoother.
const TAU_MS = 200;
// EMA weight applied to each freshly measured arc-velocity (0..1).
const VEL_SMOOTH = 0.4;
// Coast at full velocity for up to this long after the most recent sample —
// must exceed the typical mini-sector gap (~3-4s) so a moving car never stalls
// between updates.
const COAST_FULL_MS = 4000;
// Beyond COAST_FULL_MS the coast contribution tapers to a smooth stop by here,
// so a car that genuinely stops sending updates eases to rest instead of
// sailing far ahead (and never eases backward, which would look like a wobble).
const MAX_COAST_MS = 6000;
// Clamp arc-velocity to a plausible ceiling (≈ one lap / 40s) so a pair of
// updates landing in the same frame can't fling the dot.
const MAX_VEL_PER_MS = 1 / 40_000;
// |signed arc delta| above this (fraction of a lap) is a teleport, not motion.
const TELEPORT_FRAC = 0.25;
// Below this fraction delta a recomputed target counts as "unchanged".
const EPS_FRAC = 1e-4;

interface CarBuffer {
  /** Cumulative (unwrapped) lap fraction at the last accepted sample. */
  sampleFrac: number;
  /** Timestamp (ms) of the last accepted sample. */
  sampleT: number;
  /** Smoothed arc velocity, lap-fraction per ms. */
  vel: number;
  hasVel: boolean;
  /** Current rendered cumulative fraction. */
  renderFrac: number;
}

/** Map a car to a [0,1) arc-length fraction: GPS-projected when available. */
function targetFraction(geo: TrackGeo, car: CarState): number {
  if (car.x != null && car.y != null && geo.supportsRawLiveProjection) {
    const p = geo.projectRaw(car.x, car.y);
    return geo.nearestFraction(p.x, p.y);
  }
  return ((car.lap_fraction % 1) + 1) % 1;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}

export interface SmoothCarPositions {
  /** Stable-per-car ref callback for the dot's <g> element. */
  registerCar: (carId: string) => (el: SVGGElement | null) => void;
  /** Current on-screen point for hit-testing (matches what the user sees). */
  getRenderedPoint: (carId: string) => { x: number; y: number } | null;
}

export function useSmoothCarPositions(
  geo: TrackGeo | null,
  cars: CarState[],
): SmoothCarPositions {
  // Latest target fractions [0,1), refreshed on each data update (1Hz).
  const targets = useRef(new Map<string, number>());
  const buffers = useRef(new Map<string, CarBuffer>());
  const nodes = useRef(new Map<string, SVGGElement>());
  const refCbs = useRef(new Map<string, (el: SVGGElement | null) => void>());
  // Latest geo, read by the stable ref callbacks so they never close over a
  // stale geometry when the live map swaps FastF1 fallback → multiviewer.
  const geoRef = useRef(geo);

  // Refresh target fractions whenever the car list or geometry changes. Kept in
  // an effect (not render) so we never mutate a ref mid-render.
  useEffect(() => {
    geoRef.current = geo;
    if (!geo) {
      targets.current = new Map();
      return;
    }
    const next = new Map<string, number>();
    for (const car of cars) next.set(car.car_id, targetFraction(geo, car));
    targets.current = next;
  }, [geo, cars]);

  useEffect(() => {
    if (!geo) return;
    const reduced = prefersReducedMotion();
    let raf = 0;
    let lastFrameT = performance.now();

    const tick = () => {
      const now = performance.now();
      const frameDt = Math.min(Math.max(now - lastFrameT, 0), 50);
      lastFrameT = now;
      const k = 1 - Math.exp(-frameDt / TAU_MS);

      for (const [id, node] of nodes.current) {
        const targetFrac = targets.current.get(id);
        if (targetFrac == null) continue;

        let buf = buffers.current.get(id);
        if (!buf) {
          buf = {
            sampleFrac: targetFrac,
            sampleT: now,
            vel: 0,
            hasVel: false,
            renderFrac: targetFrac,
          };
          buffers.current.set(id, buf);
        }

        // Signed shortest-arc delta between the latest target and our last
        // accepted sample (both reduced mod 1).
        const currMod = ((buf.sampleFrac % 1) + 1) % 1;
        let delta = ((targetFrac - currMod) % 1 + 1) % 1; // [0,1)
        if (delta > 0.5) delta -= 1;                      // → (-0.5, 0.5]

        if (Math.abs(delta) > TELEPORT_FRAC) {
          // Teleport (pit exit / glitch / geo swap) — snap, reset velocity.
          buf.sampleFrac += delta;
          buf.sampleT = now;
          buf.vel = 0;
          buf.hasVel = false;
          buf.renderFrac = buf.sampleFrac;
        } else if (delta > EPS_FRAC) {
          // Forward advance — re-estimate and smooth the arc velocity.
          const dt = now - buf.sampleT;
          if (dt > 0) {
            let inst = delta / dt;
            if (inst > MAX_VEL_PER_MS) inst = MAX_VEL_PER_MS;
            buf.vel = buf.hasVel ? buf.vel + (inst - buf.vel) * VEL_SMOOTH : inst;
            buf.hasVel = true;
          }
          buf.sampleFrac += delta;
          buf.sampleT = now;
        }
        // else: tiny forward or small backward jitter → hold this sample.

        if (reduced) {
          buf.renderFrac = buf.sampleFrac;
        } else {
          // Effective coast distance: full velocity up to COAST_FULL_MS, then a
          // decelerating tail so a stalled car eases to a smooth stop slightly
          // ahead rather than sailing on or jerking backward. Stays monotonic
          // (never retreats), and for a moving car (gaps < COAST_FULL_MS) it is
          // just elapsed time → pure constant-velocity motion.
          const elapsed = now - buf.sampleT;
          let coast = elapsed;
          if (elapsed > COAST_FULL_MS) {
            const over = Math.min(elapsed - COAST_FULL_MS, MAX_COAST_MS - COAST_FULL_MS);
            const taper = 1 - over / (MAX_COAST_MS - COAST_FULL_MS); // 1 → 0
            coast = COAST_FULL_MS + over * taper * 0.5;
          }
          const predicted = buf.sampleFrac + buf.vel * coast;
          buf.renderFrac += (predicted - buf.renderFrac) * k;
        }

        const pt = geo.at(buf.renderFrac);
        node.style.transform = `translate(${pt.x.toFixed(2)}px, ${pt.y.toFixed(2)}px)`;
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [geo]);

  const registerCar = useCallback((carId: string) => {
    let cb = refCbs.current.get(carId);
    if (!cb) {
      cb = (el: SVGGElement | null) => {
        if (el) {
          nodes.current.set(carId, el);
          // Paint the initial position immediately to avoid a flash at (0,0).
          const g = geoRef.current;
          const buf = buffers.current.get(carId);
          const frac = buf?.renderFrac ?? targets.current.get(carId);
          if (frac != null && g) {
            const pt = g.at(frac);
            el.style.transform = `translate(${pt.x.toFixed(2)}px, ${pt.y.toFixed(2)}px)`;
          }
        } else {
          nodes.current.delete(carId);
          buffers.current.delete(carId);
          refCbs.current.delete(carId);
        }
      };
      refCbs.current.set(carId, cb);
    }
    return cb;
  }, []);

  const getRenderedPoint = useCallback((carId: string) => {
    const g = geoRef.current;
    if (!g) return null;
    const buf = buffers.current.get(carId);
    const frac = buf?.renderFrac ?? targets.current.get(carId);
    return frac != null ? g.at(frac) : null;
  }, []);

  return { registerCar, getRenderedPoint };
}
