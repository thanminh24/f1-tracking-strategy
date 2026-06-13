"use client";

interface ChartData {
  minLap: number;
  maxLap: number;
  lapRange: number;
  scLaps: Set<number>;
}

interface Props {
  scHistory: { lap: number; p1: number }[];
  scHistory5: { lap: number; p5: number }[];
  chartData: ChartData;
}

export function ScProbabilityChart({ scHistory, scHistory5, chartData }: Props) {
  const chartWidth = 400;
  const chartHeight = 120;
  const padding = { top: 10, bottom: 30, left: 30, right: 10 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  const lapToX = (lap: number) => {
    return padding.left + ((lap - chartData.minLap) / Math.max(1, chartData.lapRange)) * plotWidth;
  };

  const probToY = (prob: number) => {
    return padding.top + (1 - Math.max(0, Math.min(1, prob))) * plotHeight;
  };

  const p1Path = scHistory.map((h) => `${lapToX(h.lap)},${probToY(h.p1)}`).join(" L ");
  const p5Path = scHistory5.map((h) => `${lapToX(h.lap)},${probToY(h.p5)}`).join(" L ");

  const redZoneY = probToY(0.7);
  const amberZoneY = probToY(0.4);

  return (
    <svg
      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
      className="min-w-full"
      style={{ minHeight: "180px" }}
    >
      {/* Background zones */}
      <rect
        x={padding.left}
        y={padding.top}
        width={plotWidth}
        height={redZoneY - padding.top}
        fill="#dc2626"
        opacity="0.1"
      />
      <rect
        x={padding.left}
        y={redZoneY}
        width={plotWidth}
        height={amberZoneY - redZoneY}
        fill="#eab308"
        opacity="0.1"
      />
      <rect
        x={padding.left}
        y={amberZoneY}
        width={plotWidth}
        height={padding.top + plotHeight - amberZoneY}
        fill="#22c55e"
        opacity="0.1"
      />

      {/* Zone threshold lines */}
      <line
        x1={padding.left}
        y1={redZoneY}
        x2={padding.left + plotWidth}
        y2={redZoneY}
        stroke="#dc2626"
        strokeWidth="1"
        strokeDasharray="2,2"
        opacity="0.5"
      />
      <line
        x1={padding.left}
        y1={amberZoneY}
        x2={padding.left + plotWidth}
        y2={amberZoneY}
        stroke="#eab308"
        strokeWidth="1"
        strokeDasharray="2,2"
        opacity="0.5"
      />

      {/* SC deployment lines */}
      {Array.from(chartData.scLaps).map((lap) => (
        <line
          key={`sc-${lap}`}
          x1={lapToX(lap)}
          y1={padding.top}
          x2={lapToX(lap)}
          y2={padding.top + plotHeight}
          stroke="#f97316"
          strokeWidth="2"
          opacity="0.4"
        />
      ))}

      {/* Data lines */}
      {p1Path && (
        <polyline
          points={p1Path}
          fill="none"
          stroke="#f97316"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {p5Path && (
        <polyline
          points={p5Path}
          fill="none"
          stroke="#eab308"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      )}

      {/* Y-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1.0].map((prob) => (
        <g key={`y-label-${prob}`}>
          <line
            x1={padding.left - 5}
            y1={probToY(prob)}
            x2={padding.left}
            y2={probToY(prob)}
            stroke="#666"
            strokeWidth="1"
          />
          <text
            x={padding.left - 8}
            y={probToY(prob) + 3}
            fontSize="10"
            textAnchor="end"
            fill="#999"
            className="select-none"
          >
            {(prob * 100).toFixed(0)}%
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {scHistory.length > 0 && (
        <>
          <text
            x={lapToX(chartData.minLap)}
            y={chartHeight - 8}
            fontSize="10"
            textAnchor="middle"
            fill="#999"
            className="select-none"
          >
            L{chartData.minLap}
          </text>
          <text
            x={lapToX(chartData.maxLap)}
            y={chartHeight - 8}
            fontSize="10"
            textAnchor="middle"
            fill="#999"
            className="select-none"
          >
            L{chartData.maxLap}
          </text>
        </>
      )}
    </svg>
  );
}
