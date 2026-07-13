import {
  INSIDER_ROWS,
  LIVE_META,
  LIVE_SECTOR_SERIES,
  LOCKUP_ROWS,
  SECTORS,
  SURGE_STOCKS,
  type InsiderRow,
  type LockupRow,
  type Sector,
  type Signal,
  type StockRow,
} from "./mock-data";

type MarketStock = {
  t: string; n: string; nko?: string; sec: string; c: number; pc: number;
  dv: number; dvp: number; a20: number; mc: number;
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

const signalFor = (shareDelta: number, volumeChange: number, priceChange: number): Signal => {
  if (shareDelta > 10 && priceChange >= 0) return "inflow";
  if (shareDelta < -10 && priceChange < 0) return "outflow";
  if (volumeChange < -15) return "attention-loss";
  return "neutral";
};

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
    const totalNow = stocks.reduce((sum, stock) => sum + (stock.dv || 0), 0);
    const totalPrev = stocks.reduce((sum, stock) => sum + (stock.dvp || 0), 0);
    const groups = new Map<string, MarketStock[]>();
    for (const stock of stocks) {
      if (!SECTOR_ID[stock.sec]) continue;
      groups.set(stock.sec, [...(groups.get(stock.sec) ?? []), stock]);
    }
    const sectors: Sector[] = [...groups].map(([name, rows]) => {
      const volume = rows.reduce((sum, row) => sum + (row.dv || 0), 0);
      const previous = rows.reduce((sum, row) => sum + (row.dvp || 0), 0);
      const avg20 = rows.reduce((sum, row) => sum + (row.a20 || 0), 0);
      const priceChange = volume ? rows.reduce((sum, row) => sum + row.pc * row.dv, 0) / volume : 0;
      const share = totalNow ? volume / totalNow * 100 : 0;
      const priorShare = totalPrev ? previous / totalPrev * 100 : 0;
      const shareDelta = (share - priorShare) * 100;
      const volumeChange = avg20 ? (volume / avg20 - 1) * 100 : 0;
      return {
        id: SECTOR_ID[name], name: SECTOR_KO[name], group: "sector" as const, volume: volume / 1e6,
        volumeChange, priceChange, shareDelta, share,
        signal: signalFor(shareDelta, volumeChange, priceChange),
        leaders: [...rows].sort((a, b) => b.dv - a.dv).slice(0, 3).map((row) => row.t),
      };
    }).sort((a, b) => b.volume - a.volume);
    SECTORS.splice(0, SECTORS.length, ...sectors);

    const surge: StockRow[] = stocks
      .filter((stock) => stock.a20 > 0)
      .map((stock) => ({
        ticker: stock.t, name: stock.nko || stock.n, sector: SECTOR_KO[stock.sec] || stock.sec,
        price: stock.c, change: stock.pc, volume: stock.dv / 1e6,
        volumeRatio: stock.dv / stock.a20, marketCap: stock.mc / 1e9,
        signal: signalFor(0, (stock.dv / stock.a20 - 1) * 100, stock.pc),
      }))
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, 100);
    SURGE_STOCKS.splice(0, SURGE_STOCKS.length, ...surge);

    const dates = history.dates as string[];
    for (const [name, values] of Object.entries(history.sector ?? {})) {
      const id = SECTOR_ID[name];
      if (!id || !Array.isArray(values) || !values.length) continue;
      const first = Number(values[0]) || 1;
      LIVE_SECTOR_SERIES[id] = values.map((value, index) => ({
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

    const lockupRows: LockupRow[] = (lockup.events ?? []).map((row: any) => ({
      ticker: row.ticker, company: row.company, ipoDate: row.ipoDate,
      unlockDate: row.lockupDate, daysLeft: daysUntil(row.lockupDate), unlockShares: 0,
      estValue: 0, marketCap: 0,
      lockupDays: Number(row.lockupDays) || undefined,
      importance: daysUntil(row.lockupDate) <= 14 ? "high" : daysUntil(row.lockupDate) <= 30 ? "medium" : "low",
    }));
    LOCKUP_ROWS.splice(0, LOCKUP_ROWS.length, ...lockupRows);

    LIVE_META.asOf = market.market_date || "-";
    LIVE_META.updatedAt = market.updated || "-";
    LIVE_META.universeCount = Number(market.count) || stocks.length;
  } catch (error) {
    console.error("Live data hydration failed", error);
  }
}
