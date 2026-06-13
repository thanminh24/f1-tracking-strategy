import type { LiveSector } from "../../lib/types";

interface Props {
  sectors: Record<string, LiveSector> | undefined;
}

function segmentColor(status: number): string {
  if (status === 2051) return "bg-purple-500";   // overall fastest
  if (status === 2049) return "bg-green-400";    // personal best
  if (status === 2048) return "bg-yellow-400";   // yellow flag
  return "bg-zinc-700";                           // not yet reached
}

export function MiniSectorChips({ sectors }: Props) {
  if (!sectors) return null;

  const sectorKeys = Object.keys(sectors).sort((a, b) => Number(a) - Number(b));
  if (sectorKeys.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5">
      {sectorKeys.map((sk) => {
        const sector = sectors[sk];
        const segments = sector.Segments;
        if (!segments) return null;
        const segKeys = Object.keys(segments).sort((a, b) => Number(a) - Number(b));

        return (
          <div key={sk} className="flex items-center gap-px">
            {segKeys.map((segKey) => (
              <span
                key={segKey}
                className={`inline-block w-[3px] h-[10px] rounded-sm ${segmentColor(segments[segKey].Status)}`}
              />
            ))}
            {/* Small gap between sectors */}
            <span className="w-px" />
          </div>
        );
      })}
    </div>
  );
}
