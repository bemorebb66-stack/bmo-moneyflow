export type SnapshotTicker = {
  name?: string;
  name_ko?: string;
  close_price?: number | null;
  daily_return?: number | null;
  dollar_volume?: number | null;
  dollar_volume_change_1d?: number | null;
  dollar_volume_ratio_5d?: number | null;
  dollar_volume_ratio_20d?: number | null;
  sector?: string;
  asset_type?: string;
  leverage_multiple?: number;
};

export type SnapshotGroup = {
  dollar_volume?: number | null;
  dollar_volume_change_1d?: number | null;
  dollar_volume_ratio_5d?: number | null;
  members?: number;
};

export type ReplaySnapshot = {
  schema_version?: number;
  trading_date: string;
  generated_at?: string;
  source_updated_at?: string;
  market: {
    total_dollar_volume?: number | null;
    dollar_volume_change_1d?: number | null;
    advancing_stocks?: number | null;
    declining_stocks?: number | null;
    indices?: Array<{
      symbol: string;
      value?: number;
      close?: number;
      change?: number | null;
    }>;
  };
  groups?: { sector?: Record<string, SnapshotGroup> };
  tickers?: Record<string, SnapshotTicker>;
};

type MarketDataStock = {
  t?: string;
  n?: string;
  nko?: string;
  c?: number;
  pc?: number;
  dv?: number;
  dvp?: number;
  a5?: number;
  a20?: number;
  sec?: string;
  asset_type?: string;
  leverage_multiple?: number;
};

type MarketDataPayload = {
  market_date?: string;
  updated?: string;
  stocks?: MarketDataStock[];
  indices?: ReplaySnapshot["market"]["indices"];
};

export type DailyBriefing = {
  period: "daily";
  date: string;
  quality: "complete" | "partial";
  generatedAt?: string;
  sourceUpdatedAt?: string;
  market: {
    totalDollarVolume: number;
    changePercent: number | null;
    advancing: number;
    declining: number;
    advancingShare: number | null;
  };
  sectors: Array<{
    id: string;
    name: string;
    share: number;
    changeBp: number;
  }>;
  notableStocks: Array<{
    ticker: string;
    name: string;
    dailyReturn: number | null;
    dollarVolume: number;
    ratio20d: number;
  }>;
  sentences: Array<{ id: string; text: string }>;
  shareText: string;
  coverage: { tickers: number; comparableTickers: number };
};

export type WeeklySource = {
  weekId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "complete" | "in_progress";
  tradingDays: number;
  indices: Array<{
    symbol: string;
    name: string;
    close: number;
    change: number | null;
  }>;
  market: {
    averageDollarVolume: number;
    lastDayVolumeChange: number | null;
    advancingShare: number | null;
  };
  sectorGainers: Array<{
    id: string;
    name: string;
    changeBp: number;
    share: number;
  }>;
  sectorLosers: Array<{
    id: string;
    name: string;
    changeBp: number;
    share: number;
  }>;
  activeStocks: Array<{
    ticker: string;
    name: string;
    dollarVolume: number;
  }>;
};

const SECTOR_NAMES: Record<string, string> = {
  Technology: "테크놀로지",
  Industrials: "산업재",
  "Financial Services": "금융",
  "Consumer Cyclical": "임의 소비재",
  Healthcare: "헬스케어",
  "Communication Services": "커뮤니케이션 서비스",
  "Consumer Defensive": "필수 소비재",
  Energy: "에너지",
  "Basic Materials": "소재",
  "Real Estate": "부동산",
  Utilities: "유틸리티",
};

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const previousValue = (current: number, changePercent: number | null | undefined) =>
  finite(changePercent) && changePercent > -100
    ? current / (1 + changePercent / 100)
    : null;

const roundTo = (value: number, digits: number) => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const ratio = (value: number, baseline: number) =>
  baseline > 0 ? roundTo(value / baseline, 4) : null;

const percentChange = (value: number, baseline: number) => {
  const valueRatio = ratio(value, baseline);
  return valueRatio == null ? null : roundTo((valueRatio - 1) * 100, 2);
};

