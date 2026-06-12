// Official F1 chevron mark — two forward-leaning red parallelogram fins with negative space.
export function F1Logo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 60 26"
      fill="#E10600"
      aria-label="F1"
      className={className}
    >
      {/* Left fin (F shape) — forward-leaning parallelogram */}
      <polygon points="0,26 8,0 36,0 28,26" fill="#E10600" />
      {/* Right fin (1 shape) — narrower, separated by negative space */}
      <polygon points="39,26 47,0 60,0 52,26" fill="#E10600" />
    </svg>
  );
}
