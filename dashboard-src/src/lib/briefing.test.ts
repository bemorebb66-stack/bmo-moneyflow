import { describe, expect, it } from "vitest";
import {
  BRIEFING_DISCLAIMER,
  buildDailyBriefing,
  buildReplaySnapshotFromMarketData,
  buildWatchlistBriefing,
  buildWeeklySentences,
  type ReplaySnapshot,
  type WeeklySource,
} from "./briefing";

const representativeSnapshot: ReplaySnapshot = {
  schema_version: 1,
  trading_date: "2026-07-29",
  generated_at: "2026-07-29T23:45:28+00:00",
  source_updated_at: "2026-07-29 23:34 UTC",
  market: {
    total_dollar_volume: 740_101_954_511,
    dollar_volume_change_1d: -6.61,
    advancing_stocks: 920,
    declining_stocks: 2030,
  },
  groups: {
    sector: {
      Industrials: {
        dollar_volume: 90_000_000_000,
        dollar_volume_change_1d: 20,
      },
      Technology: {
        dollar_volume: 326_514_386_453,
        dollar_volume_change_1d: -5.43,
      },
      Energy: {
        dollar_volume: 20_000_000_000,
        dollar_volume_change_1d: -30,
      },
      Healthcare: {
        dollar_volume: 303_587_568_058,
        dollar_volume_change_1d: -4,
      },
    },
  },
  tickers: {
    AAPL: {
      name_ko: "애플",
      daily_return: -0.56,
      dollar_volume: 16_521_557_297,
      dollar_volume_ratio_20d: 1.0327,
      asset_type: "COMMON_STOCK",
    },
    NVDA: {
      name_ko: "엔비디아",
      daily_return: -2.1,
      dollar_volume: 32_000_000_000,
      dollar_volume_ratio_20d: 1.8,
      asset_type: "COMMON_STOCK",
    },
  },
};

describe("deterministic daily briefing", () => {
  it("builds the Today briefing from the already loaded market payload", () => {
    const snapshot = buildReplaySnapshotFromMarketData({
      market_date: "2026-07-29",
      updated: "2026-07-29 23:34 UTC",
      stocks: [
        { t: "AAA", n: "Alpha", pc: 2, dv: 60, dvp: 50, a5: 40, a20: 30, sec: "Technology" },
        { t: "BBB", n: "Beta", pc: -1, dv: 40, dvp: 50, a5: 50, a20: 50, sec: "Energy" },
      ],
      indices: [],
    });
    expect(snapshot).not.toBeNull();
    expect(snapshot?.market).toMatchObject({
      total_dollar_volume: 100,
      dollar_volume_change_1d: 0,
      advancing_stocks: 1,
      declining_stocks: 1,
    });
    expect(snapshot?.tickers?.AAA.dollar_volume_ratio_20d).toBe(2);
    expect(snapshot?.groups?.sector?.Technology).toMatchObject({
      dollar_volume: 60,
      dollar_volume_change_1d: 20,
      members: 1,
    });
  });

  it("reproduces the representative date from source values", () => {
    const first = buildDailyBriefing(representativeSnapshot);
    const second = buildDailyBriefing(representativeSnapshot);
    expect(second).toEqual(first);
    expect(first.date).toBe("2026-07-29");
    expect(first.market.advancingShare).toBeCloseTo(31.1864, 3);
    expect(first.sentences[0].text).toBe(
      "전체 거래대금은 $740.1B로 전일 대비 6.6% 감소했고 상승 종목 비중은 31.2%로 하락 종목이 우세했습니다.",
    );
    expect(first.shareText).toContain("2026-07-29 미국 장 마감 브리핑");
  });

  it("uses stable watchlist ranking and reports unavailable rows", () => {
    const result = buildWatchlistBriefing(representativeSnapshot, [
      "aapl",
      "NVDA",
      "MISSING",
      "NVDA",
    ]);
    expect(result.savedCount).toBe(3);
    expect(result.availableCount).toBe(2);
    expect(result.missingTickers).toEqual(["MISSING"]);
    expect(result.rows.map((row) => row.ticker)).toEqual(["NVDA", "AAPL"]);
    expect(result.sentence).toContain("NVDA가 1.80배로 가장 높았습니다");
  });

  it("does not emit prohibited return guarantees", () => {
    const text = [
      ...buildDailyBriefing(representativeSnapshot).sentences.map((row) => row.text),
      BRIEFING_DISCLAIMER,
    ].join(" ");
    for (const prohibited of ["수익 보장", "폭등 임박", "강력 매수", "매수 기회"])
      expect(text).not.toContain(prohibited);
  });
});

describe("weekly briefing wording", () => {
  it("never calls a negative sector change an expansion", () => {
    const week: WeeklySource = {
      weekId: "2026-04-06",
      label: "4월 6일 주간",
      startDate: "2026-04-06",
      endDate: "2026-04-10",
      status: "complete",
      tradingDays: 5,
      indices: [],
      market: {
        averageDollarVolume: 528_564_997_541,
        lastDayVolumeChange: 9.66,
        advancingShare: 58.1,
      },
      sectorGainers: [
        { id: "Technology", name: "테크놀로지", changeBp: 908, share: 45.27 },
        { id: "Consumer Defensive", name: "필수 소비재", changeBp: -27, share: 3.47 },
      ],
      sectorLosers: [
        { id: "Consumer Cyclical", name: "임의 소비재", changeBp: -293, share: 11.2 },
        { id: "Industrials", name: "산업재", changeBp: -103, share: 8.54 },
      ],
      activeStocks: [],
    };
    const result = buildWeeklySentences(week);
    expect(result.sectorSentence).toContain("테크놀로지 908bp 확대");
    expect(result.sectorSentence).not.toContain("필수 소비재 27bp 확대");
    expect(result.sectorSentence).toContain("임의 소비재 293bp · 산업재 103bp 축소됐습니다");
  });
});
