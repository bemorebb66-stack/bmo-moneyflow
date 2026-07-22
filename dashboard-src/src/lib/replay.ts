import { getEtfMetadata, type EtfMetadata } from "./etf-metadata";

export type ReplayExecution = {
  ticker: string;
  transactionDate: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  row: number;
  executionTime?: string;
  executionId?: string;
  orderId?: string;
  sourceOrderHint?: "chronological" | "reverse-chronological";
};

export type CompletedTrade = {
  ticker: string;
  entryDate: string;
  exitDate: string;
  averageEntryPrice: number;
  averageExitPrice: number;
  quantity: number;
  realizedProfit: number;
  returnPercent: number;
  holdingDays: number;
  buyCount: number;
  sellCount: number;
  context?: TradeContext;
  contextStatus?: string;
};

export type ReplaySnapshot = {
  trading_date: string;
  market: {
    market_regime: string;
    dollar_volume_change_1d: number | null;
    indices?: Array<{ symbol: string; name: string; close: number; change_percent: number | null }>;
  };
  tickers: Record<string, {
    name: string;
    name_ko: string;
    volume_state: string;
    dollar_volume_change_1d: number | null;
    dollar_volume_ratio_5d: number | null;
    dollar_volume_ratio_20d: number | null;
    sector: string;
    industry: string;
    market_cap_group: string;
  }>;
  groups: {
    sector: Record<string, GroupContext>;
    industry: Record<string, GroupContext>;
    market_cap: Record<string, GroupContext>;
  };
};

type GroupContext = {
  flow_status: string;
  dollar_volume_change_1d: number | null;
  dollar_volume_ratio_5d: number | null;
  rank: number;
};

export type TradeContext = {
  tradingDate: string;
  ticker?: ReplaySnapshot["tickers"][string];
  asset?: EtfMetadata;
  underlyingTicker?: ReplaySnapshot["tickers"][string];
  underlyingGroup?: GroupContext;
  underlyingIndex?: { symbol: string; name: string; close: number; change_percent: number | null };
  supportLevel: "FULL" | "UNDERLYING_ONLY" | "SECTOR_ONLY" | "INDEX_ONLY" | "PRODUCT_ONLY" | "UNSUPPORTED";
  industry?: GroupContext;
  sector?: GroupContext;
  marketCap?: GroupContext;
  market: ReplaySnapshot["market"];
};

export type ParseResult = {
  executions: ReplayExecution[];
  errors: string[];
};

const required = ["ticker", "transaction_date", "transaction_type", "quantity", "price", "fee", "currency"];
const buys = new Set(["buy", "b", "매수"]);
const sells = new Set(["sell", "s", "매도"]);
const EPSILON = 1e-8;
export const REPLAY_PARSER_VERSION = "2026.07.19-2";

export function parseExecutionTime(value?: string) {
  if (!value?.trim()) return Number.MAX_SAFE_INTEGER;
  const parts = value.trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return Number.MAX_SAFE_INTEGER;
  const [hour, minute, second] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return Number.MAX_SAFE_INTEGER;
  return hour * 3600 + minute * 60 + second;
}

