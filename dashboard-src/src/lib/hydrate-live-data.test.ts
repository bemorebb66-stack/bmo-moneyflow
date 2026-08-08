import { describe, expect, it } from "vitest";
import {
  hydrateLiveData,
  normalizeInsiderPayload,
  normalizeLatestMarketStocks,
  type MarketStock,
} from "./hydrate-live-data";
import {
  LIVE_GROUP_COMPANIES,
  LIVE_GROUP_SERIES,
  LIVE_MARKET_DATA,
  LIVE_STOCKS,
  type MarketCategory,
} from "./mock-data";


describe("normalizeInsiderPayload", () => {
  it("keeps only fully validated and arithmetically consistent trades in totals", () => {
    const result = normalizeInsiderPayload({
      trades: [
        {
          ticker: "GOOD",
          company: "Good Inc.",
          filer: "Valid Insider",
          role: "CEO",
          txType: "매수",
          shares: 100,
          price: 10,
          value: 1000,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
          qualityStatus: "accepted",
          accession: "0000000001-26-000001",
        },
        {
          ticker: "BAD",
          company: "Bad Inc.",
          filer: "Pending Insider",
          role: "Director",
          txType: "매도",
          shares: 100,
          price: 10,
          value: 1_000_000,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
          qualityStatus: "accepted",
          accession: "0000000002-26-000001",
        },
      ],
      pendingTrades: [
        {
          ticker: "WAIT",
          company: "Wait Inc.",
          filer: "Waiting Insider",
          role: "Officer",
          txType: "매수",
          shares: 50,
          price: 20,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
          qualityStatus: "pending",
          accession: "0000000003-26-000001",
          validationReasons: [{ code: "MARKET_PRICE_EXTREME" }],
        },
      ],
    });

    expect(result.accepted.map((row) => row.ticker)).toEqual(["GOOD"]);
    expect(result.accepted[0].amount).toBe(0.001);
    expect(result.pending.map((row) => row.ticker)).toEqual(["BAD", "WAIT"]);
    expect(result.pending.every((row) => row.amount === 0)).toBe(true);
    expect(result.pending[0].validationReasons).toContain(
      "SHARES_PRICE_VALUE_MISMATCH",
    );
    expect(result.pending[1].validationReasons).toContain(
      "MARKET_PRICE_EXTREME",
    );
  });

  it("treats legacy unvalidated rows as pending", () => {
    const result = normalizeInsiderPayload({
      trades: [
        {
          ticker: "LEGACY",
          company: "Legacy Inc.",
          filer: "Legacy Insider",
          txType: "매수",
          shares: 10,
          price: 5,
          value: 50,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
        },
      ],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].validationReasons).toContain(
      "VALIDATION_NOT_CONFIRMED",
    );
  });
});

const marketStock = (
  ticker: string,
  dv: number,
  overrides: Partial<MarketStock> = {},
): MarketStock => ({
  t: ticker,
  n: `${ticker} Inc.`,
  sec: "Technology",
  ind: "Semiconductors",
  uni: ["Nasdaq 100", "Nasdaq 100"],
  grp: "Power",
  cap: "Large Cap",
  c: 10,
  pc: 1,
  dv,
  dvp: dv / 2,
  a5: dv / 2,
  a20: dv / 2,
  a60: dv / 2,
  mc: 1_000_000_000,
  ...overrides,
});

describe("current market projection", () => {
  it("keeps the last valid canonical ticker record", () => {
    const rows = normalizeLatestMarketStocks([
      marketStock(" be ", 100),
      marketStock("BE", 300),
      marketStock("be", Number.NaN),
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ t: "BE", dv: 300 });
  });

  it("does not accumulate current companies when market and history hydrate repeatedly", async () => {
    const market = {
      updated: "2026-08-08 07:30 UTC",
      market_date: "2026-08-07",
      indices: [],
      stocks: [
        marketStock(" be ", 100),
        marketStock("BE", 300),
        marketStock("OTHER", 200),
      ],
    };
    const history = {
      dates: ["2026-08-06", "2026-08-07"],
      sector: { Technology: [100, 110] },
      industry: { Semiconductors: [100, 110] },
      universe: { "Nasdaq 100": [100, 110] },
      custom: { Power: [100, 110] },
      cap: { "Large Cap": [100, 110] },
      stocks: { BE: [10, 12], OTHER: [20, 21] },
    };
    const payload = { "/data.json": market, "/history.json": history };

    await hydrateLiveData(payload);
    await hydrateLiveData(payload);

    const groupIds: Record<MarketCategory, string> = {
      sector: "technology",
      industry: "industry:Semiconductors",
      universe: "universe:Nasdaq 100",
      custom: "custom:Power",
      mcap: "mcap:Large Cap",
    };
    expect(LIVE_STOCKS.map((row) => row.ticker)).toEqual(["BE", "OTHER"]);
    for (const [category, id] of Object.entries(groupIds) as Array<
      [MarketCategory, string]
    >) {
      const companies = LIVE_GROUP_COMPANIES[id];
      expect(companies.map((row) => row.ticker)).toEqual(["BE", "OTHER"]);
      expect(companies.filter((row) => row.ticker === "BE")).toHaveLength(1);
      expect(companies.reduce((sum, row) => sum + row.volume, 0)).toBeCloseTo(
        500 / 1e6,
      );
      expect(LIVE_MARKET_DATA[category]["1d"][0].volume).toBeCloseTo(
        500 / 1e6,
      );
    }
    expect(LIVE_GROUP_SERIES["stock:BE"]).toHaveLength(2);
  });
});
