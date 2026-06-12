// Design token constants — JS mirrors of the CSS vars in globals.css.
// Use these when Tailwind class names aren't available (Canvas2D, d3, inline styles).

export const COLORS = {
  // Brand
  f1Red:       "#E10600",
  f1RedDim:    "#8B0400",

  // Surfaces
  surface:     "#0a0a0a",
  panel:       "#141414",
  panelHover:  "#1c1c1c",
  border:      "#252525",
  borderSubtle:"#1a1a1a",

  // Text
  textPrimary:  "#f0f0f0",
  textSecondary:"#a0a0a0",
  textMuted:    "#555555",

  // Status
  green:   "#22c55e",
  amber:   "#f59e0b",
  yellow:  "#eab308",
  purple:  "#bf00ff",   // fastest lap
  red:     "#ef4444",

  // Compound colors (mirrors team-colors.ts COMPOUND_COLORS)
  soft:         "#ef4444",
  medium:       "#eab308",
  hard:         "#e5e7eb",
  intermediate: "#22c55e",
  wet:          "#3b82f6",
} as const;

// Track-status → canvas stroke color (used by Canvas2D track map)
export const TRACK_STATUS_COLORS: Record<string, string> = {
  green:       "#2a2a2a",
  yellow_zone: COLORS.yellow,
  vsc:         COLORS.yellow,
  sc:          COLORS.amber,
  red:         COLORS.red,
};

// Official F1 team colors — also defined in team-colors.ts; exported here
// for Canvas2D and d3 usage without importing the fuzzy-match function.
export const TEAM_COLORS: Record<string, string> = {
  "red bull":     "#3671C6",
  ferrari:        "#E8002D",
  mercedes:       "#27F4D2",
  mclaren:        "#FF8000",
  "aston martin": "#229971",
  alpine:         "#FF87BC",
  williams:       "#64C4FF",
  "racing bulls": "#6692FF",
  rb:             "#6692FF",
  sauber:         "#52E252",
  audi:           "#00E701",
  haas:           "#B6BABD",
  cadillac:       "#D4AF37",
  default:        "#888888",
};

// Spacing scale (px values for Canvas2D)
export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
} as const;
