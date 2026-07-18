import {
  INSIDER_ROWS,
  LIVE_COMPANIES_BY_ID,
  LIVE_GROUP_COMPANIES,
  LIVE_GROUP_SERIES,
  LIVE_MARKET_DATA,
  LIVE_META,
  LIVE_SECTOR_SERIES,
  LIVE_STOCKS,
  LOCKUP_ROWS,
  SECTORS,
  SURGE_STOCKS,
  type InsiderRow,
  type LockupRow,
  type MarketCompany,
  type MarketCategory,
  type MarketPeriod,
  type Sector,
  type Signal,
  type StockRow,
} from "./mock-data";
import { INDUSTRY_KO } from "./industry-copy";

type MarketStock = {
  t: string;
  n: string;
  nko?: string;
  sec: string;
  c: number;
  pc: number;
  ind?: string;
  uni?: string[];
  grp?: string;
  cap?: string;
  dv: number;
  dvp: number;
  a5: number;
  a20: number;
  a60: number;
  mc: number;
};

const SECTOR_KO: Record<string, string> = {
  Technology: "테크놀로지",
  "Communication Services": "커뮤니케이션 서비스",
  "Financial Services": "금융",
  "Consumer Cyclical": "임의 소비재",
  Healthcare: "헬스케어",
  Industrials: "산업재",
  Energy: "에너지",
  "Consumer Defensive": "필수 소비재",
  Utilities: "유틸리티",
  "Real Estate": "부동산",
  "Basic Materials": "소재",
};

const SECTOR_ID: Record<string, string> = {
  Technology: "technology",
  "Communication Services": "communication",
  "Financial Services": "financial",
  "Consumer Cyclical": "consumer-discretionary",
  Healthcare: "healthcare",
  Industrials: "industrials",
  Energy: "energy",
  "Consumer Defensive": "consumer-staples",
  Utilities: "utilities",
  "Real Estate": "real-estate",
  "Basic Materials": "materials",
};

const LOCKUP_COMPANY_KO: Record<string, string> = {
  SPCX: "스페이스X",
  BGIN: "비긴 블록체인",
  NAVN: "나반",
  LIFE: "이토스 테크놀로지스",
  OTH: "오프 더 훅 YS",
  BIXI: "비트코인 인프라스트럭처 애퀴지션",
  BXDC: "블랙스톤 디지털 인프라스트럭처 트러스트",
  WLTH: "웰스프론트",
  LMRI: "루멕사 이미징",
  MAIR: "매디슨 에어 솔루션스",
  AVEX: "에이벡스",
  ALMR: "알라마 바이오사이언시스",
  BTGO: "비트고",
  EQPT: "이큅먼트셰어",
  GIX: "긱캐피털9",
  SPTX: "시포트 테라퓨틱스",
  COAG: "헤맙 테라퓨틱스",
  HAWK: "호크아이 360",
  OFRM: "원스 어폰 어 팜",
  SGP: "스파이글래스 파마",
  JAGU: "재규어 우라늄",
  VIDA: "비다 글로벌",
  AADX: "어플라이드 에어로스페이스 앤 디펜스",
  SSMR: "선샤인 실버 마이닝",
  SIND: "신다",
  LIME: "라임",
  ARXS: "아크시스",
  XE: "엑스에너지",
  ODTX: "오디세이 테라퓨틱스",
  MOBI: "모비아 메디컬",
  CBRS: "세레브라스 시스템스",
  LCLN: "링컨 인터내셔널",
  FRBT: "포브라이트",
  BSP: "벤딩 스푼스",
};

const PERIOD_REF: Record<MarketPeriod, keyof MarketStock> = {
  "1d": "dvp",
  "5d": "a5",
  "20d": "a20",
  "60d": "a60",
};

const CATEGORIES: MarketCategory[] = [
  "sector",
  "industry",
  "universe",
  "custom",
  "mcap",
];
const PERIODS: MarketPeriod[] = ["1d", "5d", "20d", "60d"];

const rawGroupName = (stock: MarketStock, category: MarketCategory) => {
  if (category === "sector") return stock.sec || "기타";
  if (category === "industry") return stock.ind || "기타";
  if (category === "universe")
    return stock.uni?.length ? stock.uni.join(" + ") : "기타";
  if (category === "mcap") return stock.cap || "기타";
  return stock.grp || stock.ind || "기타";
};

