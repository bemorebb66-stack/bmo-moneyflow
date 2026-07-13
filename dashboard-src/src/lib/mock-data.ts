// 미국 주식 섹터 자금 흐름 데모용 샘플 데이터 (한국어)

export type Signal = "inflow" | "outflow" | "attention-loss" | "neutral";
export type MarketCategory = "sector" | "industry" | "universe" | "custom" | "mcap";
export type MarketPeriod = "1d" | "5d" | "20d" | "60d";

export interface Sector {
  id: string;
  name: string;
  group: MarketCategory;
  parent?: string;
  volume: number; // 거래대금 (백만 달러)
  volumeChange: number; // % vs 20D 평균
  priceChange: number; // % 1D
  shareDelta: number; // 시장 점유율 Δ (bp)
  share: number; // 시장 점유율 %
  signal: Signal;
  leaders: string[];
}

export interface StockRow {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  change: number; // %
  volume: number; // 백만 달러
  volumeRatio: number; // vs 20D avg
  marketCap: number; // 십억 달러
  signal: Signal;
  hasInsider?: boolean;
  isIpo?: boolean;
  hasNews?: boolean;
}

export const SECTORS: Sector[] = [
  {
    id: "technology",
    name: "테크놀로지",
    group: "sector",
    volume: 148230,
    volumeChange: 32.4,
    priceChange: 1.42,
    shareDelta: 148,
    share: 28.6,
    signal: "inflow",
    leaders: ["NVDA", "MSFT", "AAPL"],
  },
  {
    id: "communication",
    name: "커뮤니케이션 서비스",
    group: "sector",
    volume: 62140,
    volumeChange: 18.2,
    priceChange: 0.87,
    shareDelta: 62,
    share: 12.0,
    signal: "inflow",
    leaders: ["META", "GOOGL", "NFLX"],
  },
  {
    id: "financial",
    name: "금융",
    group: "sector",
    volume: 54320,
    volumeChange: 11.6,
    priceChange: 0.34,
    shareDelta: 21,
    share: 10.5,
    signal: "neutral",
    leaders: ["JPM", "BAC", "V"],
  },
  {
    id: "consumer-discretionary",
    name: "임의 소비재",
    group: "sector",
    volume: 48210,
    volumeChange: 6.1,
    priceChange: 0.52,
    shareDelta: -12,
    share: 9.3,
    signal: "neutral",
    leaders: ["AMZN", "TSLA", "HD"],
  },
  {
    id: "healthcare",
    name: "헬스케어",
    group: "sector",
    volume: 41890,
    volumeChange: -8.4,
    priceChange: -0.62,
    shareDelta: -78,
    share: 8.1,
    signal: "outflow",
    leaders: ["LLY", "UNH", "JNJ"],
  },
  {
    id: "industrials",
    name: "산업재",
    group: "sector",
    volume: 32140,
    volumeChange: -3.2,
    priceChange: 0.18,
    shareDelta: -14,
    share: 6.2,
    signal: "neutral",
    leaders: ["CAT", "GE", "UBER"],
  },
  {
    id: "energy",
    name: "에너지",
    group: "sector",
    volume: 27860,
    volumeChange: -14.7,
    priceChange: -1.28,
    shareDelta: -96,
    share: 5.4,
    signal: "outflow",
    leaders: ["XOM", "CVX", "COP"],
  },
  {
    id: "consumer-staples",
    name: "필수 소비재",
    group: "sector",
    volume: 19420,
    volumeChange: -18.2,
    priceChange: -0.14,
    shareDelta: -42,
    share: 3.8,
    signal: "attention-loss",
    leaders: ["PG", "COST", "WMT"],
  },
  {
    id: "utilities",
    name: "유틸리티",
    group: "sector",
    volume: 12310,
    volumeChange: -22.5,
    priceChange: -0.32,
    shareDelta: -38,
    share: 2.4,
    signal: "attention-loss",
    leaders: ["NEE", "SO", "DUK"],
  },
  {
    id: "real-estate",
    name: "부동산",
    group: "sector",
    volume: 10240,
    volumeChange: -9.8,
    priceChange: -0.48,
    shareDelta: -21,
    share: 2.0,
    signal: "neutral",
    leaders: ["PLD", "AMT", "EQIX"],
  },
  {
    id: "materials",
    name: "소재",
    group: "sector",
    volume: 14520,
    volumeChange: 2.1,
    priceChange: 0.24,
    shareDelta: 8,
    share: 2.8,
    signal: "neutral",
    leaders: ["LIN", "SHW", "FCX"],
  },
];

