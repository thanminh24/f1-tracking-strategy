"use client";
// Safety-car probability gauge + sparkline history.
import { usePredictionStore } from "../../lib/prediction-store";
import { pct } from "../../lib/prediction-types";

function arc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startDeg));
  const y1 = cy + r * Math.sin(toRad(startDeg));
  const x2 = cx + r * Math.cos(toRad(endDeg));
  const y2 = cy + r * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
}

function gaugeColor(p: number): string {
  if (p < 0.15) return "#22C55E";
  if (p < 0.35) return "#F59E0B";
  return "#E10600";
}

export function ScGauge() {
  const { prediction, scHistory } = usePredictionStore();

  const p1 = prediction?.sc_prob_1lap ?? 0;
  const p5 = prediction?.sc_prob_5laps ?? 0;
  const color = gaugeColor(p1);

  // Gauge arc: 220° sweep from -200° to 20°
  const START = 200;
  const SWEEP = 220;
  const filled = START + SWEEP * p1;

  // Sparkline
  const W = 80, H = 24;
  const maxP = Math.max(...scHistory.map((h) => h.p1), 0.01);
  const sparkPts = scHistory.map((h, i) => {
    const x = (i / Math.max(scHistory.length - 1, 1)) * W;
    const y = H - (h.p1 / maxP) * H;
    return `${x},${y}`;
  });

  return (
    <div className="flex items-center gap-3">
      {/* SVG gauge */}
      <svg width="72" height="40" viewBox="0 0 100 60">
        {/* Background arc */}
        <path
          d={arc(50, 50, 36, -200, 20)}
          fill="none"
          stroke="#2D2D2D"
          strokeWidth="8"
          strokeLinecap="round"
        />
        {/* Filled arc */}
        {p1 > 0.01 && (
          <path
            d={arc(50, 50, 36, -200, -200 + SWEEP * p1)}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
          />
        )}
        <text x="50" y="55" textAnchor="middle" fontSize="14" fontFamily="ui-monospace, monospace" fill={color} fontWeight="bold">
          {pct(p1)}
        </text>
      </svg>

      <div className="flex flex-col gap-1">
        <div className="text-[10px] text-f1-muted uppercase tracking-widest">SC Probability</div>
        <div className="flex items-center gap-2">
          <span className="font-data text-xs text-f1-text-dim">5L:</span>
          <span className="font-data text-xs font-semibold" style={{ color: gaugeColor(p5) }}>
            {pct(p5)}
          </span>
        </div>

        {/* Sparkline */}
        {sparkPts.length > 1 && (
          <svg width={W} height={H} className="mt-0.5">
            <polyline
              points={sparkPts.join(" ")}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
          </svg>
        )}
      </div>
    </div>
  );
}
