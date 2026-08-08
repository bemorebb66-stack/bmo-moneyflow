import { describe, expect, it } from "vitest";
import { sampleQuadrantPoints } from "./quadrant-canvas";

describe("sampleQuadrantPoints", () => {
  it("caps rendered points while preserving all four quadrants and large candidates", () => {
    const points = Array.from({ length: 3_000 }, (_, index) => ({
      ticker: `T${index}`,
      x: index % 2 ? 20 : -20,
      y: index % 4 < 2 ? 3 : -3,
      z: index + 1,
    }));

    const sampled = sampleQuadrantPoints(points, 500);

    expect(sampled).toHaveLength(500);
    expect(new Set(sampled.map((point) => `${point.x >= 0}:${point.y > 0}`))).toEqual(
      new Set(["true:true", "true:false", "false:true", "false:false"]),
    );
    expect(sampled.some((point) => point.ticker === "T2999")).toBe(true);
  });
});