export const LIVE_META = {
  asOf: "-",
  updatedAt: "-",
  universeCount: 0,
};

export const LIVE_SECTOR_SERIES: Record<string, { date: string; value: number }[]> = {};
export const LIVE_GROUP_SERIES: Record<string, { date: string; value: number }[]> = {};
export const LIVE_MARKET_DATA: Record<MarketCategory, Record<MarketPeriod, Sector[]>> = {
  sector: { "1d": [], "5d": [], "20d": [], "60d": [] },
  industry: { "1d": [], "5d": [], "20d": [], "60d": [] },
  universe: { "1d": [], "5d": [], "20d": [], "60d": [] },
  custom: { "1d": [], "5d": [], "20d": [], "60d": [] },
  mcap: { "1d": [], "5d": [], "20d": [], "60d": [] },
};

export const SURGE_STOCKS: StockRow[] = [
  {
    ticker: "NVDA",
    name: "엔비디아",
    sector: "테크놀로지",
    price: 921.34,
    change: 4.28,
    volume: 42180,
    volumeRatio: 2.4,
    marketCap: 2280,
    signal: "inflow",
    hasInsider: true,
    hasNews: true,
  },
  {
    ticker: "META",
    name: "메타 플랫폼스",
    sector: "커뮤니케이션 서비스",
    price: 512.18,
    change: 2.94,
    volume: 18240,
    volumeRatio: 1.9,
    marketCap: 1290,
    signal: "inflow",
    hasNews: true,
  },
  {
    ticker: "MSFT",
    name: "마이크로소프트",
    sector: "테크놀로지",
    price: 428.62,
    change: 1.42,
    volume: 21430,
    volumeRatio: 1.6,
    marketCap: 3180,
    signal: "inflow",
  },
  {
    ticker: "TSLA",
    name: "테슬라",
    sector: "임의 소비재",
    price: 248.91,
    change: -3.12,
    volume: 24120,
    volumeRatio: 2.1,
    marketCap: 792,
    signal: "outflow",
    hasNews: true,
  },
  {
    ticker: "AAPL",
    name: "애플",
    sector: "테크놀로지",
    price: 218.44,
    change: 0.62,
    volume: 15840,
    volumeRatio: 1.2,
    marketCap: 3320,
    signal: "neutral",
  },
  {
    ticker: "AMD",
    name: "AMD",
    sector: "테크놀로지",
    price: 158.24,
    change: 5.84,
    volume: 12240,
    volumeRatio: 2.8,
    marketCap: 256,
    signal: "inflow",
    hasInsider: true,
  },
  {
    ticker: "GOOGL",
    name: "알파벳 A",
    sector: "커뮤니케이션 서비스",
    price: 182.12,
    change: 1.08,
    volume: 11240,
    volumeRatio: 1.3,
    marketCap: 2260,
    signal: "inflow",
  },
  {
    ticker: "AVGO",
    name: "브로드컴",
    sector: "테크놀로지",
    price: 1642.5,
    change: 2.34,
    volume: 9820,
    volumeRatio: 1.7,
    marketCap: 762,
    signal: "inflow",
  },
  {
    ticker: "XOM",
    name: "엑슨모빌",
    sector: "에너지",
    price: 108.42,
    change: -2.18,
    volume: 8420,
    volumeRatio: 1.9,
    marketCap: 428,
    signal: "outflow",
  },
  {
    ticker: "LLY",
    name: "일라이 릴리",
    sector: "헬스케어",
    price: 812.4,
    change: -1.42,
    volume: 7820,
    volumeRatio: 1.4,
    marketCap: 771,
    signal: "outflow",
  },
  {
    ticker: "ARM",
    name: "ARM 홀딩스",
    sector: "테크놀로지",
    price: 128.6,
    change: 6.42,
    volume: 6420,
    volumeRatio: 3.2,
    marketCap: 132,
    signal: "inflow",
    isIpo: true,
    hasNews: true,
  },
  {
    ticker: "JPM",
    name: "JP모건 체이스",
    sector: "금융",
    price: 214.32,
    change: 0.42,
    volume: 5820,
    volumeRatio: 1.1,
    marketCap: 612,
    signal: "neutral",
  },
];