export function buildReplaySnapshotFromMarketData(
  value: unknown,
): ReplaySnapshot | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as MarketDataPayload;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.market_date ?? "")) return null;
  if (!Array.isArray(payload.stocks) || payload.stocks.length === 0) return null;

  const tickers: Record<string, SnapshotTicker> = {};
  const sectors = new Map<
    string,
    { current: number; previous: number; average5d: number; members: number }
  >();
  for (const stock of payload.stocks) {
    const ticker = String(stock.t ?? "").trim().toUpperCase();
    const current = finite(stock.dv) ? stock.dv : 0;
    const previous = finite(stock.dvp) ? stock.dvp : 0;
    const average5d = finite(stock.a5) ? stock.a5 : 0;
    const average20d = finite(stock.a20) ? stock.a20 : 0;
    const sector = stock.sec || "기타";
    const bucket = sectors.get(sector) ?? {
      current: 0,
      previous: 0,
      average5d: 0,
      members: 0,
    };
    bucket.current += current;
    bucket.previous += previous;
    bucket.average5d += average5d;
    bucket.members += 1;
    sectors.set(sector, bucket);
    if (!ticker) continue;
    tickers[ticker] = {
      name: stock.n || ticker,
      name_ko: stock.nko || "",
      close_price: finite(stock.c) ? stock.c : null,
      daily_return: finite(stock.pc) ? stock.pc : null,
      dollar_volume: current,
      dollar_volume_change_1d: percentChange(current, previous),
      dollar_volume_ratio_5d: ratio(current, average5d),
      dollar_volume_ratio_20d: ratio(current, average20d),
      sector,
      asset_type: stock.asset_type || "COMMON_STOCK",
      leverage_multiple: finite(stock.leverage_multiple)
        ? stock.leverage_multiple
        : 1,
    };
  }
  const total = Object.values(tickers).reduce(
    (sum, row) => sum + (row.dollar_volume ?? 0),
    0,
  );
  const previousTotal = payload.stocks.reduce(
    (sum, stock) => sum + (finite(stock.dvp) ? stock.dvp : 0),
    0,
  );
  const groups: Record<string, SnapshotGroup> = {};
  for (const [name, bucket] of [...sectors.entries()].sort((a, b) =>
    b[1].current - a[1].current || a[0].localeCompare(b[0]),
  )) {
    groups[name] = {
      dollar_volume: bucket.current,
      dollar_volume_change_1d: percentChange(
        bucket.current,
        bucket.previous,
      ),
      dollar_volume_ratio_5d: ratio(bucket.current, bucket.average5d),
      members: bucket.members,
    };
  }
  return {
    schema_version: 1,
    trading_date: payload.market_date!,
    source_updated_at: payload.updated,
    market: {
      total_dollar_volume: total,
      dollar_volume_change_1d: percentChange(total, previousTotal),
      advancing_stocks: payload.stocks.filter((stock) => (stock.pc ?? 0) > 0)
        .length,
      declining_stocks: payload.stocks.filter((stock) => (stock.pc ?? 0) < 0)
        .length,
      indices: payload.indices ?? [],
    },
    groups: { sector: groups },
    tickers,
  };
}

export function formatBriefingMoney(value: number) {
  if (Math.abs(value) >= 1_000_000_000_000)
    return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
  return `$${(value / 1_000_000_000).toFixed(1)}B`;
}

