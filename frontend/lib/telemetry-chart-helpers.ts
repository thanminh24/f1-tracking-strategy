// SVG chart rendering helpers for telemetry multi-lap traces.
import type { TelemetrySample } from "./types";

export interface ChannelDef {
  key: keyof TelemetrySample;
  label: string;
  unit: string;
  min: number;
  max: number;
}

export const CHANNELS: Record<"speed" | "throttle" | "brake" | "gear", ChannelDef> = {
  speed: { key: "speed_kmh", label: "Speed", unit: "km/h", min: 0, max: 350 },
  throttle: { key: "throttle", label: "Throttle", unit: "%", min: 0, max: 100 },
  brake: { key: "brake", label: "Brake", unit: "", min: 0, max: 1 },
  gear: { key: "gear", label: "Gear", unit: "", min: 0, max: 8 },
};

export const PAD_L = 50;
export const PAD_R = 8;
export const PAD_T = 4;
export const PAD_B = 20;
export const W = 900;
export const ROW_H = 100;

export function getChannelValue(sample: TelemetrySample, channel: keyof TelemetrySample): number {
  if (channel === "brake") return sample[channel] ? 1 : 0;
  return Number(sample[channel]) || 0;
}

export function toX(d: number, maxDist: number): number {
  return PAD_L + ((d / maxDist) * (W - PAD_L - PAD_R));
}

export function toY(v: number, channel: ChannelDef, rowH: number): number {
  const H = rowH - PAD_T - PAD_B;
  return PAD_T + H - Math.min(((v - channel.min) / (channel.max - channel.min)) * H, H);
}