// 60일 지수화 시계열 생성
export function generateSeries(sectorId: string, days = 60): { date: string; value: number }[] {
  const live = LIVE_GROUP_SERIES[sectorId] ?? LIVE_SECTOR_SERIES[sectorId];
  if (live?.length) return live.slice(-days);
  const seed = sectorId
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  let x = seed;
  const rand = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  const drift =
    SECTORS.find((s) => s.id === sectorId)?.priceChange ?? 0;
  const trend = drift * 0.6;
  const data: { date: string; value: number }[] = [];
  let value = 100;
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const shock = (rand() - 0.5) * 1.8;
    value += shock + trend / days;
    data.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      value: Number(value.toFixed(2)),
    });
  }
  return data;
}

export const SIGNAL_META: Record<
  Signal,
  { label: string; tone: "success" | "danger" | "info" | "muted" }
> = {
  inflow: { label: "매수 유입", tone: "success" },
  outflow: { label: "매도 출회", tone: "danger" },
  "attention-loss": { label: "관심 이탈", tone: "info" },
  neutral: { label: "중립", tone: "muted" },
};

// ---------- Insider trading mock ----------
export type InsiderType = "buy" | "sell";

export interface InsiderRow {
  ticker: string;
  company: string;
  insider: string;
  role: string;
  type: InsiderType;
  shares: number;
  amount: number; // USD millions
  tradeDate: string; // YYYY-MM-DD
  filedDate: string;
  signal: Signal;
  cluster?: boolean;
}

export const INSIDER_ROWS: InsiderRow[] = [
  { ticker: "NVDA", company: "엔비디아", insider: "젠슨 황", role: "CEO", type: "sell", shares: 120000, amount: 110.6, tradeDate: "2026-07-10", filedDate: "2026-07-11", signal: "outflow" },
  { ticker: "META", company: "메타 플랫폼스", insider: "마크 저커버그", role: "CEO", type: "sell", shares: 45000, amount: 23.1, tradeDate: "2026-07-09", filedDate: "2026-07-10", signal: "neutral" },
  { ticker: "AMD", company: "AMD", insider: "리사 수", role: "CEO", type: "buy", shares: 25000, amount: 3.96, tradeDate: "2026-07-11", filedDate: "2026-07-12", signal: "inflow", cluster: true },
  { ticker: "AMD", company: "AMD", insider: "마크 페이퍼마스터", role: "CTO", type: "buy", shares: 8000, amount: 1.27, tradeDate: "2026-07-11", filedDate: "2026-07-12", signal: "inflow", cluster: true },
  { ticker: "TSLA", company: "테슬라", insider: "로빈 덴홀름", role: "이사회 의장", type: "sell", shares: 20000, amount: 4.98, tradeDate: "2026-07-08", filedDate: "2026-07-10", signal: "outflow" },
  { ticker: "ARM", company: "ARM 홀딩스", insider: "르네 하스", role: "CEO", type: "buy", shares: 15000, amount: 1.93, tradeDate: "2026-07-10", filedDate: "2026-07-11", signal: "inflow" },
  { ticker: "JPM", company: "JP모건 체이스", insider: "제이미 다이먼", role: "CEO", type: "sell", shares: 30000, amount: 6.43, tradeDate: "2026-07-07", filedDate: "2026-07-09", signal: "neutral" },
  { ticker: "AVGO", company: "브로드컴", insider: "혹 탄", role: "CEO", type: "sell", shares: 5000, amount: 8.21, tradeDate: "2026-07-09", filedDate: "2026-07-10", signal: "outflow" },
  { ticker: "LLY", company: "일라이 릴리", insider: "데이비드 릭스", role: "CEO", type: "buy", shares: 3000, amount: 2.44, tradeDate: "2026-07-11", filedDate: "2026-07-12", signal: "inflow" },
  { ticker: "XOM", company: "엑슨모빌", insider: "대런 우즈", role: "CEO", type: "sell", shares: 40000, amount: 4.34, tradeDate: "2026-07-08", filedDate: "2026-07-09", signal: "outflow" },
];

