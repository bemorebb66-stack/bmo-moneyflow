import { GlobalWorkerOptions, getDocument, type TextItem } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { inspectBrokerRows, type BrokerInspection } from "@/lib/broker-import";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

type PositionedText = {
  text: string;
  x: number;
  y: number;
  width: number;
};

function pageRows(items: PositionedText[]) {
  const lines: PositionedText[][] = [];
  for (const item of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 3);
    if (line) line.push(item);
    else lines.push([item]);
  }
  return lines.map((line) => {
    const sorted = line.sort((a, b) => a.x - b.x);
    const cells: string[] = [];
    let previousEnd = Number.NEGATIVE_INFINITY;
    for (const item of sorted) {
      const gap = item.x - previousEnd;
      if (cells.length && gap <= 10) cells[cells.length - 1] = `${cells[cells.length - 1]} ${item.text}`.trim();
      else cells.push(item.text.trim());
      previousEnd = item.x + item.width;
    }
    return cells.filter(Boolean);
  }).filter((row) => row.length);
}

export async function inspectPdfTradeFile(file: File): Promise<BrokerInspection> {
  const data = new Uint8Array(await file.arrayBuffer());
  try {
    const pdf = await getDocument({ data }).promise;
    const rows: string[][] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items = content.items
        .filter((item): item is TextItem => "str" in item && Boolean(item.str.trim()))
        .map((item) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
          width: item.width,
        }));
      rows.push(...pageRows(items));
    }
    if (!rows.length) throw new Error("PDF에서 선택 가능한 텍스트를 찾지 못했습니다.");
    return inspectBrokerRows(rows, file.name, `PDF ${pdf.numPages}페이지`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/password/i.test(message)) throw new Error("암호가 설정된 PDF는 암호를 해제한 뒤 올려주세요.");
    if (message.includes("선택 가능한 텍스트")) throw error;
    throw new Error("PDF 표를 읽지 못했습니다. 스캔 문서라면 거래 표를 복사해 붙여넣어 주세요.");
  }
}