function csvRows(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function validIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function parseReplayCsv(text: string): ParseResult {
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  if (!rows.length) return { executions: [], errors: ["CSV 파일이 비어 있습니다."] };
  const headers = rows[0].map((value) => value.toLowerCase());
  const missing = required.filter((name) => !headers.includes(name));
  if (missing.length) return { executions: [], errors: [`필수 열이 없습니다: ${missing.join(", ")}`] };
  const column = Object.fromEntries(headers.map((name, index) => [name, index]));
  const executions: ReplayExecution[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((values, rowIndex) => {
    const row = rowIndex + 2;
    const ticker = (values[column.ticker] ?? "").toUpperCase().replace(".", "-");
    const transactionDate = values[column.transaction_date] ?? "";
    const rawSide = (values[column.transaction_type] ?? "").toLowerCase();
    const currency = (values[column.currency] ?? "").toUpperCase();
    const quantity = Number(values[column.quantity]);
    const price = Number(values[column.price]);
    const fee = Number(values[column.fee] || 0);
    const side = buys.has(rawSide) ? "buy" : sells.has(rawSide) ? "sell" : null;
    if (!ticker) errors.push(`${row}행: 티커가 비어 있습니다.`);
    if (!validIsoDate(transactionDate)) errors.push(`${row}행: 날짜는 유효한 YYYY-MM-DD 형식이어야 합니다.`);
    if (!side) errors.push(`${row}행: 거래 구분은 매수/매도 또는 buy/sell로 입력하세요.`);
    if (!(quantity > 0)) errors.push(`${row}행: 수량은 0보다 커야 합니다.`);
    if (!(price > 0)) errors.push(`${row}행: 가격은 0보다 커야 합니다.`);
    if (!(fee >= 0)) errors.push(`${row}행: 수수료를 확인하세요.`);
    if (currency !== "USD") errors.push(`${row}행: 현재는 USD 거래만 지원합니다.`);
    if (ticker && side && quantity > 0 && price > 0 && fee >= 0 && currency === "USD" && validIsoDate(transactionDate)) {
      executions.push({ ticker, transactionDate, side, quantity, price, fee, row });
    }
  });
  return { executions, errors };
}

type Position = {
  quantity: number; cost: number; entryDate: string; buyCount: number; sellCount: number;
  proceeds: number; soldQuantity: number; sellFees: number; totalBought: number;
  buyCost: number; realizedCost: number;
};

export function sortReplayExecutions(executions: ReplayExecution[]) {
  const bySourceRow = [...executions].sort((a, b) => a.row - b.row);
  let ascending = 0;
  let descending = 0;
  for (let index = 1; index < bySourceRow.length; index += 1) {
    const comparison = bySourceRow[index].transactionDate.localeCompare(bySourceRow[index - 1].transactionDate);
    if (comparison > 0) ascending += 1;
    if (comparison < 0) descending += 1;
  }
  const hinted = executions.find((row) => row.sourceOrderHint)?.sourceOrderHint;
  const sourceOrder = hinted ?? (descending > ascending ? "reverse-chronological" : "chronological");
  const sorted = [...executions].sort((a, b) => {
    const date = a.transactionDate.localeCompare(b.transactionDate);
    if (date) return date;
    const time = parseExecutionTime(a.executionTime) - parseExecutionTime(b.executionTime);
    if (time) return time;
    const executionId = a.executionId && b.executionId ? a.executionId.localeCompare(b.executionId, undefined, { numeric: true }) : 0;
    if (executionId) return executionId;
    const orderId = a.orderId && b.orderId ? a.orderId.localeCompare(b.orderId, undefined, { numeric: true }) : 0;
    if (orderId) return orderId;
    return sourceOrder === "reverse-chronological" ? b.row - a.row : a.row - b.row;
  });
  return { executions: sorted, sourceOrder };
}

export type OpeningHolding = { quantity: number; averagePrice?: number };
export type ReplayTickerDebug = { ticker: string; totalBuy: number; totalSell: number; minimumRunningQuantity: number; requiredInitialQuantity: number; finalRemaining: number; actualRemaining: number };
export type OpenPosition = { ticker: string; quantity: number };
export type CompletedTradeSelection = { limit: number | null; days: number | null; customFrom?: string; customTo?: string };

export function selectCompletedTrades(trades: CompletedTrade[], selection: CompletedTradeSelection) {
  const sorted = [...trades].sort((a, b) => b.exitDate.localeCompare(a.exitDate) || b.entryDate.localeCompare(a.entryDate));
  const latestExit = sorted[0]?.exitDate;
  let from = selection.customFrom;
  let to = selection.customTo;
  if (selection.days && latestExit) {
    const start = new Date(`${latestExit}T00:00:00Z`);
    start.setUTCDate(start.getUTCDate() - selection.days + 1);
    from = start.toISOString().slice(0, 10);
    to = latestExit;
  }
  const filtered = sorted.filter((trade) => (!from || trade.exitDate >= from) && (!to || trade.exitDate <= to));
  return selection.limit === null ? filtered : filtered.slice(0, selection.limit);
}

export function combineReplayTrades(executions: ReplayExecution[], openingHoldings: Record<string, OpeningHolding> = {}) {
  const ordered = sortReplayExecutions(executions).executions;
  const openingShortfalls: Record<string, number> = {};
  const balances = new Map(Object.entries(openingHoldings).map(([ticker, holding]) => [ticker, Math.max(0, Number(holding.quantity || 0))]));
  const debugByTicker = new Map<string, ReplayTickerDebug>();
  for (const item of ordered) {
    const debug = debugByTicker.get(item.ticker) ?? { ticker: item.ticker, totalBuy: 0, totalSell: 0, minimumRunningQuantity: 0, requiredInitialQuantity: 0, finalRemaining: 0, actualRemaining: 0 };
    if (item.side === "buy") debug.totalBuy += item.quantity;
    else debug.totalSell += item.quantity;
    const balance = (balances.get(item.ticker) ?? 0) + (item.side === "buy" ? item.quantity : -item.quantity);
    balances.set(item.ticker, balance);
    debug.minimumRunningQuantity = Math.min(debug.minimumRunningQuantity, balance);
    if (balance < -EPSILON) openingShortfalls[item.ticker] = Math.max(openingShortfalls[item.ticker] ?? 0, Math.abs(balance));
    debugByTicker.set(item.ticker, debug);
  }
  const positions = new Map<string, Position>();
  const trades: CompletedTrade[] = [];
  const errors: string[] = [];
  const emptyPosition = (entryDate: string): Position => ({ quantity: 0, cost: 0, entryDate, buyCount: 0, sellCount: 0, proceeds: 0, soldQuantity: 0, sellFees: 0, totalBought: 0, buyCost: 0, realizedCost: 0 });
  for (const item of ordered) {
    let position = positions.get(item.ticker);
    if (!position) {
      const opening = openingHoldings[item.ticker];
      const openingQuantity = Math.max(0, Number(opening?.quantity || 0));
      const openingPrice = Math.max(0, Number(opening?.averagePrice || 0));
      position = { ...emptyPosition(item.transactionDate), quantity: openingQuantity, cost: openingQuantity * openingPrice, buyCount: openingQuantity ? 1 : 0, totalBought: openingQuantity, buyCost: openingQuantity * openingPrice };
      positions.set(item.ticker, position);
    }
    if (item.side === "buy") {
      if (Math.abs(position.quantity) < EPSILON) Object.assign(position, emptyPosition(item.transactionDate));
      const purchaseCost = item.quantity * item.price + item.fee;
      position.quantity += item.quantity;
      position.cost += purchaseCost;
      position.buyCost += purchaseCost;
      position.totalBought += item.quantity;
      position.buyCount += 1;
      continue;
    }
    if (item.quantity > position.quantity + EPSILON) {
      // This is usually a position opened before the exported date range.
      // The caller receives one consolidated shortfall per ticker below.
      continue;
    }
    const averageCost = position.cost / position.quantity;
    position.quantity -= item.quantity;
    position.cost -= averageCost * item.quantity;
    position.realizedCost += averageCost * item.quantity;
    position.proceeds += item.quantity * item.price;
    position.soldQuantity += item.quantity;
    position.sellFees += item.fee;
    position.sellCount += 1;
    if (Math.abs(position.quantity) < EPSILON) {
      const profit = position.proceeds - position.sellFees - position.realizedCost;
      const holdingDays = Math.round((Date.parse(`${item.transactionDate}T00:00:00Z`) - Date.parse(`${position.entryDate}T00:00:00Z`)) / 86400000);
      trades.push({ ticker: item.ticker, entryDate: position.entryDate, exitDate: item.transactionDate, averageEntryPrice: position.buyCost / position.totalBought, averageExitPrice: position.proceeds / position.soldQuantity, quantity: position.soldQuantity, realizedProfit: profit, returnPercent: position.realizedCost ? profit / position.realizedCost * 100 : 0, holdingDays, buyCount: position.buyCount, sellCount: position.sellCount });
      Object.assign(position, emptyPosition(item.transactionDate));
    }
  }
  const expectedRemaining = new Map(Object.entries(openingHoldings).map(([ticker, holding]) => [ticker, Math.max(0, Number(holding.quantity || 0))]));
  for (const item of ordered) expectedRemaining.set(item.ticker, (expectedRemaining.get(item.ticker) ?? 0) + (item.side === "buy" ? item.quantity : -item.quantity));
  for (const [ticker, expected] of expectedRemaining) {
    const actual = positions.get(ticker)?.quantity ?? 0;
    const debug = debugByTicker.get(ticker);
    if (debug) {
      debug.requiredInitialQuantity = openingShortfalls[ticker] ?? 0;
      debug.finalRemaining = Math.abs(expected) < EPSILON ? 0 : expected;
      debug.actualRemaining = Math.abs(actual) < EPSILON ? 0 : actual;
    }
    if (openingShortfalls[ticker]) continue;
    if (Math.abs(actual - expected) >= EPSILON) errors.push(`${ticker}: 거래 수량 내부 일관성 오류가 발생했습니다. 분석을 중단합니다.`);
  }
  const warnings = [...positions]
    .filter(([ticker, row]) => !openingShortfalls[ticker] && row.quantity > EPSILON)
    .map(([ticker, row]) => `${ticker}: 미청산 수량 ${row.quantity.toLocaleString("ko-KR")}주는 분석에서 제외됩니다.`);
  const openPositions = [...positions]
    .filter(([ticker, row]) => !openingShortfalls[ticker] && row.quantity > EPSILON)
    .map(([ticker, row]) => ({ ticker, quantity: row.quantity }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
  return { trades, errors, warnings, openingShortfalls, openPositions, tickerDebug: [...debugByTicker.values()].sort((a, b) => a.ticker.localeCompare(b.ticker)) };
}

export function addContext(trade: CompletedTrade, snapshot: ReplaySnapshot, contextStatus: string): CompletedTrade {
  const ticker = snapshot.tickers[trade.ticker];
  const asset = getEtfMetadata(trade.ticker);
  if (!ticker && !asset) return { ...trade, contextStatus: "기초자산 매핑 또는 과거 가격·거래대금 데이터가 필요합니다." };
  const underlyingTicker = asset?.underlyingTicker ? snapshot.tickers[asset.underlyingTicker] : undefined;
  const underlyingGroup = asset?.underlyingIndustry ? snapshot.groups.industry[asset.underlyingIndustry] : undefined;
  const underlyingIndex = asset?.underlyingIndex ? snapshot.market.indices?.find((row) => row.name === asset.underlyingIndex) : undefined;
  const hasUnderlying = Boolean(underlyingTicker || underlyingGroup || underlyingIndex);
  const supportLevel: TradeContext["supportLevel"] = ticker && hasUnderlying
    ? "FULL"
    : underlyingTicker
      ? "UNDERLYING_ONLY"
      : underlyingGroup
        ? "SECTOR_ONLY"
        : underlyingIndex
          ? "INDEX_ONLY"
          : ticker
            ? "PRODUCT_ONLY"
            : "UNSUPPORTED";
  const status = supportLevel === "FULL"
    ? contextStatus
    : supportLevel === "UNDERLYING_ONLY"
      ? `${trade.ticker} 자체 거래대금은 미지원입니다. 기초자산 ${asset?.underlyingTicker} 환경을 기준으로 부분 분석했습니다.`
      : supportLevel === "SECTOR_ONLY"
        ? `${trade.ticker} 자체 거래대금은 미지원이지만, 기초 ${asset?.theme} 산업 흐름을 기준으로 부분 분석했습니다.`
        : supportLevel === "INDEX_ONLY"
          ? `${trade.ticker} 자체 거래대금은 미지원이지만, ${asset?.underlyingIndex} 환경을 기준으로 부분 분석했습니다.`
          : supportLevel === "PRODUCT_ONLY"
            ? `${trade.ticker} 상품 자체 데이터만 연결됐으며 기초자산 데이터는 미지원입니다.`
            : asset?.underlyingType === "VOLATILITY"
              ? `${trade.ticker}는 VIX 선물 기반 상품으로 일반 주식 섹터와 직접 비교하지 않습니다. 변동성 환경 데이터가 필요합니다.`
              : `${trade.ticker}는 매핑됐지만 기초자산 과거 데이터가 없어 시장환경 분석에서 제외됐습니다.`;
  return { ...trade, contextStatus: status, context: { tradingDate: snapshot.trading_date, ticker, asset, underlyingTicker, underlyingGroup, underlyingIndex, supportLevel, industry: ticker ? snapshot.groups.industry[ticker.industry] : undefined, sector: ticker ? snapshot.groups.sector[ticker.sector] : undefined, marketCap: ticker ? snapshot.groups.market_cap[ticker.market_cap_group] : undefined, market: snapshot.market } };
}

export function confidence(count: number) {
  if (count < 3) return "표본 부족";
  if (count < 5) return "참고";
  if (count < 10) return "낮음";
  if (count < 20) return "보통";
  return "높음";
}
