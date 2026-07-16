"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";

type DragState = {
  panel: string;
  axis: "x" | "y";
  startX: number;
  startY: number;
  startValue: number;
  invert: boolean;
} | null;

function readStored<T extends Record<string, number>>(key: string, defaults: T): T {
  if (typeof window === "undefined") return defaults;
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    const next = { ...defaults };
    for (const field of Object.keys(defaults) as (keyof T)[]) {
      if (typeof saved[field as string] === "number") {
        next[field] = saved[field as string] as T[keyof T];
      }
    }
    return next;
  } catch {
    return defaults;
  }
}

export function useResizablePanels<T extends Record<string, number>>(
  storageKey: string,
  defaults: T,
  mins: Partial<Record<keyof T, number>> = {},
) {
  const [sizes, setSizes] = useState<T>(() => readStored(storageKey, defaults));
  const [drag, setDrag] = useState<DragState>(null);
  const dragRef = useRef<DragState>(null);
  const moveRafRef = useRef<number | null>(null);
  const latestPointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    dragRef.current = drag;
  }, [drag]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(storageKey, JSON.stringify(sizes));
    }, 200);
    return () => window.clearTimeout(timer);
  }, [sizes, storageKey]);

  const setSize = useCallback((panel: keyof T, value: number) => {
    const min = mins[panel] ?? 120;
    setSizes((prev) => {
      const nextValue = Math.max(min, value);
      if (prev[panel] === nextValue) return prev;
      return { ...prev, [panel]: nextValue };
    });
  }, [mins]);

  const startDrag = useCallback(
    (panel: keyof T, axis: "x" | "y", invert = false) =>
      (e: PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.setAttribute("data-dragging", "");
        setDrag({
          panel: String(panel),
          axis,
          startX: e.clientX,
          startY: e.clientY,
          startValue: sizes[panel],
          invert,
        });
      },
    [sizes],
  );

  const moveDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const activeDrag = dragRef.current;
      if (!activeDrag) return;
      latestPointerRef.current = { x: e.clientX, y: e.clientY };
      if (moveRafRef.current != null) return;

      moveRafRef.current = window.requestAnimationFrame(() => {
        moveRafRef.current = null;
        const dragState = dragRef.current;
        if (!dragState) return;
        const panel = dragState.panel as keyof T;
        const { x, y } = latestPointerRef.current;
        const delta =
          dragState.axis === "x" ? x - dragState.startX : y - dragState.startY;
        const signed = dragState.invert ? -delta : delta;
        setSize(panel, dragState.startValue + signed);
      });
    },
    [setSize],
  );

  const endDrag = useCallback((e: PointerEvent<HTMLDivElement>) => {
    if (moveRafRef.current != null) {
      window.cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    e.currentTarget.removeAttribute("data-dragging");
    setDrag(null);
  }, []);

  return { sizes, startDrag, moveDrag, endDrag };
}
