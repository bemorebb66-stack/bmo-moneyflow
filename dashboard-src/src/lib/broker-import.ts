import * as XLSX from "xlsx";
import type { ReplayExecution } from "@/lib/replay";

export type ImportField = "ticker" | "transactionDate" | "transactionType" | "quantity" | "price" | "fee" | "currency" | "executionTime" | "executionId" | "orderId";
export type ColumnMapping = Record<ImportField, number | null>;

export type BrokerInspection = {
  fileName: string;
  selectedSheet: string;
  headerRow: number;
  headers: string[];
  rows: unknown[][];
  detectedBroker: string;
  confidence: "높음" | "보통" | "직접 확인 필요";
  mapping: ColumnMapping;
  automatic: boolean;
  numericSideValues: boolean;
};

export type BrokerImportResult = {
  executions: ReplayExecution[];
  errors: string[];
  warnings: string[];
  excluded: Record<string, number>;
  totalRows: number;
  period: { first: string | null; last: string | null };
  currencies: string[];
};

const aliases: Record<ImportField, string[]> = {
  ticker: ["ticker", "symbol", "티커", "심볼", "종목코드", "종목번호", "해외종목코드", "상품코드", "단축코드", "코드"],
  transactionDate: ["transactiondate", "transaction_date", "체결일자", "체결일", "매매일자", "매매일", "거래일자", "거래일", "주문일자", "주문일", "결제일자", "결제일"],
  transactionType: ["transactiontype", "transaction_type", "매매구분", "거래구분", "주문구분", "매수매도", "매수/매도", "매도매수구분", "구분"],
  quantity: ["quantity", "체결수량", "매매수량", "약정수량", "거래수량", "수량", "체결량"],
  price: ["price", "체결단가", "체결가격", "체결가", "매매단가", "약정단가", "거래단가", "가격", "단가"],
  fee: ["fee", "수수료", "매매수수료", "해외수수료", "제비용", "비용"],
  currency: ["currency", "기준통화", "거래통화", "결제통화", "통화코드", "통화"],
  executionTime: ["executiontime", "execution_time", "체결시간", "거래시간", "매매시간", "시간"],
  executionId: ["executionid", "execution_id", "체결번호", "체결순번", "체결일련번호"],
  orderId: ["orderid", "order_id", "주문번호", "주문순번", "주문일련번호"],
};

const requiredFields: ImportField[] = ["ticker", "transactionDate", "transactionType", "quantity", "price"];
const privacyHeaders = ["계좌번호", "고객명", "주민등록번호", "전화번호", "주소", "이메일", "계좌별명", "계좌유형"];
const excludedWords = ["취소", "정정", "미체결", "주문취소", "cancel", "unfilled"];

export const importFieldLabels: Record<ImportField, string> = {
  ticker: "종목 티커",
  transactionDate: "거래 날짜",
  transactionType: "매수·매도",
  quantity: "체결 수량",
  price: "체결 가격",
  fee: "수수료",
  currency: "통화",
  executionTime: "체결 시간",
  executionId: "체결 번호",
  orderId: "주문 번호",
};

function normalized(value: unknown) {
  return String(value ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, "")
    .replace(/[\s_\-./·:]/g, "")
    .toLowerCase();
}

function fieldForHeader(value: unknown): ImportField | null {
  const key = normalized(value);
  for (const [field, names] of Object.entries(aliases) as [ImportField, string[]][]) {
    if (names.some((name) => normalized(name) === key)) return field;
  }
  return null;
}

function mappingFor(headers: unknown[]): ColumnMapping {
  const mapping = Object.fromEntries(Object.keys(aliases).map((field) => [field, null])) as ColumnMapping;
  const normalizedHeaders = headers.map(normalized);
  for (const [field, names] of Object.entries(aliases) as [ImportField, string[]][]) {
    for (const name of names) {
      const index = normalizedHeaders.indexOf(normalized(name));
      if (index >= 0) { mapping[field] = index; break; }
    }
  }
  return mapping;
}

function decodeCsv(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const replacementCount = (utf8.match(/�/g) ?? []).length;
  if (!replacementCount) return utf8.replace(/^\uFEFF/, "");
  try {
    return new TextDecoder("euc-kr", { fatal: false }).decode(buffer).replace(/^\uFEFF/, "");
  } catch {
    return utf8.replace(/^\uFEFF/, "");
  }
}

function brokerName(headers: string[]) {
  const keys = new Set(headers.map(normalized));
  const shinhan = ["주문일자", "매매구분", "종목코드", "체결수량", "체결단가"].filter((name) => keys.has(normalized(name))).length;
  if (shinhan >= 4) return "신한투자증권";
  return "공통 형식";
}

