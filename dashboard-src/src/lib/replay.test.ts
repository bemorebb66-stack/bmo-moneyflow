import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { addContext, calculateSha256, combineReplayTrades, MAX_REPLAY_EXECUTIONS, parseExecutionTime, parseReplayCsv, selectCompletedTrades, selectReplaySnapshot, sortReplayExecutions, validateReplaySnapshot, type CompletedTrade, type ReplayExecution, type ReplayManifest, type ReplaySnapshot } from "./replay";
import { detectLeveragedProduct } from "./etf-metadata";

const row = (overrides: Partial<ReplayExecution>): ReplayExecution => ({
  ticker: "TEST", transactionDate: "2026-04-01", side: "buy", quantity: 100,
  price: 10, fee: 0, row: 1, ...overrides,
});

describe("Replay execution ordering", () => {
  it("rejects CSV input above the execution limit", () => {
    const header = "ticker,transaction_date,transaction_type,quantity,price,fee,currency";
    const body = Array.from({ length: MAX_REPLAY_EXECUTIONS + 1 }, () => "TEST,2026-04-01,buy,1,10,0,USD").join("\n");
    const result = parseReplayCsv(`${header}\n${body}`);
    expect(result.executions).toEqual([]);
    expect(result.errors[0]).toContain(MAX_REPLAY_EXECUTIONS.toLocaleString("ko-KR"));
  });

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
      row({ ticker: "POET", side: "sell", quantity: 9, price: 12, row: 1, executionTime: "19:46:29" }),
      row({ ticker: "POET", side: "buy", quantity: 9, price: 10, row: 2, executionTime: "2:17:29" }),
    ]);
    expect(result.trades).toHaveLength(1);
    expect(result.warnings).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
  });

  it("sorts single-digit hours numerically", () => {
    const times = ["2:17:29", "19:46:29", "0:10:42", "23:42:03"];
    expect([...times].sort((a, b) => parseExecutionTime(a) - parseExecutionTime(b))).toEqual(["0:10:42", "2:17:29", "19:46:29", "23:42:03"]);
  });

  it("requires an opening holding only when running quantity becomes negative", () => {
    const covered = combineReplayTrades([
      row({ quantity: 9, executionTime: "2:17:29", row: 2 }),
      row({ side: "sell", quantity: 9, executionTime: "19:46:29", row: 1 }),
    ]);
    expect(covered.openingShortfalls).toEqual({});
    const priorHolding = combineReplayTrades([
      row({ side: "sell", quantity: 13, transactionDate: "2026-04-01", row: 2 }),
      row({ quantity: 13, transactionDate: "2026-04-02", row: 1 }),
    ]);
    expect(priorHolding.openingShortfalls).toEqual({ TEST: 13 });
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

describe("Replay v2 causality and corporate actions", () => {
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const manifestVersions = { file_hash: `sha256:${"f".repeat(64)}`, data_contract_version: "bvt-market-data/2.0.0", signal_rule_version: "bvt-signal/2.0.0", replay_rule_version: "bvt-replay/2.0.0", calendar_version: "XNYS-regular/2026.2" } as const;
  it("keeps the bundled sample inside the selectable archive range", async () => {
    const [sampleText, manifestText] = await Promise.all([
      readFile(new URL("../../../replay_data/bvt-sample-trades.csv", import.meta.url), "utf8"),
      readFile(new URL("../../../replay_data/manifest.json", import.meta.url), "utf8"),
    ]);
    const parsed = parseReplayCsv(sampleText);
    const combined = combineReplayTrades(parsed.executions);
    const manifest = JSON.parse(manifestText) as ReplayManifest;

    expect(parsed.errors).toEqual([]);
    expect(combined.trades.length).toBeGreaterThan(0);
    expect(
      combined.trades.every(
        (trade) => selectReplaySnapshot(manifest, trade).status === "SELECTED",
      ),
    ).toBe(true);
  });
  it("matches the standard raw-file SHA-256 fixture", async () => {
    await expect(calculateSha256("abc")).resolves.toBe("sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("never selects a same-day snapshot for a date-only fill", () => {
    const manifest = {
      entries: [
        { ...manifestVersions, trading_date: "2026-07-02", available_at: "2026-07-02T21:30:00Z", data_grade: "PIT_RECONSTRUCTED" as const, content_hash: `sha256:${hashA}`, path: `revisions/2026-07-02/${hashA}.json` },
        { ...manifestVersions, trading_date: "2026-07-06", available_at: "2026-07-06T21:30:00Z", data_grade: "PIT_RECONSTRUCTED" as const, content_hash: `sha256:${hashB}`, path: `revisions/2026-07-06/${hashB}.json` },
      ],
    };
    const selected = selectReplaySnapshot(manifest, { entryDate: "2026-07-06", entryTimeStatus: "DATE_ONLY" });
    expect(selected.entry?.trading_date).toBe("2026-07-02");
  });

  it("uses the exchange date rather than the UTC date for date-only causality", () => {
    const manifest = { entries: [
      { ...manifestVersions, trading_date: "2026-07-02", available_at: "2026-07-06T03:30:00Z", data_grade: "PIT_VERIFIED" as const, content_hash: `sha256:${hashA}`, path: `revisions/2026-07-02/${hashA}.json` },
    ] };
    expect(selectReplaySnapshot(manifest, { entryDate: "2026-07-06", entryTimeStatus: "DATE_ONLY" }).status).toBe("SELECTED");
    manifest.entries[0].available_at = "2026-07-06T04:01:00Z";
    expect(selectReplaySnapshot(manifest, { entryDate: "2026-07-06", entryTimeStatus: "DATE_ONLY" }).status).toBe("NO_CAUSAL_SNAPSHOT");
  });

  it("rejects legacy snapshots without a verifiable available_at", () => {
    const selected = selectReplaySnapshot({ dates: ["2026-07-02"] }, { entryDate: "2026-07-06" });
    expect(selected.status).toBe("LEGACY_MANIFEST_UNUSABLE");
  });

  it("uses a same-day revision only when an explicit zoned fill occurred later", () => {
    const manifest = {
      entries: [
        { ...manifestVersions, trading_date: "2026-07-06", available_at: "2026-07-06T13:00:00Z", data_grade: "PIT_VERIFIED" as const, content_hash: `sha256:${hashA}`, path: `revisions/2026-07-06/${hashA}.json` },
        { ...manifestVersions, trading_date: "2026-07-06", available_at: "2026-07-06T21:30:00Z", data_grade: "PIT_VERIFIED" as const, content_hash: `sha256:${hashB}`, path: `revisions/2026-07-06/${hashB}.json` },
      ],
    };
    const selected = selectReplaySnapshot(manifest, { entryDate: "2026-07-06", entryAt: "2026-07-06T14:30:00Z", entryTimeStatus: "KNOWN" });
    expect(selected.entry?.content_hash).toBe(`sha256:${hashA}`);
  });

  it("rejects path traversal and hash/path mismatches in a manifest", () => {
    const selected = selectReplaySnapshot({ entries: [{ ...manifestVersions, trading_date: "2026-07-02", available_at: "2026-07-02T21:30:00Z", data_grade: "PIT_VERIFIED", content_hash: `sha256:${hashA}`, path: "../data.json" }] }, { entryDate: "2026-07-06" });
    expect(selected.status).toBe("INVALID_MANIFEST");
  });

  it("adjusts quantity but preserves cost basis through a split", () => {
    const executions: ReplayExecution[] = [
      { ticker: "FIX", transactionDate: "2026-07-06", side: "buy", quantity: 10, price: 12, fee: 1, feeProvided: true, row: 1 },
      { ticker: "FIX", transactionDate: "2026-07-08", side: "sell", quantity: 20, price: 7, fee: 1, feeProvided: true, row: 2 },
    ];
    const result = combineReplayTrades(executions, {}, [{ ticker: "FIX", effectiveDate: "2026-07-07", actionType: "SPLIT", ratio: 2 }]);
    expect(result.errors).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
    expect(result.trades[0].quantity).toBe(20);
    expect(result.trades[0].averageEntryPrice).toBe(6.05);
    expect(result.trades[0].averageExitPrice).toBe(7);
    expect(result.trades[0].realizedProfit).toBe(18);
    expect(result.trades[0].returnPercent).toBeCloseTo(14.8760330579, 10);
  });

  it("adjusts a pre-export opening holding through a split", () => {
    const result = combineReplayTrades(
      [{ ticker: "FIX", transactionDate: "2026-07-08", side: "sell", quantity: 20, price: 7, fee: 0, feeProvided: true, row: 1 }],
      { FIX: { quantity: 10, averagePrice: 12 } },
      [{ ticker: "FIX", effectiveDate: "2026-07-07", actionType: "SPLIT", ratio: 2 }],
    );
    expect(result.errors).toEqual([]);
    expect(result.openingShortfalls).toEqual({});
    expect(result.trades[0].realizedProfit).toBe(20);
  });

  it("normalizes quantities sold before a split", () => {
    const result = combineReplayTrades([
      { ticker: "FIX", transactionDate: "2026-07-06", side: "buy", quantity: 10, price: 10, fee: 0, feeProvided: true, row: 1 },
      { ticker: "FIX", transactionDate: "2026-07-06", side: "sell", quantity: 5, price: 12, fee: 0, feeProvided: true, row: 2 },
      { ticker: "FIX", transactionDate: "2026-07-08", side: "sell", quantity: 10, price: 7, fee: 0, feeProvided: true, row: 3 },
    ], {}, [{ ticker: "FIX", effectiveDate: "2026-07-07", actionType: "SPLIT", ratio: 2 }]);
    expect(result.errors).toEqual([]);
    expect(result.trades[0].quantity).toBe(20);
    expect(result.trades[0].averageEntryPrice).toBe(5);
    expect(result.trades[0].averageExitPrice).toBe(6.5);
    expect(result.trades[0].realizedProfit).toBe(30);
  });

  it("marks settlement dates and non-trading dates as incomplete inputs", () => {
    const settlement = combineReplayTrades([
      { ticker: "FIX", transactionDate: "2026-07-06", side: "buy", quantity: 1, price: 10, fee: 0, dateBasis: "SETTLEMENT_DATE", row: 1 },
      { ticker: "FIX", transactionDate: "2026-07-07", side: "sell", quantity: 1, price: 11, fee: 0, dateBasis: "SETTLEMENT_DATE", row: 2 },
    ]);
    const weekend = combineReplayTrades([
      { ticker: "FIX", transactionDate: "2026-07-11", side: "buy", quantity: 1, price: 10, fee: 0, row: 1 },
      { ticker: "FIX", transactionDate: "2026-07-13", side: "sell", quantity: 1, price: 11, fee: 0, row: 2 },
    ]);
    expect(settlement.trades[0].dateStatus).toBe("SETTLEMENT_DATE");
    expect(weekend.trades[0].dateStatus).toBe("NON_TRADING_DATE");
  });

  it("rejects malformed versioned snapshot data", () => {
    const invalid = {
      schema_version: 2,
      trading_date: "2026-07-06",
      available_at: "2026-07-06T20:00:00",
      information_cutoff_at: "2026-07-06T21:00:00Z",
      content_hash: "bad",
      data_grade: "CURRENT_PROXY",
      signal_rule_version: "bvt-signal/2.0.0",
      replay_rule_version: "bvt-replay/2.0.0",
      market: { market_regime: "중립", dollar_volume_change_1d: null },
      groups: { sector: {}, industry: {}, market_cap: {} },
      tickers: {},
    } satisfies ReplaySnapshot;
    expect(validateReplaySnapshot(invalid)).toEqual(expect.arrayContaining(["INVALID_AVAILABLE_AT", "INVALID_CONTENT_HASH"]));
  });
});

describe("completed trade selection", () => {
  const trade = (entryDate: string, exitDate: string): CompletedTrade => ({ ticker: exitDate, entryDate, exitDate, averageEntryPrice: 10, averageExitPrice: 11, quantity: 1, realizedProfit: 1, returnPercent: 10, holdingDays: 1, buyCount: 1, sellCount: 1 });

  it("selects the latest exits and keeps an older entry date", () => {
    const trades = [trade("2025-01-01", "2026-06-01"), trade("2026-06-02", "2026-06-03"), trade("2026-06-04", "2026-06-05")];
    const selected = selectCompletedTrades(trades, { limit: 2, days: null });
    expect(selected.map((row) => row.exitDate)).toEqual(["2026-06-05", "2026-06-03"]);
    expect(selectCompletedTrades(trades, { limit: null, days: 5 })).toContainEqual(trades[0]);
  });

  it("uses final sell dates for custom filtering", () => {
    const trades = [trade("2025-01-01", "2026-06-01"), trade("2026-06-02", "2026-07-01")];
    expect(selectCompletedTrades(trades, { limit: 50, days: null, customFrom: "2026-06-15", customTo: "2026-07-31" })).toEqual([trades[1]]);
  });

  it("returns all trades when fewer than the selected limit exist", () => {
    const trades = [trade("2026-01-01", "2026-01-02"), trade("2026-02-01", "2026-02-02")];
    expect(selectCompletedTrades(trades, { limit: 50, days: null })).toHaveLength(2);
  });
});

describe("ETF market context", () => {
  const completed = (ticker: string): CompletedTrade => ({ ticker, entryDate: "2026-07-17", exitDate: "2026-07-18", averageEntryPrice: 10, averageExitPrice: 11, quantity: 1, realizedProfit: 1, returnPercent: 10, holdingDays: 1, buyCount: 1, sellCount: 1 });
  const metric = { name: "Underlying", name_ko: "기초자산", volume_state: "강함", dollar_volume_change_1d: 20, dollar_volume_ratio_5d: 1.3, dollar_volume_ratio_20d: 1.5, sector: "Technology", industry: "Semiconductors", market_cap_group: "대형주" };
  const snapshot: ReplaySnapshot = { trading_date: "2026-07-17", market: { market_regime: "중립", dollar_volume_change_1d: 1, indices: [{ symbol: "^NDX", name: "Nasdaq 100", close: 100, change_percent: 1.2 }] }, tickers: { TSLA: metric, NVDA: metric, COIN: metric, GOOGL: metric, MSTR: metric }, groups: { sector: {}, market_cap: {}, industry: { Semiconductors: { flow_status: "강한 유입", dollar_volume_change_1d: 20, dollar_volume_ratio_5d: 1.4, rank: 1 } } } };

  it("connects SOXL to semiconductor flow when ETF self data is absent", () => {
    const result = addContext(completed("SOXL"), snapshot, "정상");
    expect(result.context?.asset?.assetType).toBe("LEVERAGED_ETF");
    expect(result.context?.underlyingGroup?.flow_status).toBe("강한 유입");
    expect(result.context?.supportLevel).toBe("SECTOR_ONLY");
  });

  it("marks SOXS as an inverse product", () => {
    expect(addContext(completed("SOXS"), snapshot, "정상").context?.asset?.direction).toBe("SHORT");
  });

  it("connects TSLL to TSLA", () => {
    expect(addContext(completed("TSLL"), snapshot, "정상").context?.underlyingTicker).toEqual(metric);
  });

  it.each([["WDCX", "WDC"], ["MRVU", "MRVL"], ["ADBG", "ADBE"]])("maps %s to its verified single-stock underlying", (ticker, underlying) => {
    const withUnderlying = { ...snapshot, tickers: { ...snapshot.tickers, [underlying]: metric } };
    const context = addContext(completed(ticker), withUnderlying, "정상").context;
    expect(context?.asset?.underlyingTicker).toBe(underlying);
    expect(context?.asset?.mappingStatus).toBe("VERIFIED");
    expect(context?.supportLevel).toBe("UNDERLYING_ONLY");
  });

  it("classifies UVIX as volatility without forcing a sector", () => {
    const context = addContext(completed("UVIX"), snapshot, "정상").context;
    expect(context?.asset?.underlyingType).toBe("VOLATILITY");
    expect(context?.industry).toBeUndefined();
    expect(context?.supportLevel).toBe("UNSUPPORTED");
  });

  it("flags name-detected leveraged products for review without guessing an underlying", () => {
    const candidate = detectLeveragedProduct("NEWX", "Example Daily Bull 2X ETF");
    expect(candidate?.mappingStatus).toBe("REVIEW_REQUIRED");
    expect(candidate?.underlyingType).toBe("UNKNOWN");
    expect(candidate?.underlyingTicker).toBeUndefined();
  });

  it("uses one concise unsupported status", () => {
    const result = addContext(completed("UNMAPPED"), snapshot, "정상");
    expect(result.contextStatus).toBe("과거 가격·거래대금 데이터가 없어 기본 매매 결과만 제공합니다.");
    expect(result.context?.supportLevel).toBe("HISTORICAL_DATA_MISSING");
    expect(result.context?.missingReasons).toHaveLength(1);
  });
});
