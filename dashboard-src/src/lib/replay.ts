export type ReplayExecution = {
  ticker: string;
  transactionDate: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  fee: number;
  row: number;
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
  ticker: ReplaySnapshot["tickers"][string];
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
  executions.sort((a, b) => a.transactionDate.localeCompare(b.transactionDate) || a.row - b.row);
  return { executions, errors };
}

type Position = {
  quantity: number; cost: number; entryDate: string; buyCount: number; sellCount: number;
  proceeds: number; soldQuantity: number; sellFees: number; totalBought: number;
  buyCost: number; realizedCost: number;
};

export function combineReplayTrades(executions: ReplayExecution[]) {
  const positions = new Map<string, Position>();
  const trades: CompletedTrade[] = [];
  const errors: string[] = [];
  for (const item of executions) {
    let position = positions.get(item.ticker);
    if (!position) {
      position = { quantity: 0, cost: 0, entryDate: "", buyCount: 0, sellCount: 0, proceeds: 0, soldQuantity: 0, sellFees: 0, totalBought: 0, buyCost: 0, realizedCost: 0 };
      positions.set(item.ticker, position);
    }
    if (item.side === "buy") {
      if (position.quantity === 0) Object.assign(position, { cost: 0, entryDate: item.transactionDate, buyCount: 0, sellCount: 0, proceeds: 0, soldQuantity: 0, sellFees: 0, totalBought: 0, buyCost: 0, realizedCost: 0 });
      const purchaseCost = item.quantity * item.price + item.fee;
      position.quantity += item.quantity;
      position.cost += purchaseCost;
      position.buyCost += purchaseCost;
      position.totalBought += item.quantity;
      position.buyCount += 1;
      continue;
    }
    if (item.quantity > position.quantity + 1e-9) {
      errors.push(`${item.row}행 ${item.ticker}: 보유 수량보다 많은 매도입니다.`);
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
    if (Math.abs(position.quantity) < 1e-9) {
      const profit = position.proceeds - position.sellFees - position.realizedCost;
      const holdingDays = Math.round((Date.parse(`${item.transactionDate}T00:00:00Z`) - Date.parse(`${position.entryDate}T00:00:00Z`)) / 86400000);
      trades.push({ ticker: item.ticker, entryDate: position.entryDate, exitDate: item.transactionDate, averageEntryPrice: position.buyCost / position.totalBought, averageExitPrice: position.proceeds / position.soldQuantity, quantity: position.soldQuantity, realizedProfit: profit, returnPercent: position.realizedCost ? profit / position.realizedCost * 100 : 0, holdingDays, buyCount: position.buyCount, sellCount: position.sellCount });
      position.quantity = position.cost = 0;
    }
  }
  const warnings = [...positions].filter(([, row]) => row.quantity > 1e-9).map(([ticker, row]) => `${ticker}: 미청산 수량 ${row.quantity.toLocaleString("ko-KR")}주는 분석에서 제외됩니다.`);
  return { trades, errors, warnings };
}

export function addContext(trade: CompletedTrade, snapshot: ReplaySnapshot, contextStatus: string): CompletedTrade {
  const ticker = snapshot.tickers[trade.ticker];
  if (!ticker) return { ...trade, contextStatus: "해당 종목 데이터 없음" };
  return { ...trade, contextStatus, context: { tradingDate: snapshot.trading_date, ticker, industry: snapshot.groups.industry[ticker.industry], sector: snapshot.groups.sector[ticker.sector], marketCap: snapshot.groups.market_cap[ticker.market_cap_group], market: snapshot.market } };
}

export function confidence(count: number) {
  if (count < 3) return "표본 부족";
  if (count < 5) return "참고";
  if (count < 10) return "낮음";
  if (count < 20) return "보통";
  return "높음";
}
