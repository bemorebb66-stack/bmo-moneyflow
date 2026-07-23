import { createWorker, OEM } from "tesseract.js";

function tableText(blocks: Awaited<ReturnType<Awaited<ReturnType<typeof createWorker>>["recognize"]>>["data"]["blocks"]) {
  if (!blocks) return "";
  const rows: string[] = [];
  for (const line of blocks.flatMap((block) => block.paragraphs).flatMap((paragraph) => paragraph.lines)) {
    const words = [...line.words].sort((a, b) => a.bbox.x0 - b.bbox.x0);
    const cells: string[] = [];
    let previousEnd = Number.NEGATIVE_INFINITY;
    const rowHeight = Math.max(10, line.bbox.y1 - line.bbox.y0);
    for (const word of words) {
      const gap = word.bbox.x0 - previousEnd;
      if (cells.length && gap < rowHeight * 1.25) cells[cells.length - 1] = `${cells[cells.length - 1]} ${word.text}`.trim();
      else cells.push(word.text.trim());
      previousEnd = word.bbox.x1;
    }
    if (cells.some(Boolean)) rows.push(cells.filter(Boolean).join("\t"));
  }
  return rows.join("\n");
}

export async function recognizeTradeImage(file: File, onProgress: (progress: number, status: string) => void) {
  const worker = await createWorker(["eng", "kor"], OEM.LSTM_ONLY, {
    logger: (message) => {
      if (typeof message.progress === "number") onProgress(message.progress, message.status);
    },
  });
  try {
    const result = await worker.recognize(file, { rotateAuto: true }, { blocks: true, text: true });
    const structured = tableText(result.data.blocks);
    const text = structured || result.data.text.trim();
    if (!text) throw new Error("이미지에서 거래내역 글자를 찾지 못했습니다.");
    return text;
  } finally {
    await worker.terminate();
  }
}
