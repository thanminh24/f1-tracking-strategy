"use client";
// requestAnimationFrame loop hook. Returns a canvasRef; starts the loop on
// mount, stops on unmount. Callback receives elapsed ms since last frame.
import { useEffect, useLayoutEffect, useRef } from "react";

export function useCanvasLoop(
  draw: (ctx: CanvasRenderingContext2D, deltaMs: number) => void,
): React.RefObject<HTMLCanvasElement | null> {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef(draw);
  // Update ref in layout effect (not during render) to satisfy react-hooks/refs
  useLayoutEffect(() => { drawRef.current = draw; });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId: number;
    let last = performance.now();

    function frame(now: number) {
      const delta = now - last;
      last = now;
      drawRef.current(ctx!, delta);
      rafId = requestAnimationFrame(frame);
    }

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
  }, []); // empty deps — loop restarts only on mount/unmount

  return canvasRef;
}