const groupId = (raw: string, category: MarketCategory) =>
  category === "sector" ? SECTOR_ID[raw] || raw : `${category}:${raw}`;

const groupLabel = (raw: string, category: MarketCategory) => {
  if (category === "sector") return SECTOR_KO[raw] || raw;
  if (category === "industry" || category === "custom")
    return INDUSTRY_KO[raw] || raw;
  if (category === "universe") {
    return raw
      .replaceAll("Russell 1000", "러셀 1000")
      .replaceAll("Russell 2000", "러셀 2000");
  }
  return raw;
};

const signalFor = (
  shareDelta: number,
  volumeChange: number,
  priceChange: number,
): Signal => {
  if (shareDelta > 10 && priceChange >= 0) return "inflow";
  if (shareDelta < -10 && priceChange < 0) return "outflow";
  if (volumeChange < -15) return "attention-loss";
  return "neutral";
};

const stockSignalFor = (volumeChange: number, priceChange: number): Signal => {
  if (volumeChange > 3 && priceChange > 0.15) return "inflow";
  if (volumeChange > 3 && priceChange < -0.15) return "outflow";
  if (volumeChange < -3) return "attention-loss";
  return "neutral";
};

function aggregateMarket(
  stocks: MarketStock[],
  category: MarketCategory,
  period: MarketPeriod,
): Sector[] {
  const refKey = PERIOD_REF[period];
  const groups = new Map<string, MarketStock[]>();
  for (const stock of stocks) {
    const key = rawGroupName(stock, category);
    groups.set(key, [...(groups.get(key) ?? []), stock]);
  }
  const totalNow = stocks.reduce(
    (sum, stock) => sum + (Number(stock.dv) || 0),
    0,
  );
  const totalRef = stocks.reduce(
    (sum, stock) => sum + (Number(stock[refKey]) || 0),
    0,
  );
  return [...groups]
    .map(([raw, rows]) => {
      const volumeRaw = rows.reduce(
        (sum, row) => sum + (Number(row.dv) || 0),
        0,
      );
      const reference = rows.reduce(
        (sum, row) => sum + (Number(row[refKey]) || 0),
        0,
      );
      const priceChange = volumeRaw
        ? rows.reduce(
            (sum, row) => sum + (Number(row.pc) || 0) * (Number(row.dv) || 0),
            0,
          ) / volumeRaw
        : 0;
      const share = totalNow ? (volumeRaw / totalNow) * 100 : 0;
      const priorShare = totalRef ? (reference / totalRef) * 100 : 0;
      const shareDelta = (share - priorShare) * 100;
      const volumeChange = reference ? (volumeRaw / reference - 1) * 100 : 0;
      return {
        id: groupId(raw, category),
        name: groupLabel(raw, category),
        group: category,
        volume: volumeRaw / 1e6,
        volumeChange,
        priceChange,
        shareDelta,
        share,
        signal: signalFor(shareDelta, volumeChange, priceChange),
        leaders: [...rows]
          .sort((a, b) => b.dv - a.dv)
          .slice(0, 3)
          .map((row) => row.t),
      };
    })
    .sort((a, b) => b.volume - a.volume);
}

const daysUntil = (date: string) =>
  Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86400000);

function observedHoliday(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function nthWeekday(year: number, month: number, weekday: number, nth: number) {
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCDate(1 + ((7 + weekday - date.getUTCDay()) % 7) + (nth - 1) * 7);
  return date.toISOString().slice(0, 10);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  date.setUTCDate(date.getUTCDate() - ((7 + date.getUTCDay() - weekday) % 7));
  return date.toISOString().slice(0, 10);
}

function easterSunday(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month, day));
}