function inspectWorkbook(workbook: XLSX.WorkBook, fileName: string): BrokerInspection {
  type Candidate = { sheet: string; headerRow: number; rows: unknown[][]; mapping: ColumnMapping; score: number };
  let best: Candidate | null = null;
  for (const sheet of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet], { header: 1, raw: true, defval: "" });
    rows.slice(0, 50).forEach((row, headerRow) => {
      const mapping = mappingFor(row);
      const score = Object.values(mapping).filter((value) => value !== null).length;
      if (!best || score > best.score) best = { sheet, headerRow, rows, mapping, score };
    });
  }
  if (!best) throw new Error("파일에서 표 형식을 찾지 못했습니다.");
  const selected = best as Candidate;
  const headers = selected.rows[selected.headerRow].map((value: unknown) => String(value ?? "").trim());
  const privateColumns = headers.map(normalized).filter((header) => privacyHeaders.some((name) => normalized(name) === header));
  if (privateColumns.length) {
    selected.rows = selected.rows.map((row: unknown[]) => row.map((value: unknown, index: number) => privateColumns.includes(normalized(headers[index])) ? "" : value));
  }
  const mappedRequired = requiredFields.filter((field) => selected.mapping[field] !== null).length;
  const sideIndex = selected.mapping.transactionType;
  const sideSamples = sideIndex === null ? [] : selected.rows.slice(selected.headerRow + 1, selected.headerRow + 21).map((row) => String(row[sideIndex] ?? "").trim()).filter(Boolean);
  const numericSideValues = sideSamples.length > 0 && sideSamples.every((value) => value === "1" || value === "2");
  return {
    fileName,
    selectedSheet: selected.sheet,
    headerRow: selected.headerRow + 1,
    headers,
    rows: selected.rows.slice(selected.headerRow + 1).filter((row: unknown[]) => row.some((value: unknown) => String(value ?? "").trim())),
    detectedBroker: brokerName(headers),
    confidence: mappedRequired === requiredFields.length ? (selected.score >= 7 ? "높음" : "보통") : "직접 확인 필요",
    mapping: selected.mapping,
    automatic: mappedRequired === requiredFields.length && !numericSideValues,
    numericSideValues,
  };
}

export function inspectBrokerRows(rows: unknown[][], fileName: string, sheetName = "붙여넣기"): BrokerInspection {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  return inspectWorkbook(workbook, fileName);
}

export function inspectBrokerText(text: string, fileName = "붙여넣은 거래내역"): BrokerInspection {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) throw new Error("붙여넣은 거래내역이 비어 있습니다.");
  if (cleaned.includes("\t")) {
    return inspectBrokerRows(
      cleaned.split(/\r?\n/).filter((line) => line.trim()).map((line) => line.split("\t").map((cell) => cell.trim())),
      fileName,
    );
  }
  return inspectWorkbook(XLSX.read(cleaned, { type: "string", cellDates: true, raw: true }), fileName);
}

export async function inspectBrokerFile(file: File): Promise<BrokerInspection> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["csv", "xlsx", "xls"].includes(extension)) throw new Error("CSV, XLSX, XLS, PDF 파일만 올릴 수 있습니다.");
  const buffer = await file.arrayBuffer();
  const workbook = extension === "csv"
    ? XLSX.read(decodeCsv(buffer), { type: "string", cellDates: true, raw: true })
    : XLSX.read(buffer, { type: "array", cellDates: true, raw: true });
  return inspectWorkbook(workbook, file.name);
}

function excelDate(serial: number) {
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  return `${parsed.y.toString().padStart(4, "0")}-${parsed.m.toString().padStart(2, "0")}-${parsed.d.toString().padStart(2, "0")}`;
}

