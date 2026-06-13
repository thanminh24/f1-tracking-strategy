interface Props {
  /** Raw DRS channel 45 value: 0-7=off, 8=eligible, 10-14=active */
  drsValue: number | undefined;
  inPit?: boolean;
  pitOut?: boolean;
}

export function DrsBadge({ drsValue, inPit, pitOut }: Props) {
  if (inPit) {
    return <span className="font-data text-[9px] text-zinc-400 w-7 text-center">PIT</span>;
  }
  if (pitOut) {
    return <span className="font-data text-[9px] text-blue-400 w-7 text-center">OUT</span>;
  }
  if (drsValue == null) {
    return <span className="w-7" />;
  }
  if (drsValue >= 10) {
    return (
      <span className="font-data text-[9px] font-bold text-green-400 w-7 text-center">DRS</span>
    );
  }
  if (drsValue === 8) {
    return (
      <span className="font-data text-[9px] text-green-700 w-7 text-center">DRS</span>
    );
  }
  return <span className="font-data text-[9px] text-zinc-600 w-7 text-center">DRS</span>;
}
