import { describe, expect, it } from "vitest";
import { analyzeReplayPerformance } from "./replay-analytics";
import type { CompletedTrade } from "./replay";

const trade = (ticker: string, value: number, profit: number, holdingDays = 0, exitDate = "2026-07-01"): CompletedTrade => ({
  ticker, entryDate: "2026-06-30", exitDate, averageEntryPrice: 10, averageExitPrice: 11,
  quantity: 1, realizedProfit: profit, returnPercent: value, holdingDays, buyCount: 1, sellCount: 1,
});

describe("Replay performance analytics", () => {
  it("calculates payoff, expectancy, streak and drawdown", () => {
    const result = analyzeReplayPerformance([
      trade("AAA", 10, 100, 0, "2026-07-01"),
      trade("AAA", -5, -50, 1, "2026-07-02"),
      trade("BBB", -15, -150, 2, "2026-07-03"),
    ]);
    expect(result.winRate).toBeCloseTo(33.333);
    expect(result.payoffRatio).toBe(1);
    expect(result.expectancy).toBeCloseTo(-3.333);
    expect(result.maximumLossStreak).toBe(2);
    expect(result.maximumDrawdown).toBe(-200);
    expect(result.expectedProfit).toBeCloseTo(-33.333);
  });

  it("groups ticker, holding period and distribution", () => {
    const result = analyzeReplayPerformance([trade("AAA", 12, 120), trade("AAA", -22, -220), trade("BBB", 3, 30, 5)]);
    expect(result.tickerRows.find((row) => row.label === "AAA")?.trades).toBe(2);
    expect(result.holdingRows.map((row) => row.label)).toEqual(["당일", "4~7일"]);
    expect(result.distribution.find((row) => row.label === "-20% 이하")?.count).toBe(1);
  });
});