function validDate(year: string, month: string, day: string) {
  const iso = `${year.padStart(4, "0")}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === iso ? iso : null;
}

function dateValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 20000 && value < 80000) return excelDate(value);
  const text = String(value ?? "").trim().replace(/[년월]/g, "-").replace(/일/g, "").split(/[ T]/)[0];
  if (/^\d{8}$/.test(text)) return validDate(text.slice(0, 4), text.slice(4, 6), text.slice(6));
  const match = text.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  if (match) return validDate(match[1], match[2], match[3]);
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return validDate(us[3], us[1], us[2]);
  return null;
}

function numeric(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  let text = String(value ?? "").trim();
  const negative = /^\(.*\)$/.test(text);
  text = text.replace(/[,$₩€¥]/g, "").replace(/USD|KRW|JPY|EUR|주/gi, "").replace(/[()\s]/g, "");
  const parsed = Number(text);
  return negative ? -parsed : parsed;
}

function timeValue(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(11, 19);
  if (typeof value === "number" && value >= 0 && value < 1) {
    const seconds = Math.round(value * 86400) % 86400;
    return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
  }
  const digits = String(value ?? "").replace(/\D/g, "").padStart(6, "0").slice(-6);
  return digits === "000000" && !String(value ?? "").trim() ? "" : `${digits.slice(0, 2)}:${digits.slice(2, 4)}:${digits.slice(4)}`;
}

function sideValue(value: unknown) {
  const key = normalized(value);
  if (["매수", "buy", "b", "매수체결", "현금매수", "외화매수"].includes(key)) return "buy" as const;
  if (["매도", "sell", "s", "매도체결", "현금매도", "외화매도"].includes(key)) return "sell" as const;
  return null;
}

function addExcluded(excluded: Record<string, number>, reason: string) {
  excluded[reason] = (excluded[reason] ?? 0) + 1;
}

export function normalizeBrokerRows(inspection: BrokerInspection, mapping = inspection.mapping, numericSide: "1-buy" | "1-sell" | null = null): BrokerImportResult {
  const missing = requiredFields.filter((field) => mapping[field] === null);
  if (missing.length) return { executions: [], errors: [`필수 열을 연결해주세요: ${missing.map((field) => importFieldLabels[field]).join(", ")}`], warnings: [], excluded: {}, totalRows: inspection.rows.length, period: { first: null, last: null }, currencies: [] };
  const executions: ReplayExecution[] = [];
  const seen = new Set<string>();
  let duplicateCandidates = 0;
  const warnings: string[] = [];
  const excluded: Record<string, number> = {};
  const currencySet = new Set<string>();
  const settlementHeader = mapping.transactionDate !== null && normalized(inspection.headers[mapping.transactionDate]).startsWith(normalized("결제일"));
  if (settlementHeader) warnings.push("체결일이 없어 결제일을 거래일로 사용했습니다.");
  if (mapping.fee === null) warnings.push("수수료 열이 없어 0으로 계산합니다.");
  if (mapping.currency === null) warnings.push("통화 열이 없어 USD로 처리합니다.");

  inspection.rows.forEach((row, index) => {
    const rowText = row.map((value) => String(value ?? "")).join(" ").toLowerCase();
    if (excludedWords.some((word) => rowText.includes(word))) { addExcluded(excluded, "취소·정정·미체결"); return; }
    const ticker = String(row[mapping.ticker!] ?? "").trim().toUpperCase().replace(/^US[.:-]/, "").replace(".", "-");
    const transactionDate = dateValue(row[mapping.transactionDate!]);
    const rawSide = String(row[mapping.transactionType!] ?? "").trim();
    const side = numericSide && (rawSide === "1" || rawSide === "2") ? (rawSide === "1" ? (numericSide === "1-buy" ? "buy" : "sell") : (numericSide === "1-buy" ? "sell" : "buy")) : sideValue(rawSide);
    const quantity = numeric(row[mapping.quantity!]);
    const price = numeric(row[mapping.price!]);
    const fee = mapping.fee === null ? 0 : Math.abs(numeric(row[mapping.fee]) || 0);
    const currency = mapping.currency === null ? "USD" : String(row[mapping.currency] || "USD").trim().toUpperCase();
    const executionTime = mapping.executionTime === null ? "" : timeValue(row[mapping.executionTime]);
    const executionId = mapping.executionId === null ? "" : String(row[mapping.executionId] ?? "").trim();
    const orderId = mapping.orderId === null ? "" : String(row[mapping.orderId] ?? "").trim();
    currencySet.add(currency);
    if (!ticker || !transactionDate || !side || !(quantity > 0) || !(price > 0)) {
      addExcluded(excluded, quantity === 0 ? "체결수량 0" : "필수 정보 누락 또는 형식 오류");
      return;
    }
    if (currency !== "USD") { addExcluded(excluded, "USD 이외 통화"); return; }
    const signature = [ticker, transactionDate, side, quantity, price, fee].join("|");
    if (seen.has(signature)) duplicateCandidates += 1;
    seen.add(signature);
    executions.push({ ticker, transactionDate, side, quantity, price, fee, row: inspection.headerRow + index + 1, executionTime, executionId, orderId });
  });
  const sourceRows = [...executions].sort((a, b) => a.row - b.row);
  let ascending = 0;
  let descending = 0;
  sourceRows.slice(1).forEach((row, index) => {
    const comparison = row.transactionDate.localeCompare(sourceRows[index].transactionDate);
    if (comparison > 0) ascending += 1;
    if (comparison < 0) descending += 1;
  });
  const sourceOrderHint = descending > ascending || (inspection.detectedBroker === "신한투자증권" && ascending === descending) ? "reverse-chronological" as const : "chronological" as const;
  executions.forEach((row) => { row.sourceOrderHint = sourceOrderHint; });
  if (duplicateCandidates) warnings.push(`동일한 체결 ${duplicateCandidates}건이 있습니다. 실제 분할체결인지 확인해주세요.`);
  const dates = executions.map((row) => row.transactionDate).sort();
  return { executions, errors: [], warnings, excluded, totalRows: inspection.rows.length, period: { first: dates[0] ?? null, last: dates.at(-1) ?? null }, currencies: [...currencySet].sort() };
}