const signedPercent = (value: number) =>
  `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;

const marketActivityLabel = (change: number | null) => {
  if (change == null) return "전일 비교 자료가 부족했고";
  if (change >= 5) return `전일 대비 ${Math.abs(change).toFixed(1)}% 증가했고`;
  if (change <= -5) return `전일 대비 ${Math.abs(change).toFixed(1)}% 감소했고`;
  return `전일 대비 ${signedPercent(change)}로 비슷했고`;
};

const breadthLabel = (share: number | null) => {
  if (share == null) return "상승·하락 종목 비교 자료는 부족했습니다";
  if (share >= 55) return `상승 종목 비중은 ${share.toFixed(1)}%로 상승 종목이 우세했습니다`;
  if (share <= 45) return `상승 종목 비중은 ${share.toFixed(1)}%로 하락 종목이 우세했습니다`;
  return `상승 종목 비중은 ${share.toFixed(1)}%로 혼조였습니다`;
};

export function buildDailyBriefing(snapshot: ReplaySnapshot): DailyBriefing {
  const total = finite(snapshot.market.total_dollar_volume)
    ? snapshot.market.total_dollar_volume
    : 0;
  const change = finite(snapshot.market.dollar_volume_change_1d)
    ? snapshot.market.dollar_volume_change_1d
    : null;
  const advancing = finite(snapshot.market.advancing_stocks)
    ? snapshot.market.advancing_stocks
    : 0;
  const declining = finite(snapshot.market.declining_stocks)
    ? snapshot.market.declining_stocks
    : 0;
  const advancingShare = advancing + declining
    ? (advancing / (advancing + declining)) * 100
    : null;

  const rawSectors = Object.entries(snapshot.groups?.sector ?? {});
  const previousTotal = rawSectors.reduce((sum, [, row]) => {
    const current = finite(row.dollar_volume) ? row.dollar_volume : 0;
    const previous = previousValue(current, row.dollar_volume_change_1d);
    return sum + (previous ?? 0);
  }, 0);
  const sectors = rawSectors
    .flatMap(([id, row]) => {
      const current = finite(row.dollar_volume) ? row.dollar_volume : 0;
      const previous = previousValue(current, row.dollar_volume_change_1d);
      if (!total || !previousTotal || previous == null) return [];
      return [{
        id,
        name: SECTOR_NAMES[id] ?? id,
        share: (current / total) * 100,
        changeBp: ((current / total) - (previous / previousTotal)) * 10_000,
      }];
    })
    .sort((a, b) => b.changeBp - a.changeBp || a.id.localeCompare(b.id));
  const expanded = sectors.find((row) => row.changeBp >= 10);
  const contracted = [...sectors]
    .reverse()
    .find((row) => row.changeBp <= -10);

  const tickerEntries = Object.entries(snapshot.tickers ?? {});
  const comparableTickers = tickerEntries.filter(([, row]) =>
    finite(row.dollar_volume_ratio_20d),
  );
  const notableStocks = comparableTickers
    .filter(([, row]) =>
      (row.asset_type ?? "COMMON_STOCK") === "COMMON_STOCK" &&
      (row.leverage_multiple ?? 1) === 1 &&
      (row.dollar_volume ?? 0) >= 50_000_000 &&
      (row.dollar_volume_ratio_20d ?? 0) >= 1,
    )
    .sort(([tickerA, a], [tickerB, b]) =>
      (b.dollar_volume_ratio_20d ?? 0) - (a.dollar_volume_ratio_20d ?? 0) ||
      (b.dollar_volume ?? 0) - (a.dollar_volume ?? 0) ||
      tickerA.localeCompare(tickerB),
    )
    .slice(0, 3)
    .map(([ticker, row]) => ({
      ticker,
      name: row.name_ko || row.name || ticker,
      dailyReturn: finite(row.daily_return) ? row.daily_return : null,
      dollarVolume: row.dollar_volume ?? 0,
      ratio20d: row.dollar_volume_ratio_20d ?? 0,
    }));

  const marketSentence = `전체 거래대금은 ${formatBriefingMoney(total)}로 ${marketActivityLabel(change)} ${breadthLabel(advancingShare)}.`;
  const sectorSentence = expanded || contracted
    ? `섹터 거래대금 점유율은 ${[
        expanded ? `${expanded.name}가 ${Math.round(expanded.changeBp)}bp 확대` : "",
        contracted ? `${contracted.name}가 ${Math.abs(Math.round(contracted.changeBp))}bp 축소` : "",
      ].filter(Boolean).join("되고 ")}됐습니다.`
    : "전일 대비 10bp 이상 변한 섹터 거래대금 점유율은 없었습니다.";
  const stockSentence = notableStocks.length
    ? `20일 평균 대비 거래대금이 높은 종목은 ${notableStocks.map((row) => `${row.ticker} ${row.ratio20d.toFixed(2)}배`).join(" · ")} 순이었습니다.`
    : "조건을 충족한 거래대금 주목 종목은 없었습니다.";
  const sentences = [
    { id: "market_activity_and_breadth", text: marketSentence },
    { id: "sector_share_change", text: sectorSentence },
    { id: "notable_stocks", text: stockSentence },
  ];
  return {
    period: "daily",
    date: snapshot.trading_date,
    quality:
      total > 0 && advancing + declining > 0 && comparableTickers.length >= 50
        ? "complete"
        : "partial",
    generatedAt: snapshot.generated_at,
    sourceUpdatedAt: snapshot.source_updated_at,
    market: {
      totalDollarVolume: total,
      changePercent: change,
      advancing,
      declining,
      advancingShare,
    },
    sectors,
    notableStocks,
    sentences,
    shareText: `${snapshot.trading_date} 미국 장 마감 브리핑\n${marketSentence}\n${sectorSentence}`,
    coverage: {
      tickers: tickerEntries.length,
      comparableTickers: comparableTickers.length,
    },
  };
}

export type WatchlistBriefing = {
  savedCount: number;
  availableCount: number;
  aboveAverageCount: number;
  missingTickers: string[];
  rows: Array<{
    ticker: string;
    name: string;
    ratio20d: number;
    dailyReturn: number | null;
    dollarVolume: number;
  }>;
  sentence: string;
};

export function buildWatchlistBriefing(
  snapshot: ReplaySnapshot,
  tickers: string[],
): WatchlistBriefing {
  const unique = [...new Set(tickers.map((ticker) => ticker.trim().toUpperCase()).filter(Boolean))];
  const available = unique.flatMap((ticker) => {
    const row = snapshot.tickers?.[ticker];
    if (!row || !finite(row.dollar_volume_ratio_20d)) return [];
    return [{
      ticker,
      name: row.name_ko || row.name || ticker,
      ratio20d: row.dollar_volume_ratio_20d,
      dailyReturn: finite(row.daily_return) ? row.daily_return : null,
      dollarVolume: row.dollar_volume ?? 0,
    }];
  }).sort((a, b) =>
    b.ratio20d - a.ratio20d ||
    b.dollarVolume - a.dollarVolume ||
    a.ticker.localeCompare(b.ticker),
  );
  const missingTickers = unique.filter((ticker) =>
    !snapshot.tickers?.[ticker] ||
    !finite(snapshot.tickers[ticker].dollar_volume_ratio_20d),
  );
  const aboveAverageCount = available.filter((row) => row.ratio20d >= 1).length;
  const top = available[0];
  const sentence = unique.length === 0
    ? "저장한 관심종목이 없습니다."
    : available.length === 0
      ? `저장한 관심종목 ${unique.length}개의 비교 데이터를 확인할 수 없습니다.`
      : `관심종목 ${available.length}개 중 ${aboveAverageCount}개의 거래대금이 20일 평균 이상이었${aboveAverageCount === 1 ? "고" : "으며"}, ${top.ticker}가 ${top.ratio20d.toFixed(2)}배로 가장 높았습니다.`;
  return {
    savedCount: unique.length,
    availableCount: available.length,
    aboveAverageCount,
    missingTickers,
    rows: available.slice(0, 5),
    sentence,
  };
}

export function buildWeeklySentences(week: WeeklySource) {
  const advancing = week.market.advancingShare;
  const marketSentence = `주간 일평균 거래대금은 ${formatBriefingMoney(week.market.averageDollarVolume)}였고, ${breadthLabel(advancing)}.`;
  const gainers = week.sectorGainers
    .filter((row) => row.changeBp >= 10)
    .sort((a, b) => b.changeBp - a.changeBp || a.id.localeCompare(b.id))
    .slice(0, 2);
  const losers = week.sectorLosers
    .filter((row) => row.changeBp <= -10)
    .sort((a, b) => a.changeBp - b.changeBp || a.id.localeCompare(b.id))
    .slice(0, 2);
  const gainText = gainers.map((row) => `${row.name} ${Math.round(row.changeBp)}bp`).join(" · ");
  const lossText = losers.map((row) => `${row.name} ${Math.abs(Math.round(row.changeBp))}bp`).join(" · ");
  const sectorSentence = gainers.length && losers.length
    ? `직전 주 마지막 거래일 대비 섹터 점유율은 ${gainText} 확대됐고, ${lossText} 축소됐습니다.`
    : gainers.length
      ? `직전 주 마지막 거래일 대비 섹터 점유율은 ${gainText} 확대됐으며, 10bp 이상 축소된 섹터는 없었습니다.`
      : losers.length
        ? `직전 주 마지막 거래일 대비 10bp 이상 확대된 섹터는 없었고, ${lossText} 축소됐습니다.`
        : "직전 주 마지막 거래일 대비 10bp 이상 확대되거나 축소된 섹터는 없었습니다.";
  return {
    marketSentence,
    sectorSentence,
    shareText: `${week.startDate}~${week.endDate} 미국 시장 주간 브리핑\n${marketSentence}\n${sectorSentence}`,
  };
}

export const BRIEFING_DISCLAIMER =
  "거래대금은 매수와 매도를 함께 포함하며 실제 순매수나 자금 유입을 뜻하지 않습니다. 공개 시장 데이터 요약이며 투자 권유가 아닙니다.";
