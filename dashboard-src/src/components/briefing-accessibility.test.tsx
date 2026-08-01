import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BriefingDateNavigation,
  DailyBriefingView,
  WeeklyBriefingView,
} from "./briefing-view";
import type { ReplaySnapshot, WeeklySource } from "@/lib/briefing";

const snapshot: ReplaySnapshot = {
  trading_date: "2026-07-29",
  source_updated_at: "2026-07-29 23:34 UTC",
  market: {
    total_dollar_volume: 100_000_000_000,
    dollar_volume_change_1d: 6,
    advancing_stocks: 60,
    declining_stocks: 40,
  },
  groups: {
    sector: {
      Technology: {
        dollar_volume: 60_000_000_000,
        dollar_volume_change_1d: 20,
      },
      Energy: {
        dollar_volume: 40_000_000_000,
        dollar_volume_change_1d: -20,
      },
    },
  },
  tickers: {
    NVDA: {
      name_ko: "엔비디아",
      dollar_volume: 10_000_000_000,
      dollar_volume_ratio_20d: 2,
      daily_return: 1.2,
    },
  },
};

describe("briefing accessibility", () => {
  it("names date controls and exposes disabled boundaries", () => {
    const html = renderToStaticMarkup(
      <BriefingDateNavigation
        dates={["2026-07-28", "2026-07-29"]}
        current="2026-07-28"
      />,
    );
    expect(html).toContain('aria-label="브리핑 날짜 탐색"');
    expect(html).toContain('aria-label="이전 거래일"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain("거래일 선택");
    expect(html).toContain('href="/briefings/weeks/2026-07-27/"');
  });

  it("renders a dated evidence summary, private watchlist label and live share feedback", () => {
    const html = renderToStaticMarkup(
      <DailyBriefingView snapshot={snapshot} dates={[snapshot.trading_date]} />,
    );
    expect(html).toContain("데이터 기준일 2026-07-29");
    expect(html).toContain("전체 거래대금");
    expect(html).toContain("내 관심종목 요약");
    expect(html).toContain("이 브라우저에서만 표시");
    expect(html).toContain('role="status" aria-live="polite"');
    expect(html).toContain("실제 순매수나 자금 유입을 뜻하지 않습니다");
  });

  it("labels an in-progress weekly briefing without presenting it as final", () => {
    const week: WeeklySource = {
      weekId: "2026-07-27",
      label: "7월 27일 주간",
      startDate: "2026-07-27",
      endDate: "2026-07-29",
      status: "in_progress",
      tradingDays: 3,
      indices: [],
      market: { averageDollarVolume: 100_000_000_000, lastDayVolumeChange: null, advancingShare: 54.4 },
      sectorGainers: [],
      sectorLosers: [],
      activeStocks: [],
    };
    const html = renderToStaticMarkup(
      <WeeklyBriefingView week={week} weekIds={[week.weekId]} dates={["2026-07-29"]} />,
    );
    expect(html).toContain("진행 중");
    expect(html).not.toContain("주간 확정");
    expect(html).toContain("데이터 기준일 2026-07-29");
    expect(html).toContain("주간 선택");
    expect(html).toContain('href="/briefings/2026-07-29/"');
    expect(html).toContain('<h2 id="weekly-briefing-2026-07-27"');
    expect(html).not.toContain('<h1 id="weekly-briefing-2026-07-27"');
  });
});