function isUsMarketHoliday(date: Date) {
  const year = date.getUTCFullYear();
  const value = date.toISOString().slice(0, 10);
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  return new Set([
    observedHoliday(year, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday.toISOString().slice(0, 10),
    lastWeekday(year, 4, 1),
    observedHoliday(year, 5, 19),
    observedHoliday(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observedHoliday(year, 11, 25),
  ]).has(value);
}

function isUsTradingDay(date: Date) {
  const day = date.getUTCDay();
  return day !== 0 && day !== 6 && !isUsMarketHoliday(date);
}

function tradingDaysBehindLatestClose(marketDate: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(marketDate)) return Number.POSITIVE_INFINITY;
  const nyParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    nyParts.find((item) => item.type === type)?.value ?? "";
  const nyDate = `${part("year")}-${part("month")}-${part("day")}`;
  const nyHour = Number(part("hour"));

  // 장 마감 직후의 지연을 고려해 뉴욕 17시부터 당일을 완료 거래일로 봅니다.
  const latestClose = new Date(`${nyDate}T00:00:00Z`);
  const moveToPreviousTradingDay = () => {
    do latestClose.setUTCDate(latestClose.getUTCDate() - 1);
    while (!isUsTradingDay(latestClose));
  };
  if (!isUsTradingDay(latestClose)) moveToPreviousTradingDay();
  else if (nyHour < 17) moveToPreviousTradingDay();

  const start = new Date(`${marketDate}T00:00:00Z`);
  let count = 0;
  for (
    const cursor = new Date(start.getTime() + 86400000);
    cursor <= latestClose;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    if (isUsTradingDay(cursor)) count += 1;
  }
  return count;
}

function decodeHtml(value = "") {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function translateInsiderRole(rawRole = "") {
  const role = decodeHtml(rawRole).trim();
  const lower = role.toLowerCase();
  if (!role) return "임원";
  if (/10%/.test(lower)) return "10% 대주주";
  if (/director|이사/.test(lower)) return "이사";
  if (/chief executive|\bceo\b/.test(lower)) return "최고경영자";
  if (/chief financial|\bcfo\b/.test(lower)) return "최고재무책임자";
  if (/chief operating|\bcoo\b/.test(lower)) return "최고운영책임자";
  if (/chief technology|\bcto\b/.test(lower)) return "최고기술책임자";
  if (/chief legal|general counsel/.test(lower)) return "최고법무책임자";
  if (/chief accounting|controller|\bcao\b/.test(lower))
    return "최고회계책임자";
  if (/chief people|human resources|\bchro\b/.test(lower))
    return "최고인사책임자";
  if (/chief strategy/.test(lower)) return "최고전략책임자";
  if (/chief administrative/.test(lower)) return "최고행정책임자";
  if (/chief comm|corporate affairs/.test(lower))
    return "커뮤니케이션·대외협력 책임자";
  if (/chief marketing|\bcmo\b/.test(lower)) return "최고마케팅책임자";
  if (/vice chairman/.test(lower)) return "이사회 부의장";
  if (/executive chairman|chairman/.test(lower)) return "이사회 의장";
  if (/managing director|^md\b/.test(lower)) return "전무";
  if (/head technology/.test(lower)) return "기술·운영 총괄";
  if (/president/.test(lower)) return "사장";
  if (/executive vice president|exec vp|\bevp\b/.test(lower))
    return "수석부사장";
  if (/senior vice president|\bsvp\b/.test(lower)) return "수석부사장";
  if (/corporate vice president|\bcvp\b/.test(lower)) return "기업부사장";
  if (/vice president|\bvp\b/.test(lower)) return "부사장";
  if (/officer|임원/.test(lower)) return "임원";
  return role;
}

export async function hydrateLiveData() {
  LIVE_META.status = "loading";
  LIVE_META.delayTradingDays = 0;
  LIVE_META.error = undefined;
  try {
    const fetchJson = async (path: string) => {
      const response = await fetch(path);
      if (!response.ok)
        throw new Error(`${path} 응답 오류 (${response.status})`);
      return response.json();
    };
    const [marketResult, historyResult, insiderResult, lockupResult] =
      await Promise.allSettled([
        fetchJson("/data.json"),
        fetchJson("/history.json"),
        fetchJson("/insider/data/insider.json"),
        fetchJson("/ipo-lockup/data/lockup.json"),
      ]);
    if (
      marketResult.status === "rejected" ||
      historyResult.status === "rejected"
    ) {
      throw new Error("시장 흐름 필수 데이터 파일을 불러오지 못했습니다.");
    }
    const market = marketResult.value;
    const history = historyResult.value;
    const insider =
      insiderResult.status === "fulfilled"
        ? insiderResult.value
        : { trades: [] };
    const lockup =
      lockupResult.status === "fulfilled" ? lockupResult.value : { events: [] };
    const secondaryDataDelayed =
      insiderResult.status === "rejected" || lockupResult.status === "rejected";

    const stocks = market.stocks as MarketStock[];
    const totalMarketVolume = stocks.reduce(
      (sum, stock) => sum + (Number(stock.dv) || 0),
      0,
    );
    for (const stock of stocks) {
      const company: MarketCompany = {
        id: `stock:${stock.t}`,
        ticker: stock.t,
        name: stock.nko || stock.n,
        sector: SECTOR_KO[stock.sec] || stock.sec,
        industry: INDUSTRY_KO[stock.ind || ""] || stock.ind,
        price: stock.c,
        change: stock.pc,
        volume: stock.dv / 1e6,
        volumeRatio: stock.a20 ? stock.dv / stock.a20 : 0,
        volumeVs: {
          "1d": stock.dvp ? (stock.dv / stock.dvp - 1) * 100 : 0,
          "5d": stock.a5 ? (stock.dv / stock.a5 - 1) * 100 : 0,
          "20d": stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0,
          "60d": stock.a60 ? (stock.dv / stock.a60 - 1) * 100 : 0,
        },
        marketCap: stock.mc / 1e9,
        share: totalMarketVolume ? (stock.dv / totalMarketVolume) * 100 : 0,
        signal: stockSignalFor(
          stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0,
          stock.pc,
        ),
      };
      LIVE_COMPANIES_BY_ID[company.id] = company;
      for (const category of CATEGORIES) {
        const id = groupId(rawGroupName(stock, category), category);
        (LIVE_GROUP_COMPANIES[id] ??= []).push(company);
      }
    }
    for (const companies of Object.values(LIVE_GROUP_COMPANIES)) {
      companies.sort((a, b) => b.volume - a.volume);
    }
    for (const category of CATEGORIES) {
      for (const period of PERIODS) {
        LIVE_MARKET_DATA[category][period] = aggregateMarket(
          stocks,
          category,
          period,
        );
      }
    }
    const sectors = LIVE_MARKET_DATA.sector["1d"];
    SECTORS.splice(0, SECTORS.length, ...sectors);

    const stockRows: StockRow[] = stocks.map((stock) => ({
      ticker: stock.t,
      name: stock.nko || stock.n,
      sector: SECTOR_KO[stock.sec] || stock.sec,
      price: stock.c,
      change: stock.pc,
      volume: stock.dv / 1e6,
      volumeRatio: stock.dv / stock.a20,
      marketCap: stock.mc / 1e9,
      volumeVs: {
        "1d": stock.dvp ? (stock.dv / stock.dvp - 1) * 100 : 0,
        "5d": stock.a5 ? (stock.dv / stock.a5 - 1) * 100 : 0,
        "20d": stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0,
        "60d": stock.a60 ? (stock.dv / stock.a60 - 1) * 100 : 0,
      },
      industry: INDUSTRY_KO[stock.ind || ""] || stock.ind,
      signal: stockSignalFor(
        stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0,
        stock.pc,
      ),
    }));
    LIVE_STOCKS.splice(0, LIVE_STOCKS.length, ...stockRows);
    const surge = [...stockRows]
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, 100);
    SURGE_STOCKS.splice(0, SURGE_STOCKS.length, ...surge);

    const dates = history.dates as string[];
    for (const category of CATEGORIES) {
      const historyKey = category === "mcap" ? "cap" : category;
      for (const [name, values] of Object.entries(history[historyKey] ?? {})) {
        const id = groupId(name, category);
        if (!Array.isArray(values) || !values.length) continue;
        const first = Number(values[0]) || 1;
        const series = values.map((value, index) => ({
          date: `${Number(dates[index].slice(5, 7))}/${Number(dates[index].slice(8, 10))}`,
          value: Number(((Number(value) / first) * 100).toFixed(2)),
        }));
        LIVE_GROUP_SERIES[id] = series;
        if (category === "sector") LIVE_SECTOR_SERIES[id] = series;
      }
    }
    for (const [ticker, values] of Object.entries(history.stocks ?? {})) {
      if (!Array.isArray(values) || !values.length) continue;
      const first = Number(values[0]) || 1;
      LIVE_GROUP_SERIES[`stock:${ticker}`] = values.map((value, index) => ({
        date: `${Number(dates[index].slice(5, 7))}/${Number(dates[index].slice(8, 10))}`,
        value: Number(((Number(value) / first) * 100).toFixed(2)),
      }));
    }

    const stockByTicker = new Map(stocks.map((stock) => [stock.t, stock]));
    const insiderRows: InsiderRow[] = (insider.trades ?? [])
      .filter(
        (row: any) =>
          !row.txDate || !row.filedDate || row.filedDate >= row.txDate,
      )
      .map((row: any) => {
        const marketStock = stockByTicker.get(row.ticker);
        return {
          ticker: row.ticker,
          company: marketStock?.nko || decodeHtml(row.company),
          insider: decodeHtml(row.filer),
          role: translateInsiderRole(row.role),
          type: row.txType === "매수" ? "buy" : "sell",
          shares: Number(row.shares) || 0,
          amount: (Number(row.value) || 0) / 1e6,
          tradeDate: row.txDate,
          filedDate: row.filedDate,
          signal: row.txType === "매수" ? "inflow" : "outflow",
          cluster: Number(row.clusterCount) >= 2,
        };
      });
    INSIDER_ROWS.splice(0, INSIDER_ROWS.length, ...insiderRows);

    const lockupRows: LockupRow[] = (lockup.events ?? []).map((row: any) => {
      const daysLeft = daysUntil(row.lockupDate);
      const marketStock = stockByTicker.get(row.ticker);
      return {
        ticker: row.ticker,
        company:
          LOCKUP_COMPANY_KO[row.ticker] || marketStock?.nko || row.company,
        ipoDate: row.ipoDate,
        unlockDate: row.lockupDate,
        daysLeft,
        unlockShares: 0,
        estValue: 0,
        marketCap: marketStock?.mc ? marketStock.mc / 1e9 : 0,
        sector:
          row.ticker === "SPCX"
            ? "우주항공·방산"
            : marketStock
              ? SECTOR_KO[marketStock.sec] || marketStock.sec
              : undefined,
        industry:
          row.ticker === "SPCX"
            ? "우주 발사체·위성 통신"
            : marketStock
              ? INDUSTRY_KO[marketStock.ind || ""] || marketStock.ind
              : undefined,
        lockupDays: Number(row.lockupDays) || undefined,
        importance:
          row.ticker === "SPCX" || (daysLeft >= 0 && daysLeft <= 14)
            ? "high"
            : daysLeft >= 15 && daysLeft <= 30
              ? "medium"
              : "low",
      };
    });
    LOCKUP_ROWS.splice(0, LOCKUP_ROWS.length, ...lockupRows);

    const insiderTickers = new Set(insiderRows.map((row) => row.ticker));
    const lockupTickers = new Set(lockupRows.map((row) => row.ticker));
    for (const stock of SURGE_STOCKS) {
      stock.hasInsider = insiderTickers.has(stock.ticker);
      stock.isIpo = lockupTickers.has(stock.ticker);
      stock.hasNews = true;
    }

    LIVE_META.asOf = market.market_date || "-";
    LIVE_META.updatedAt = market.updated || "-";
    LIVE_META.universeCount = Number(market.count) || stocks.length;
    LIVE_META.delayTradingDays = tradingDaysBehindLatestClose(LIVE_META.asOf);
    LIVE_META.status =
      LIVE_META.delayTradingDays > 0
        ? "stale"
        : secondaryDataDelayed
          ? "partial"
          : "normal";
    if (LIVE_META.status === "stale") {
      LIVE_META.error = `최신 미국 거래일보다 ${LIVE_META.delayTradingDays}거래일 늦습니다.`;
    } else if (secondaryDataDelayed) {
      LIVE_META.error = "내부자 거래 또는 IPO 락업 데이터가 지연되고 있습니다.";
    }
  } catch (error) {
    console.error("Live data hydration failed", error);
    LIVE_META.status = "failed";
    LIVE_META.error =
      error instanceof Error ? error.message : "알 수 없는 데이터 오류";
  }
}
