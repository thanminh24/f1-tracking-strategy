import { describe, expect, it } from "vitest";
import { parseLapTimeMs, formatLapMs } from "../lap-time-parse";
import { formatIntervalGap, formatLeaderGap } from "../timing-gap";
import { mergeRaceControlMessages, raceControlKey } from "../race-control-merge";
import type { RaceControlMessage } from "../types";

describe("parseLapTimeMs", () => {
  it("parses mm:ss.sss", () => {
    expect(parseLapTimeMs("1:32.456")).toBeCloseTo(92456, 0);
  });

  it("parses seconds only", () => {
    expect(parseLapTimeMs("92.456")).toBeCloseTo(92456, 0);
  });
});

describe("formatLeaderGap", () => {
  it("shows Leader for zero gap", () => {
    expect(formatLeaderGap(0)).toBe("Leader");
  });

  it("uses raw lap string for lapped cars", () => {
    expect(formatLeaderGap(null, "+1L")).toBe("+1L");
  });

  it("formats seconds", () => {
    expect(formatLeaderGap(3.142)).toBe("+3.142");
  });
});

describe("formatIntervalGap", () => {
  it("shows dash for leader", () => {
    expect(formatIntervalGap(null, undefined, 1)).toBe("—");
  });

  it("uses raw interval string", () => {
    expect(formatIntervalGap(null, "+0.842", 2)).toBe("+0.842");
  });
});

describe("mergeRaceControlMessages", () => {
  const msg = (lap: number, text: string): RaceControlMessage => ({
    lap,
    t_session_s: lap * 1000,
    message: text,
    category: "Other",
  });

  it("dedupes by key", () => {
    const a = msg(1, "DRS enabled");
    const merged = mergeRaceControlMessages([a], [a, msg(2, "Yellow flag")]);
    expect(merged).toHaveLength(2);
    expect(merged[0].message).toBe("Yellow flag");
  });

  it("stable keys match", () => {
    expect(raceControlKey(msg(3, "SC"))).toBe("3:Other:SC");
  });
});

describe("formatLapMs", () => {
  it("formats sub-minute laps", () => {
    expect(formatLapMs(82456)).toBe("1:22.456");
    expect(formatLapMs(45000)).toBe("45.000");
  });
});
