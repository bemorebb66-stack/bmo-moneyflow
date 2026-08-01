import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/replay_v2/regression.json";
import { classifyGroupSignal, classifyStockSignal, isSurge, signalEligibility } from "./signal-rules";

describe("versioned signal rules", () => {
  it("matches every strict boundary in the shared regression fixture", () => {
    fixture.stock_signal_boundaries.forEach((row) => {
      expect(classifyStockSignal(row.volume_change_percent, row.price_change_percent)).toBe(row.expected);
    });
    fixture.group_signal_boundaries.forEach((row) => {
      expect(classifyGroupSignal(row.share_delta_bp, row.price_change_percent, row.volume_change_percent)).toBe(row.expected);
    });
  });

  it("requires both surge thresholds and complete finite inputs", () => {
    expect(isSurge(fixture.surge.ratio_20, fixture.surge.dollar_volume)).toBe(true);
    expect(isSurge(2, 49_999_999)).toBe(false);
    expect(signalEligibility(19, [1, 2]).status).toBe("INCOMPLETE");
    expect(signalEligibility(20, [1, Number.NaN]).reasons).toContain("MISSING_OR_NON_FINITE_INPUT");
  });
});

