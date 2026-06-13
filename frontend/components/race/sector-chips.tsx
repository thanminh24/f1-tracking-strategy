import type { LapRow } from "../../lib/types";

interface SectorChipsProps {
  laps: LapRow[];
  carId: string;
}

function getSectorColor(
  sectorTime: number | null | undefined,
  sessionBest: number | null,
  personalBest: number | null
): string {
  if (sectorTime == null) return "#707070"; // grey for no data
  if (sessionBest != null && sectorTime === sessionBest) return "#A855F7"; // purple for session best
  if (personalBest != null && sectorTime === personalBest) return "#22C55E"; // green for personal best
  return "#F59E0B"; // yellow for other
}

export function SectorChips({ laps, carId }: SectorChipsProps) {
  if (!laps || laps.length === 0) return null;

  // Get this driver's laps
  const driverLaps = laps.filter((l) => l.car_id === carId && l.lap_time_ms != null);
  if (driverLaps.length === 0) return null;

  // Get sector bests for this driver
  const s1Best = Math.min(...driverLaps.map((l) => l.sector_1_ms ?? Infinity).filter((v) => isFinite(v)));
  const s2Best = Math.min(...driverLaps.map((l) => l.sector_2_ms ?? Infinity).filter((v) => isFinite(v)));
  const s3Best = Math.min(...driverLaps.map((l) => l.sector_3_ms ?? Infinity).filter((v) => isFinite(v)));

  // Get session bests (across all drivers)
  const s1Session = Math.min(...laps.map((l) => l.sector_1_ms ?? Infinity).filter((v) => isFinite(v)));
  const s2Session = Math.min(...laps.map((l) => l.sector_2_ms ?? Infinity).filter((v) => isFinite(v)));
  const s3Session = Math.min(...laps.map((l) => l.sector_3_ms ?? Infinity).filter((v) => isFinite(v)));

  // Get the last completed lap from this driver
  const lastLap = driverLaps[driverLaps.length - 1];
  if (!lastLap) return null;

  // Only show if last lap has sector data
  if (lastLap.sector_1_ms == null || lastLap.sector_2_ms == null || lastLap.sector_3_ms == null) {
    return null;
  }

  const s1Color = getSectorColor(lastLap.sector_1_ms, isFinite(s1Session) ? s1Session : null, isFinite(s1Best) ? s1Best : null);
  const s2Color = getSectorColor(lastLap.sector_2_ms, isFinite(s2Session) ? s2Session : null, isFinite(s2Best) ? s2Best : null);
  const s3Color = getSectorColor(lastLap.sector_3_ms, isFinite(s3Session) ? s3Session : null, isFinite(s3Best) ? s3Best : null);

  return (
    <div className="flex gap-1">
      <span className="w-1.5 h-5 shrink-0" style={{ backgroundColor: s1Color }} />
      <span className="w-1.5 h-5 shrink-0" style={{ backgroundColor: s2Color }} />
      <span className="w-1.5 h-5 shrink-0" style={{ backgroundColor: s3Color }} />
    </div>
  );
}
