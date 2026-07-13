import {
  INSIDER_ROWS,
  LIVE_COMPANIES_BY_ID,
  LIVE_GROUP_COMPANIES,
  LIVE_GROUP_SERIES,
  LIVE_MARKET_DATA,
  LIVE_META,
  LIVE_SECTOR_SERIES,
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

type MarketStock = {
  t: string; n: string; nko?: string; sec: string; c: number; pc: number;
  ind?: string; uni?: string[]; grp?: string; cap?: string;
  dv: number; dvp: number; a5: number; a20: number; a60: number; mc: number;
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

const INDUSTRY_KO: Record<string, string> = {
  Semiconductors: "반도체",
  "Semiconductor Equipment & Materials": "반도체 장비·소재",
  "Software - Infrastructure": "소프트웨어(인프라)",
  "Software - Application": "소프트웨어(응용)",
  "Internet Content & Information": "인터넷 콘텐츠·정보",
  "Consumer Electronics": "가전·전자기기",
  "Communication Equipment": "통신장비",
  "Computer Hardware": "컴퓨터 하드웨어",
  "Industrial Distribution": "산업재 유통",
  "Utilities - Regulated Gas": "가스(규제)",
  "Medical Care Facilities": "의료시설",
  "Furnishings, Fixtures & Appliances": "가구·가전",
  "Building Products & Equipment": "건축자재·설비",
  "Specialty Business Services": "기업 서비스",
  "Travel Services": "여행",
  "Insurance - Diversified": "보험(종합)",
  "Grocery Stores": "식료품점",
  "Integrated Freight & Logistics": "물류",
  "Auto Manufacturers": "자동차",
  "Auto Parts": "자동차 부품",
  "Internet Retail": "인터넷 소매",
  Restaurants: "외식",
  "Banks - Diversified": "은행(대형)",
  "Banks - Regional": "은행(지역)",
  "Credit Services": "신용·결제",
  "Asset Management": "자산운용",
  "Capital Markets": "증권·IB",
  Biotechnology: "바이오",
  "Drug Manufacturers - General": "제약(대형)",
  "Medical Devices": "의료기기",
  "Diagnostics & Research": "진단·리서치",
  "Healthcare Plans": "건강보험",
  "Oil & Gas Integrated": "석유(통합)",
  "Oil & Gas E&P": "석유 탐사·생산",
  "Oil & Gas Midstream": "석유 미드스트림",
  "Aerospace & Defense": "항공우주·방산",
  Airlines: "항공사",
  Railroads: "철도",
  "Electrical Equipment & Parts": "전기장비",
  "Engineering & Construction": "건설·엔지니어링",
  "Specialty Industrial Machinery": "산업기계",
  "Utilities - Regulated Electric": "전력(규제)",
  "Utilities - Renewable": "신재생에너지",
  "Specialty Chemicals": "특수화학",
  Copper: "구리",
  Gold: "금",
  Steel: "철강",
  Aluminum: "알루미늄",
  "REIT - Industrial": "리츠(물류·산업)",
  "REIT - Residential": "리츠(주거)",
  "REIT - Retail": "리츠(리테일)",
  "REIT - Office": "리츠(오피스)",
};

const LOCKUP_COMPANY_KO: Record<string, string> = {
  SPCX: "스페이스X", BGIN: "비긴 블록체인", NAVN: "나반", LIFE: "이토스 테크놀로지스",
  OTH: "오프 더 훅 YS", BIXI: "비트코인 인프라스트럭처 애퀴지션",
  BXDC: "블랙스톤 디지털 인프라스트럭처 트러스트", WLTH: "웰스프론트",
  LMRI: "루멕사 이미징", MAIR: "매디슨 에어 솔루션스", AVEX: "에이벡스",
  ALMR: "알라마 바이오사이언시스", BTGO: "비트고", EQPT: "이큅먼트셰어",
  GIX: "긱캐피털9", SPTX: "시포트 테라퓨틱스", COAG: "헤맙 테라퓨틱스",
  HAWK: "호크아이 360", OFRM: "원스 어폰 어 팜", SGP: "스파이글래스 파마",
  JAGU: "재규어 우라늄", VIDA: "비다 글로벌", AADX: "어플라이드 에어로스페이스 앤 디펜스",
  SSMR: "선샤인 실버 마이닝", SIND: "신다", LIME: "라임",
  ARXS: "아크시스", XE: "엑스에너지", ODTX: "오디세이 테라퓨틱스",
  MOBI: "모비아 메디컬", CBRS: "세레브라스 시스템스", LCLN: "링컨 인터내셔널",
  FRBT: "포브라이트", BSP: "벤딩 스푼스",
};

const PERIOD_REF: Record<MarketPeriod, keyof MarketStock> = {
  "1d": "dvp", "5d": "a5", "20d": "a20", "60d": "a60",
};

const CATEGORIES: MarketCategory[] = ["sector", "industry", "universe", "custom", "mcap"];
const PERIODS: MarketPeriod[] = ["1d", "5d", "20d", "60d"];

const rawGroupName = (stock: MarketStock, category: MarketCategory) => {
  if (category === "sector") return stock.sec || "기타";
  if (category === "industry") return stock.ind || "기타";
  if (category === "universe") return stock.uni?.length ? stock.uni.join(" + ") : "기타";
  if (category === "mcap") return stock.cap || "기타";
  return stock.grp || stock.ind || "기타";
};

const groupId = (raw: string, category: MarketCategory) =>
  category === "sector" ? (SECTOR_ID[raw] || raw) : `${category}:${raw}`;

const groupLabel = (raw: string, category: MarketCategory) => {
  if (category === "sector") return SECTOR_KO[raw] || raw;
  if (category === "industry" || category === "custom") return INDUSTRY_KO[raw] || raw;
  if (category === "universe") {
    return raw.replaceAll("Russell 1000", "러셀 1000").replaceAll("Russell 2000", "러셀 2000");
  }
  return raw;
};

const signalFor = (shareDelta: number, volumeChange: number, priceChange: number): Signal => {
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

function aggregateMarket(stocks: MarketStock[], category: MarketCategory, period: MarketPeriod): Sector[] {
  const refKey = PERIOD_REF[period];
  const groups = new Map<string, MarketStock[]>();
  for (const stock of stocks) {
    const key = rawGroupName(stock, category);
    groups.set(key, [...(groups.get(key) ?? []), stock]);
  }
  const totalNow = stocks.reduce((sum, stock) => sum + (Number(stock.dv) || 0), 0);
  const totalRef = stocks.reduce((sum, stock) => sum + (Number(stock[refKey]) || 0), 0);
  return [...groups].map(([raw, rows]) => {
    const volumeRaw = rows.reduce((sum, row) => sum + (Number(row.dv) || 0), 0);
    const reference = rows.reduce((sum, row) => sum + (Number(row[refKey]) || 0), 0);
    const priceChange = volumeRaw
      ? rows.reduce((sum, row) => sum + (Number(row.pc) || 0) * (Number(row.dv) || 0), 0) / volumeRaw
      : 0;
    const share = totalNow ? volumeRaw / totalNow * 100 : 0;
    const priorShare = totalRef ? reference / totalRef * 100 : 0;
    const shareDelta = (share - priorShare) * 100;
    const volumeChange = reference ? (volumeRaw / reference - 1) * 100 : 0;
    return {
      id: groupId(raw, category), name: groupLabel(raw, category), group: category,
      volume: volumeRaw / 1e6, volumeChange, priceChange, shareDelta, share,
      signal: signalFor(shareDelta, volumeChange, priceChange),
      leaders: [...rows].sort((a, b) => b.dv - a.dv).slice(0, 3).map((row) => row.t),
    };
  }).sort((a, b) => b.volume - a.volume);
}

const daysUntil = (date: string) => Math.ceil((new Date(`${date}T00:00:00Z`).getTime() - Date.now()) / 86400000);

export async function hydrateLiveData() {
  try {
    const [marketRes, historyRes, insiderRes, lockupRes] = await Promise.all([
      fetch("/data.json"),
      fetch("/history.json"),
      fetch("/insider/data/insider.json"),
      fetch("/ipo-lockup/data/lockup.json"),
    ]);
    const [market, history, insider, lockup] = await Promise.all([
      marketRes.json(), historyRes.json(), insiderRes.json(), lockupRes.json(),
    ]);

    const stocks = market.stocks as MarketStock[];
    const totalMarketVolume = stocks.reduce((sum, stock) => sum + (Number(stock.dv) || 0), 0);
    for (const stock of stocks) {
      const company: MarketCompany = {
        id: `stock:${stock.t}`, ticker: stock.t, name: stock.nko || stock.n,
        sector: SECTOR_KO[stock.sec] || stock.sec,
        industry: INDUSTRY_KO[stock.ind || ""] || stock.ind,
        price: stock.c, change: stock.pc, volume: stock.dv / 1e6,
        volumeRatio: stock.a20 ? stock.dv / stock.a20 : 0,
        volumeVs: {
          "1d": stock.dvp ? (stock.dv / stock.dvp - 1) * 100 : 0,
          "5d": stock.a5 ? (stock.dv / stock.a5 - 1) * 100 : 0,
          "20d": stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0,
          "60d": stock.a60 ? (stock.dv / stock.a60 - 1) * 100 : 0,
        },
        marketCap: stock.mc / 1e9,
        share: totalMarketVolume ? stock.dv / totalMarketVolume * 100 : 0,
        signal: stockSignalFor(stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0, stock.pc),
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
        LIVE_MARKET_DATA[category][period] = aggregateMarket(stocks, category, period);
      }
    }
    const sectors = LIVE_MARKET_DATA.sector["1d"];
    SECTORS.splice(0, SECTORS.length, ...sectors);

    const surge: StockRow[] = stocks
      .filter((stock) => stock.a20 > 0)
      .map((stock) => ({
        ticker: stock.t, name: stock.nko || stock.n, sector: SECTOR_KO[stock.sec] || stock.sec,
        price: stock.c, change: stock.pc, volume: stock.dv / 1e6,
        volumeRatio: stock.dv / stock.a20, marketCap: stock.mc / 1e9,
        volumeVs: {
          "1d": stock.dvp ? (stock.dv / stock.dvp - 1) * 100 : 0,
          "5d": stock.a5 ? (stock.dv / stock.a5 - 1) * 100 : 0,
          "20d": stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0,
          "60d": stock.a60 ? (stock.dv / stock.a60 - 1) * 100 : 0,
        },
        industry: INDUSTRY_KO[stock.ind || ""] || stock.ind,
        signal: stockSignalFor((stock.dv / stock.a20 - 1) * 100, stock.pc),
      }))
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
          value: Number((Number(value) / first * 100).toFixed(2)),
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
        value: Number((Number(value) / first * 100).toFixed(2)),
      }));
    }

    const insiderRows: InsiderRow[] = (insider.trades ?? [])
      .filter((row: any) => !row.txDate || !row.filedDate || row.filedDate >= row.txDate)
      .map((row: any) => ({
      ticker: row.ticker, company: row.company, insider: row.filer, role: row.role,
      type: row.txType === "매수" ? "buy" : "sell", shares: Number(row.shares) || 0,
      amount: (Number(row.value) || 0) / 1e6, tradeDate: row.txDate, filedDate: row.filedDate,
      signal: row.txType === "매수" ? "inflow" : "outflow", cluster: Number(row.clusterCount) >= 2,
      }));
    INSIDER_ROWS.splice(0, INSIDER_ROWS.length, ...insiderRows);

    const stockByTicker = new Map(stocks.map((stock) => [stock.t, stock]));
    const lockupRows: LockupRow[] = (lockup.events ?? []).map((row: any) => {
      const daysLeft = daysUntil(row.lockupDate);
      const marketStock = stockByTicker.get(row.ticker);
      return {
        ticker: row.ticker,
        company: LOCKUP_COMPANY_KO[row.ticker] || marketStock?.nko || row.company,
        ipoDate: row.ipoDate, unlockDate: row.lockupDate, daysLeft, unlockShares: 0,
        estValue: 0, marketCap: marketStock?.mc ? marketStock.mc / 1e9 : 0,
        sector: row.ticker === "SPCX" ? "우주항공·방산" : marketStock ? (SECTOR_KO[marketStock.sec] || marketStock.sec) : undefined,
        industry: row.ticker === "SPCX" ? "우주 발사체·위성 통신" : marketStock ? (INDUSTRY_KO[marketStock.ind || ""] || marketStock.ind) : undefined,
        lockupDays: Number(row.lockupDays) || undefined,
        importance: row.ticker === "SPCX" || (daysLeft >= 0 && daysLeft <= 14)
          ? "high"
          : daysLeft >= 15 && daysLeft <= 30 ? "medium" : "low",
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
  } catch (error) {
    console.error("Live data hydration failed", error);
  }
}
