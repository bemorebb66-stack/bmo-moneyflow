import { describe, expect, it } from "vitest";
import { combineReplayTrades, sortReplayExecutions, type ReplayExecution } from "./replay";

const row = (overrides: Partial<ReplayExecution>): ReplayExecution => ({
  ticker: "TEST", transactionDate: "2026-04-01", side: "buy", quantity: 100,
  price: 10, fee: 0, row: 1, ...overrides,
});

describe("Replay execution ordering", () => {
  it("matches a reverse chronological export", () => {
    const result = combineReplayTrades([
      row({ transactionDate: "2026-04-03", side: "sell", price: 12, row: 1 }),
      row({ transactionDate: "2026-04-01", side: "buy", row: 2 }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].realizedProfit).toBe(200);
  });

  it("supports partial sell, additional buy, and final sell", () => {
    const result = combineReplayTrades([
      row({ quantity: 100, row: 1 }),
      row({ transactionDate: "2026-04-02", side: "sell", quantity: 40, price: 12, row: 2 }),
      row({ transactionDate: "2026-04-03", side: "buy", quantity: 20, price: 11, row: 3 }),
      row({ transactionDate: "2026-04-04", side: "sell", quantity: 80, price: 13, row: 4 }),
    ]);
    expect(result.errors).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
    expect(result.trades).toHaveLength(1);
  });

  it("closes a position split across two sell executions", () => {
    const result = combineReplayTrades([
      row({ ticker: "BMNU", quantity: 457, price: 8, row: 1 }),
      row({ ticker: "BMNU", transactionDate: "2026-04-02", side: "sell", quantity: 40, price: 9, row: 2 }),
      row({ ticker: "BMNU", transactionDate: "2026-04-02", side: "sell", quantity: 417, price: 10, row: 3 }),
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
  });

  it("closes multiple buys with one sell", () => {
    const result = combineReplayTrades([
      row({ ticker: "CTNT", quantity: 200, price: 4, row: 1 }),
      row({ ticker: "CTNT", quantity: 50, price: 6, row: 2 }),
      row({ ticker: "CTNT", side: "sell", quantity: 250, price: 7, row: 3 }),
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it("separates two fully closed cycles for the same ticker", () => {
    const result = combineReplayTrades([
      row({ quantity: 10, row: 1 }),
      row({ transactionDate: "2026-04-02", side: "sell", quantity: 10, price: 11, row: 2 }),
      row({ transactionDate: "2026-04-03", quantity: 5, price: 20, row: 3 }),
      row({ transactionDate: "2026-04-04", side: "sell", quantity: 5, price: 18, row: 4 }),
    ]);
    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => trade.returnPercent)).toEqual([10, -10]);
    expect(result.warnings).toEqual([]);
  });

  it("uses buys before sells on the same day when no intraday key exists", () => {
    const result = combineReplayTrades([
      row({ ticker: "POET", side: "sell", quantity: 9, price: 12, row: 1, sourceOrderHint: "chronological" }),
      row({ ticker: "POET", side: "buy", quantity: 9, price: 10, row: 2, sourceOrderHint: "chronological" }),
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
  });

  it("handles decimal quantities and fees within tolerance", () => {
    const result = combineReplayTrades([
      row({ quantity: 0.1, price: 100, fee: 1, row: 1 }),
      row({ side: "sell", quantity: 0.03, price: 120, fee: 0.3, row: 2 }),
      row({ side: "sell", quantity: 0.07, price: 120, fee: 0.7, row: 3 }),
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].realizedProfit).toBeCloseTo(0);
    expect(result.warnings).toEqual([]);
  });

  it("reports only the true final open quantity", () => {
    const result = combineReplayTrades([
      row({ ticker: "CRDU", quantity: 100, row: 1 }),
      row({ ticker: "CRDU", side: "sell", quantity: 6, row: 2 }),
    ]);
    expect(result.warnings).toEqual(["CRDU: 미청산 수량 94주는 분석에서 제외됩니다."]);
  });

  it("restores same-day reverse source order when no execution time exists", () => {
    const result = combineReplayTrades([
      row({ side: "sell", price: 12, row: 1, sourceOrderHint: "reverse-chronological" }),
      row({ side: "buy", row: 2, sourceOrderHint: "reverse-chronological" }),
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.openingShortfalls).toEqual({});
  });

  it("uses execution time before source row order", () => {
    const sorted = sortReplayExecutions([
      row({ side: "sell", executionTime: "15:30:00", row: 1 }),
      row({ side: "buy", executionTime: "09:30:00", row: 2 }),
    ]).executions;
    expect(sorted.map((item) => item.side)).toEqual(["buy", "sell"]);
  });

  it("produces identical results for forward and reverse files", () => {
    const forward = [
      row({ transactionDate: "2026-04-01", side: "buy", row: 1 }),
      row({ transactionDate: "2026-04-03", side: "sell", price: 12, row: 2 }),
    ];
    const reverse = [
      row({ transactionDate: "2026-04-03", side: "sell", price: 12, row: 1 }),
      row({ transactionDate: "2026-04-01", side: "buy", row: 2 }),
    ];
    expect(combineReplayTrades(reverse).trades).toEqual(combineReplayTrades(forward).trades);
  });

  it("reports and resolves holdings opened before the exported range", () => {
    const executions = [row({ side: "sell", quantity: 32, price: 12 })];
    expect(combineReplayTrades(executions).openingShortfalls).toEqual({ TEST: 32 });
    const resolved = combineReplayTrades(executions, { TEST: { quantity: 32, averagePrice: 9 } });
    expect(resolved.openingShortfalls).toEqual({});
    expect(resolved.trades[0].realizedProfit).toBe(96);
  });
});
