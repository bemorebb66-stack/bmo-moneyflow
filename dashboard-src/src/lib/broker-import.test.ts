import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { inspectBrokerFile, normalizeBrokerRows } from "./broker-import";

function workbookFile(name: string, sheets: Record<string, unknown[][]>) {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  const bytes = XLSX.write(workbook, { type: "array", bookType: name.endsWith(".xls") ? "xls" : "xlsx" }) as ArrayBuffer;
  return { name, arrayBuffer: async () => bytes } as File;
}

describe("broker Excel import", () => {
  it("finds the Shinhan trade sheet and excludes cancelled and duplicate rows", async () => {
    const file = workbookFile("shinhan.xlsx", {
      안내: [["해외주식 거래내역"], ["계좌번호", "123-456"]],
      거래내역: [
        ["해외주식 체결내역"], ["계좌번호", "123-456"], ["고객명", "홍길동"], ["조회기간", "2026-07"], [], [], [],
        ["주문일자", "매매구분", "종목코드", "체결수량", "체결단가", "수수료", "기준통화"],
        [20260701, "매수", "AAPL", "1.5", "$200.00", "1", "USD"],
        [20260701, "매수", "AAPL", "1.5", "$200.00", "1", "USD"],
        [20260702, "취소", "AAPL", 1, 201, 0, "USD"],
        [new Date("2026-07-10T00:00:00Z"), "SELL", "AAPL", 1.5, "USD 210", 1, "USD"],
      ],
    });
    const inspection = await inspectBrokerFile(file);
    expect(inspection.selectedSheet).toBe("거래내역");
    expect(inspection.headerRow).toBe(8);
    expect(inspection.detectedBroker).toBe("신한투자증권");
    expect(inspection.automatic).toBe(true);
    const result = normalizeBrokerRows(inspection);
    expect(result.executions).toHaveLength(3);
    expect(result.executions[0]).toMatchObject({ ticker: "AAPL", transactionDate: "2026-07-01", side: "buy", quantity: 1.5, price: 200 });
    expect(result.excluded).toEqual({ "취소·정정·미체결": 1 });
    expect(result.warnings).toContain("동일한 체결 1건이 있습니다. 실제 분할체결인지 확인해주세요.");
    expect(result.period).toEqual({ first: "2026-07-01", last: "2026-07-10" });
  });

  it("asks for numeric side semantics and applies the chosen convention", async () => {
    const file = workbookFile("generic.xls", { Sheet1: [
      ["티커", "거래일", "거래구분", "수량", "가격"],
      ["NVDA", "2026.07.01", 1, "1,250", 100],
      ["NVDA", "2026/07/02", 2, 1250, 101],
    ] });
    const inspection = await inspectBrokerFile(file);
    expect(inspection.numericSideValues).toBe(true);
    expect(inspection.automatic).toBe(false);
    const result = normalizeBrokerRows(inspection, inspection.mapping, "1-buy");
    expect(result.executions.map((row) => row.side)).toEqual(["buy", "sell"]);
    expect(result.warnings).toContain("수수료 열이 없어 0으로 계산합니다.");
    expect(result.warnings).toContain("통화 열이 없어 USD로 처리합니다.");
  });
});