// 30 day insider net trend series
export function generateInsiderTrend(days = 30): { date: string; buy: number; sell: number }[] {
  if (INSIDER_ROWS.length) {
    const end = new Date(Math.max(...INSIDER_ROWS.map((row) => new Date(row.filedDate).getTime())));
    const points = new Map<string, { buy: number; sell: number }>();
    for (let i = days; i >= 0; i--) {
      const date = new Date(end);
      date.setUTCDate(end.getUTCDate() - i);
      points.set(date.toISOString().slice(0, 10), { buy: 0, sell: 0 });
    }
    for (const row of INSIDER_ROWS) {
      const point = points.get(row.filedDate);
      if (point) point[row.type] += row.amount;
    }
    return [...points].map(([date, value]) => ({ date: `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`, ...value }));
  }
  let x = 1234;
  const rand = () => {
    x = (x * 9301 + 49297) % 233280;
    return x / 233280;
  };
  const out: { date: string; buy: number; sell: number }[] = [];
  for (let i = days; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      buy: Number((rand() * 80 + 10).toFixed(1)),
      sell: Number((rand() * 120 + 20).toFixed(1)),
    });
  }
  return out;
}

// ---------- IPO Lockup mock ----------
export type Importance = "high" | "medium" | "low";

export interface LockupRow {
  ticker: string;
  company: string;
  ipoDate: string;
  unlockDate: string;
  daysLeft: number;
  unlockShares: number; // millions
  estValue: number; // USD millions
  marketCap: number; // USD billions
  importance: Importance;
  lockupDays?: number;
}

export const LOCKUP_ROWS: LockupRow[] = [
  { ticker: "ARM", company: "ARM 홀딩스", ipoDate: "2025-09-14", unlockDate: "2026-07-15", daysLeft: 2, unlockShares: 940, estValue: 120_884, marketCap: 132, importance: "high" },
  { ticker: "RBLX", company: "레딧", ipoDate: "2025-03-21", unlockDate: "2026-07-19", daysLeft: 6, unlockShares: 78, estValue: 4_212, marketCap: 12.4, importance: "high" },
  { ticker: "KLAR", company: "클라나", ipoDate: "2025-11-08", unlockDate: "2026-07-22", daysLeft: 9, unlockShares: 62, estValue: 3_180, marketCap: 9.8, importance: "medium" },
  { ticker: "CRCL", company: "서클 인터넷", ipoDate: "2026-01-15", unlockDate: "2026-07-24", daysLeft: 11, unlockShares: 44, estValue: 2_640, marketCap: 8.2, importance: "medium" },
  { ticker: "SEVN", company: "세븐 앤 아이", ipoDate: "2025-04-30", unlockDate: "2026-07-28", daysLeft: 15, unlockShares: 210, estValue: 6_720, marketCap: 21, importance: "high" },
  { ticker: "STBX", company: "스타박스 재상장", ipoDate: "2025-05-15", unlockDate: "2026-08-02", daysLeft: 20, unlockShares: 32, estValue: 1_240, marketCap: 4.2, importance: "low" },
  { ticker: "GEMI", company: "제미나이 스페이스", ipoDate: "2026-02-10", unlockDate: "2026-08-08", daysLeft: 26, unlockShares: 55, estValue: 1_980, marketCap: 5.6, importance: "medium" },
  { ticker: "OPAL", company: "오팔 헬스", ipoDate: "2025-08-01", unlockDate: "2026-08-11", daysLeft: 29, unlockShares: 18, estValue: 780, marketCap: 2.8, importance: "low" },
];
