// DRS zone rendering utility for track map canvas
import type { TrackGeo } from "./use-track-geo";
import type { DrsZone } from "./drs-zones";

/**
 * Draw DRS activation zones on the track canvas.
 * Samples zone activation line at 20 points and renders as a stroked path.
 * Handles wrap-around cases where end < activation (crosses lap boundary).
 */
export function drawDrsZones(
  ctx: CanvasRenderingContext2D,
  geo: TrackGeo,
  zones: DrsZone[],
  drsColor: string,
  offX: number,
  offY: number,
  scale: number
) {
  if (!zones || zones.length === 0) return;

  const toCanvas = (vx: number, vy: number) => ({
    x: offX + vx * scale,
    y: offY + vy * scale,
  });

  ctx.strokeStyle = drsColor;
  ctx.lineWidth = 4 * scale;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const zone of zones) {
    // Sample activation → end range at 20 points
    const steps = 20;

    // Handle wrap-around (e.g., 0.95 → 0.04)
    const span =
      zone.end >= zone.activation
        ? zone.end - zone.activation
        : 1 - zone.activation + zone.end;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const frac = (zone.activation + span * t) % 1;
      const pt = geo.at(frac);
      const c = toCanvas(pt.x, pt.y);

      if (i === 0) ctx.moveTo(c.x, c.y);
      else ctx.lineTo(c.x, c.y);
    }
    ctx.stroke();
  }
}
