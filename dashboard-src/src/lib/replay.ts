import { getEtfMetadata, type EtfMetadata } from "./etf-metadata";
import type { DataGrade } from "./signal-rules";
import { DATA_CONTRACT_VERSION, REPLAY_RULE_VERSION, SIGNAL_RULE_VERSION } from "./signal-rules";
import { isTradingDate, TRADING_CALENDAR_VERSION } from "./trading-calendar";

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
  executionTimestamp?: string;
  feeProvided?: boolean;
  dateBasis?: "TRADE_DATE" | "SETTLEMENT_DATE";
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
  entryAt?: string;
  entryTimeStatus?: "KNOWN" | "DATE_ONLY";
  feeStatus?: "COMPLETE" | "ASSUMED_ZERO";
  dateStatus?: "VALID" | "NON_TRADING_DATE" | "SETTLEMENT_DATE";
  context?: TradeContext;
  contextStatus?: string;
};

export type ReplaySnapshot = {
  schema_version?: number;
  trading_date: string;
  available_at?: string;
  information_cutoff_at?: string;
  content_hash?: string;
  signal_rule_version?: string;
  replay_rule_version?: string;
  calendar_version?: string;
  data_contract_version?: string;
  data_grade?: DataGrade;
  data_grade_reasons?: string[];
  market: {
    market_regime: string;
    dollar_volume_change_1d: number | null;
    indices?: Array<{ symbol: string; name: string; close: number; change_percent: number | null }>;
  };
  tickers: Record<string, {
    name: string;
    name_ko: string;
    close_price?: number;
    daily_return?: number | null;
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
  assetType: ReplayAssetType;
  productDataAvailable: boolean;
  underlyingMappingAvailable: boolean;
  underlyingDataAvailable: boolean;
  sectorDataAvailable: boolean;
  marketDataAvailable: boolean;
  missingReasons: string[];
  supportLevel: CoverageStatus;
  industry?: GroupContext;
  sector?: GroupContext;
  marketCap?: GroupContext;
  market: ReplaySnapshot["market"];
  dataGrade: DataGrade;
  dataGradeReasons: string[];
  signalRuleVersion: string;
  replayRuleVersion: string;
  snapshotHash?: string;
  snapshotAvailableAt?: string;
};

export type ReplayManifestEntry = {
  trading_date: string;
  available_at?: string;
  data_grade?: DataGrade;
  content_hash?: string;
  file_hash?: string;
  signal_rule_version?: string;
  replay_rule_version?: string;
  calendar_version?: string;
  data_contract_version?: string;
  path: string;
  selectable?: boolean;
};

export type ReplayManifest = {
  schema_version?: number;
  dates?: string[];
  entries?: ReplayManifestEntry[];
  data_contract_version?: string;
  signal_rule_version?: string;
  replay_rule_version?: string;
  calendar_version?: string;
};

export type SnapshotSelection = {
  entry?: ReplayManifestEntry;
  status: "SELECTED" | "NO_CAUSAL_SNAPSHOT" | "LEGACY_MANIFEST_UNUSABLE" | "INVALID_MANIFEST";
  reason: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isFiniteOrNull(value: unknown) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function exchangeDate(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidManifestEntry(entry: ReplayManifestEntry) {
  const path = /^revisions\/(\d{4}-\d{2}-\d{2})\/([0-9a-f]{64})\.json$/.exec(entry.path);
  return Boolean(
    path
    && path[1] === entry.trading_date
    && entry.content_hash === `sha256:${path[2]}`
    && /^sha256:[0-9a-f]{64}$/.test(entry.file_hash ?? "")
    && entry.available_at
    && /(Z|[+-]\d{2}:\d{2})$/.test(entry.available_at)
    && Number.isFinite(Date.parse(entry.available_at))
    && entry.data_grade
    && ["PIT_VERIFIED", "PIT_RECONSTRUCTED", "CURRENT_PROXY"].includes(entry.data_grade)
    && entry.signal_rule_version === SIGNAL_RULE_VERSION
    && entry.replay_rule_version === REPLAY_RULE_VERSION
    && entry.calendar_version === TRADING_CALENDAR_VERSION
    && entry.data_contract_version === DATA_CONTRACT_VERSION,
  );
}

export function validateReplaySnapshot(snapshot: ReplaySnapshot) {
  const reasons: string[] = [];
  if (snapshot.schema_version !== 2) reasons.push("UNSUPPORTED_SCHEMA_VERSION");
  if (snapshot.signal_rule_version !== SIGNAL_RULE_VERSION) reasons.push("SIGNAL_RULE_VERSION_MISMATCH");
  if (snapshot.replay_rule_version !== REPLAY_RULE_VERSION) reasons.push("REPLAY_RULE_VERSION_MISMATCH");
  if (snapshot.calendar_version !== TRADING_CALENDAR_VERSION) reasons.push("CALENDAR_VERSION_MISMATCH");
  if (snapshot.data_contract_version !== DATA_CONTRACT_VERSION) reasons.push("DATA_CONTRACT_VERSION_MISMATCH");
  if (!snapshot.data_grade || !["PIT_VERIFIED", "PIT_RECONSTRUCTED", "CURRENT_PROXY"].includes(snapshot.data_grade)) reasons.push("INVALID_DATA_GRADE");
  if (!snapshot.available_at || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.available_at) || !Number.isFinite(Date.parse(snapshot.available_at))) reasons.push("INVALID_AVAILABLE_AT");
  if (!snapshot.information_cutoff_at || !/(Z|[+-]\d{2}:\d{2})$/.test(snapshot.information_cutoff_at) || !Number.isFinite(Date.parse(snapshot.information_cutoff_at))) reasons.push("INVALID_INFORMATION_CUTOFF_AT");
  if (snapshot.available_at && snapshot.information_cutoff_at && Date.parse(snapshot.available_at) < Date.parse(snapshot.information_cutoff_at)) reasons.push("AVAILABLE_BEFORE_INFORMATION_CUTOFF");
  if (!snapshot.content_hash || !/^sha256:[0-9a-f]{64}$/.test(snapshot.content_hash)) reasons.push("INVALID_CONTENT_HASH");
  if (!isTradingDate(snapshot.trading_date)) reasons.push("INVALID_TRADING_DATE");
  if (!isRecord(snapshot.market) || typeof snapshot.market.market_regime !== "string" || !isFiniteOrNull(snapshot.market.dollar_volume_change_1d)) reasons.push("INVALID_MARKET");
  if (!isRecord(snapshot.groups) || !isRecord(snapshot.groups.sector) || !isRecord(snapshot.groups.industry) || !isRecord(snapshot.groups.market_cap)) reasons.push("INVALID_GROUPS");
  if (!snapshot.tickers || typeof snapshot.tickers !== "object" || Array.isArray(snapshot.tickers)) reasons.push("INVALID_TICKERS");
  else if (Object.entries(snapshot.tickers).some(([ticker, row]) => !ticker || !isRecord(row) || typeof row.name !== "string" || typeof row.volume_state !== "string" || typeof row.sector !== "string" || typeof row.industry !== "string" || typeof row.market_cap_group !== "string" || !isFiniteOrNull(row.dollar_volume_change_1d) || !isFiniteOrNull(row.dollar_volume_ratio_5d) || !isFiniteOrNull(row.dollar_volume_ratio_20d))) reasons.push("INVALID_TICKER_ROW");
  return reasons;
}

export async function calculateSha256(text: string) {
  const bytes = new TextEncoder().encode(text);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function selectReplaySnapshot(manifest: ReplayManifest, trade: Pick<CompletedTrade, "entryDate" | "entryAt" | "entryTimeStatus">): SnapshotSelection {
  const entries = manifest.entries ?? [];
  if (!entries.length) {
    return {
      status: "LEGACY_MANIFEST_UNUSABLE",
      reason: "가용 시각이 없는 구형 스냅샷은 미래 데이터 참조 여부를 검증할 수 없어 사용하지 않습니다.",
    };
  }
  const validEntries = entries.filter(isValidManifestEntry);
  if (!validEntries.length) {
    return { status: "INVALID_MANIFEST", reason: "스냅샷 목록의 경로·해시·가용 시각 계약이 올바르지 않아 사용하지 않습니다." };
  }
  const eligible = validEntries.filter((entry) => {
    if (entry.selectable === false || !entry.available_at) return false;
    if (trade.entryAt && trade.entryTimeStatus === "KNOWN" && /(Z|[+-]\d{2}:\d{2})$/.test(trade.entryAt)) {
      const entryAt = Date.parse(trade.entryAt);
      const availableAt = Date.parse(entry.available_at);
      return entry.trading_date <= trade.entryDate && Number.isFinite(entryAt) && Number.isFinite(availableAt) && availableAt <= entryAt;
    }
    // Date-only fills use a deliberately stricter rule: prior session and a
    // revision available before the entry's New York calendar date.
    return entry.trading_date < trade.entryDate && exchangeDate(entry.available_at) < trade.entryDate;
  });
  const entry = eligible.sort((a, b) => b.trading_date.localeCompare(a.trading_date) || String(b.available_at).localeCompare(String(a.available_at)))[0];
  return entry
    ? { entry, status: "SELECTED", reason: trade.entryAt ? "체결 시각 이전 공개본" : "날짜만 있어 보수적으로 선택한 직전 공개본" }
    : { status: "NO_CAUSAL_SNAPSHOT", reason: "진입 시점 전에 공개됐음을 입증할 수 있는 스냅샷이 없습니다." };
}

export type ReplayAssetType =
  | "STOCK"
  | "ETF"
  | "LEVERAGED_SINGLE_STOCK_ETF"
  | "LEVERAGED_SECTOR_ETF"
  | "LEVERAGED_INDEX_ETF"
  | "INVERSE_ETF"
  | "VOLATILITY_ETP"
  | "UNKNOWN";

export type CoverageStatus =
  | "FULL"
  | "UNDERLYING_ONLY"
  | "SECTOR_ONLY"
  | "INDEX_ONLY"
  | "PRODUCT_ONLY"
  | "MAPPING_REQUIRED"
  | "HISTORICAL_DATA_MISSING"
  | "UNSUPPORTED";

export type ParseResult = {
  executions: ReplayExecution[];
  errors: string[];
};

const required = ["ticker", "transaction_date", "transaction_type", "quantity", "price", "fee", "currency"];
const buys = new Set(["buy", "b", "매수"]);
const sells = new Set(["sell", "s", "매도"]);
const EPSILON = 1e-8;
export const MAX_REPLAY_EXECUTIONS = 50_000;
export const REPLAY_PARSER_VERSION = "bvt-parser/2.0.0";

export function parseExecutionTime(value?: string) {
  if (!value?.trim()) return Number.MAX_SAFE_INTEGER;
  const parts = value.trim().split(":").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return Number.MAX_SAFE_INTEGER;
  const [hour, minute, second] = parts;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return Number.MAX_SAFE_INTEGER;
  return hour * 3600 + minute * 60 + second;
}

function csvRows(text: string, maxRows = Number.POSITIVE_INFINITY) {
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
      if (rows.length >= maxRows) return rows;
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
  const normalized = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows = csvRows(normalized, MAX_REPLAY_EXECUTIONS + 2);
  if (!rows.length) return { executions: [], errors: ["CSV 파일이 비어 있습니다."] };
  if (rows.length - 1 > MAX_REPLAY_EXECUTIONS) return { executions: [], errors: [`체결 내역은 최대 ${MAX_REPLAY_EXECUTIONS.toLocaleString("ko-KR")}행까지 분석할 수 있습니다.`] };
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
      executions.push({ ticker, transactionDate, side, quantity, price, fee, row, feeProvided: Boolean(values[column.fee]?.trim()), dateBasis: "TRADE_DATE" });
    }
  });
  return { executions, errors };
}

