import { describe, expect, it } from "vitest";
import fixture from "../../../tests/fixtures/replay_v2/regression.json";
import { excessReturn, netLongReturn, summarizeSignalPerformance } from "./signal-performance";

describe("signal performance contract", () => {
  it("matches the known cost and benchmark result", () => {
    const row = fixture.costed_return;
    const sideCost = (row.commission_bp_per_side + row.slippage_bp_per_side) / 10_000;
    const result = netLongReturn(row.entry_adjusted_open, row.exit_adjusted_close, sideCost);
    expect(result).toBeCloseTo(row.expected_net_return, 12);
    expect(excessReturn(result, row.benchmark_return)).toBeCloseTo(row.expected_excess_return, 12);
  });

  it("does not promote current-universe proxy data to official performance", () => {
    const outcomes = Array.from({ length: 30 }, (_, index) => ({ status: "COMPLETE" as const, netReturn: index / 1000 }));
    const result = summarizeSignalPerformance(outcomes, 30, "CURRENT_PROXY");
    expect(result.status).toBe("UNAVAILABLE_DATA_GRADE");
    expect(result.isConfirmatory).toBe(false);
    expect(result.sampleCount).toBe(30);
    expect(result.median).not.toBeNull();
  });

  it("reports missing outcomes and bad prices without a definitive statistic", () => {
    const result = summarizeSignalPerformance([
      { status: "COMPLETE", netReturn: 0.1 },
      { status: "INCOMPLETE", reasons: ["DELISTING_VALUE_UNKNOWN"] },
    ], 2, "PIT_VERIFIED");
    expect(result.status).toBe("INCOMPLETE");
    expect(result.coverage).toBe(0.5);
    expect(() => netLongReturn(Number.NaN, 10)).toThrow();
  });
});

