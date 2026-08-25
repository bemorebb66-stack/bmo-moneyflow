import { describe, expect, it } from "vitest";
import {
  buildVolumeTrend,
  calculateVolumeMomentum,
  isLatestVolumeBreakout20,
} from "./volume-analysis";

const points = (values: number[]) =>
  values.map((value, index) => ({ date: `8/${index + 1}`, value }));

describe("volume analysis", () => {
  it("calculates moving averages only after complete windows", () => {
    const trend = buildVolumeTrend(
      points(Array.from({ length: 20 }, (_, index) => index + 1)),
    );
    expect(trend[3].ma5).toBeNull();
    expect(trend[4].ma5).toBe(3);
    expect(trend[18].ma20).toBeNull();
    expect(trend[19].ma20).toBe(10.5);
  });

  it("detects only a latest-session upward 20-day crossover", () => {
    expect(
      isLatestVolumeBreakout20(points([...Array(20).fill(100), 90, 150])),
    ).toBe(true);
    expect(
      isLatestVolumeBreakout20(points([...Array(20).fill(100), 120, 150])),
    ).toBe(false);
  });

  it("returns a bounded momentum score and requires 20 sessions", () => {
    expect(calculateVolumeMomentum(points(Array(19).fill(100)))).toBeNull();
    const score = calculateVolumeMomentum(
      points([...Array(20).fill(100), 200]),
    );
    expect(score).not.toBeNull();
    expect(score!).toBeGreaterThanOrEqual(0);
    expect(score!).toBeLessThanOrEqual(100);
  });
});
