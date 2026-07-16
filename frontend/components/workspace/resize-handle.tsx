"use client";

import type { PointerEvent } from "react";

interface Props {
  axis: "x" | "y";
  onPointerDown: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: PointerEvent<HTMLDivElement>) => void;
  className?: string;
}

export function ResizeHandle({
  axis,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  className = "",
}: Props) {
  return (
    <div
      className={`resize-handle resize-handle-${axis} ${className}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="separator"
      aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    />
  );
}