type Position = {
  quantity: number; cost: number; entryDate: string; buyCount: number; sellCount: number;
  proceeds: number; soldQuantity: number; sellFees: number; totalBought: number;
  buyCost: number; realizedCost: number;
  entryAt?: string; feeComplete: boolean;
  dateStatus: "VALID" | "NON_TRADING_DATE" | "SETTLEMENT_DATE";
};

export type ReplayCorporateAction = {
  ticker: string;
  effectiveDate: string;
  actionType: "SPLIT";
  ratio: number;
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

export function combineReplayTrades(
  executions: ReplayExecution[],
  openingHoldings: Record<string, OpeningHolding> = {},
  corporateActions: ReplayCorporateAction[] = [],
) {
  const ordered = sortReplayExecutions(executions).executions;
  const sortedActions = [...corporateActions].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const openingShortfalls: Record<string, number> = {};
  const balances = new Map(Object.entries(openingHoldings).map(([ticker, holding]) => [ticker, Math.max(0, Number(holding.quantity || 0))]));
  const debugByTicker = new Map<string, ReplayTickerDebug>();
  const debugAppliedActions = new Set<number>();
  for (const item of ordered) {
    sortedActions.forEach((action, index) => {
      if (debugAppliedActions.has(index) || action.effectiveDate > item.transactionDate || !(action.ratio > 0)) return;
      debugAppliedActions.add(index);
      if (balances.has(action.ticker)) balances.set(action.ticker, (balances.get(action.ticker) ?? 0) * action.ratio);
      if (openingShortfalls[action.ticker]) openingShortfalls[action.ticker] *= action.ratio;
      const priorDebug = debugByTicker.get(action.ticker);
      if (priorDebug) {
        priorDebug.totalBuy *= action.ratio;
        priorDebug.totalSell *= action.ratio;
        priorDebug.minimumRunningQuantity *= action.ratio;
      }
    });
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
  const emptyPosition = (entryDate: string): Position => ({ quantity: 0, cost: 0, entryDate, buyCount: 0, sellCount: 0, proceeds: 0, soldQuantity: 0, sellFees: 0, totalBought: 0, buyCost: 0, realizedCost: 0, feeComplete: true, dateStatus: "VALID" });
  const appliedActions = new Set<number>();
  const pendingOpeningFactors = new Map<string, number>();
  for (const item of ordered) {
    sortedActions.forEach((action, index) => {
      if (appliedActions.has(index) || action.effectiveDate > item.transactionDate) return;
      appliedActions.add(index);
      if (!(action.ratio > 0)) {
        errors.push(`${action.ticker}: 분할 비율이 올바르지 않습니다.`);
        return;
      }
      const actionPosition = positions.get(action.ticker);
      if (actionPosition && actionPosition.quantity > EPSILON) {
        actionPosition.quantity *= action.ratio;
        actionPosition.totalBought *= action.ratio;
        actionPosition.soldQuantity *= action.ratio;
      } else if (openingHoldings[action.ticker]?.quantity) {
        pendingOpeningFactors.set(action.ticker, (pendingOpeningFactors.get(action.ticker) ?? 1) * action.ratio);
      }
    });
    let position = positions.get(item.ticker);
    if (!position) {
      const opening = openingHoldings[item.ticker];
      const openingFactor = pendingOpeningFactors.get(item.ticker) ?? 1;
      const originalOpeningQuantity = Math.max(0, Number(opening?.quantity || 0));
      const openingQuantity = originalOpeningQuantity * openingFactor;
      const openingPrice = Math.max(0, Number(opening?.averagePrice || 0));
      const openingCost = originalOpeningQuantity * openingPrice;
      position = { ...emptyPosition(item.transactionDate), quantity: openingQuantity, cost: openingCost, buyCount: openingQuantity ? 1 : 0, totalBought: openingQuantity, buyCost: openingCost };
      positions.set(item.ticker, position);
    }
    if (item.side === "buy") {
      if (Math.abs(position.quantity) < EPSILON) Object.assign(position, emptyPosition(item.transactionDate));
      if (!isTradingDate(item.transactionDate)) position.dateStatus = "NON_TRADING_DATE";
      else if (item.dateBasis === "SETTLEMENT_DATE" && position.dateStatus === "VALID") position.dateStatus = "SETTLEMENT_DATE";
      const purchaseCost = item.quantity * item.price + item.fee;
      if (position.buyCount === 0) position.entryAt = item.executionTimestamp && /(Z|[+-]\d{2}:\d{2})$/.test(item.executionTimestamp) && Number.isFinite(Date.parse(item.executionTimestamp)) ? item.executionTimestamp : undefined;
      position.quantity += item.quantity;
      position.cost += purchaseCost;
      position.buyCost += purchaseCost;
      position.totalBought += item.quantity;
      position.buyCount += 1;
      position.feeComplete = position.feeComplete && item.feeProvided !== false;
      continue;
    }
    if (item.quantity > position.quantity + EPSILON) {
      // This is usually a position opened before the exported date range.
      // The caller receives one consolidated shortfall per ticker below.
      continue;
    }
    if (!isTradingDate(item.transactionDate)) position.dateStatus = "NON_TRADING_DATE";
    else if (item.dateBasis === "SETTLEMENT_DATE" && position.dateStatus === "VALID") position.dateStatus = "SETTLEMENT_DATE";
    const averageCost = position.cost / position.quantity;
    position.quantity -= item.quantity;
    position.cost -= averageCost * item.quantity;
    position.realizedCost += averageCost * item.quantity;
    position.proceeds += item.quantity * item.price;
    position.soldQuantity += item.quantity;
    position.sellFees += item.fee;
    position.sellCount += 1;
    position.feeComplete = position.feeComplete && item.feeProvided !== false;
    if (Math.abs(position.quantity) < EPSILON) {
      const profit = position.proceeds - position.sellFees - position.realizedCost;
      const holdingDays = Math.round((Date.parse(`${item.transactionDate}T00:00:00Z`) - Date.parse(`${position.entryDate}T00:00:00Z`)) / 86400000);
      trades.push({ ticker: item.ticker, entryDate: position.entryDate, exitDate: item.transactionDate, averageEntryPrice: position.buyCost / position.totalBought, averageExitPrice: position.proceeds / position.soldQuantity, quantity: position.soldQuantity, realizedProfit: profit, returnPercent: position.realizedCost ? profit / position.realizedCost * 100 : 0, holdingDays, buyCount: position.buyCount, sellCount: position.sellCount, entryAt: position.entryAt, entryTimeStatus: position.entryAt ? "KNOWN" : "DATE_ONLY", feeStatus: position.feeComplete ? "COMPLETE" : "ASSUMED_ZERO", dateStatus: position.dateStatus });
      Object.assign(position, emptyPosition(item.transactionDate));
    }
  }
  const expectedRemaining = balances;
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
  const marketDataAvailable = Boolean(snapshot.market);
  if (!ticker && !asset) {
    const status = "과거 가격·거래대금 데이터가 없어 기본 매매 결과만 제공합니다.";
    return {
      ...trade,
      contextStatus: status,
      context: {
        tradingDate: snapshot.trading_date,
        assetType: "UNKNOWN",
        productDataAvailable: false,
        underlyingMappingAvailable: false,
        underlyingDataAvailable: false,
        sectorDataAvailable: false,
        marketDataAvailable,
        missingReasons: ["종목이 BVT 추적 유니버스에 없거나 과거 가격·거래대금 데이터가 없습니다."],
        supportLevel: "HISTORICAL_DATA_MISSING",
        market: snapshot.market,
        dataGrade: snapshot.data_grade ?? "CURRENT_PROXY",
        dataGradeReasons: snapshot.data_grade_reasons ?? ["LEGACY_SNAPSHOT_WITHOUT_DATA_GRADE"],
        signalRuleVersion: snapshot.signal_rule_version ?? SIGNAL_RULE_VERSION,
        replayRuleVersion: snapshot.replay_rule_version ?? REPLAY_RULE_VERSION,
        snapshotHash: snapshot.content_hash,
        snapshotAvailableAt: snapshot.available_at,
      },
    };
  }
  const underlyingTicker = asset?.underlyingTicker ? snapshot.tickers[asset.underlyingTicker] : undefined;
  const underlyingGroup = asset?.underlyingIndustry ? snapshot.groups.industry[asset.underlyingIndustry] : undefined;
  const underlyingIndex = asset?.underlyingIndex ? snapshot.market.indices?.find((row) => row.name === asset.underlyingIndex) : undefined;
  const hasUnderlying = Boolean(underlyingTicker || underlyingGroup || underlyingIndex);
  const assetType: ReplayAssetType = !asset
    ? "STOCK"
    : asset.assetType === "VOLATILITY_ETP" || asset.underlyingType === "VOLATILITY"
      ? "VOLATILITY_ETP"
      : asset.direction === "SHORT"
        ? "INVERSE_ETF"
        : asset.leverageMultiple > 1 && asset.underlyingType === "SINGLE_STOCK"
          ? "LEVERAGED_SINGLE_STOCK_ETF"
          : asset.leverageMultiple > 1 && asset.underlyingType === "SECTOR"
            ? "LEVERAGED_SECTOR_ETF"
            : asset.leverageMultiple > 1 && asset.underlyingType === "INDEX"
              ? "LEVERAGED_INDEX_ETF"
              : "ETF";
  const underlyingMappingAvailable = Boolean(asset && asset.underlyingType !== "UNKNOWN" && (asset.underlyingTicker || asset.underlyingIndustry || asset.underlyingIndex));
  const supportLevel: TradeContext["supportLevel"] = !asset && ticker
    ? "FULL"
    : asset?.underlyingType === "UNKNOWN"
    ? "MAPPING_REQUIRED"
    : ticker && hasUnderlying
    ? "FULL"
    : underlyingTicker
      ? "UNDERLYING_ONLY"
      : underlyingGroup
        ? "SECTOR_ONLY"
        : underlyingIndex
          ? "INDEX_ONLY"
          : ticker
            ? "PRODUCT_ONLY"
            : asset
              ? "UNSUPPORTED"
              : "HISTORICAL_DATA_MISSING";
  const missingReasons = [
    !ticker ? "상품 자체 가격·거래대금 데이터 없음" : "",
    asset && !underlyingMappingAvailable ? "기초자산 매핑 없음" : "",
    asset && underlyingMappingAvailable && !hasUnderlying ? "기초자산 과거 데이터 없음" : "",
  ].filter(Boolean);
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
  return { ...trade, contextStatus: status, context: { tradingDate: snapshot.trading_date, ticker, asset, underlyingTicker, underlyingGroup, underlyingIndex, assetType, productDataAvailable: Boolean(ticker), underlyingMappingAvailable, underlyingDataAvailable: hasUnderlying, sectorDataAvailable: Boolean(underlyingGroup || (ticker && snapshot.groups.sector[ticker.sector])), marketDataAvailable, missingReasons, supportLevel, industry: ticker ? snapshot.groups.industry[ticker.industry] : undefined, sector: ticker ? snapshot.groups.sector[ticker.sector] : undefined, marketCap: ticker ? snapshot.groups.market_cap[ticker.market_cap_group] : undefined, market: snapshot.market, dataGrade: snapshot.data_grade ?? "CURRENT_PROXY", dataGradeReasons: snapshot.data_grade_reasons ?? ["LEGACY_SNAPSHOT_WITHOUT_DATA_GRADE"], signalRuleVersion: snapshot.signal_rule_version ?? SIGNAL_RULE_VERSION, replayRuleVersion: snapshot.replay_rule_version ?? REPLAY_RULE_VERSION, snapshotHash: snapshot.content_hash, snapshotAvailableAt: snapshot.available_at } };
}

export function confidence(count: number) {
  if (count < 5) return "표본 부족";
  if (count < 15) return "신뢰도 낮음";
  if (count < 30) return "참고";
  return "탐색적 통계";
}
