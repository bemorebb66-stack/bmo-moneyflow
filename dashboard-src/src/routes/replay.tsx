import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, ClipboardPaste, Download, FileSpreadsheet, RotateCcw, ShieldCheck, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";
import { inspectBrokerFile, inspectBrokerText, importFieldLabels, normalizeBrokerRows, type BrokerImportResult, type BrokerInspection, type ColumnMapping, type ImportField } from "@/lib/broker-import";
import { addContext, combineReplayTrades, confidence, parseReplayCsv, REPLAY_PARSER_VERSION, selectCompletedTrades, type CompletedTrade, type OpenPosition, type ReplaySnapshot, type ReplayTickerDebug } from "@/lib/replay";
import { cn } from "@/lib/utils";
import { analyzeReplayPerformance, type PerformanceRow } from "@/lib/replay-analytics";

export const Route = createFileRoute("/replay")({
  head: () => ({
    meta: [
      { title: "미국 주식 매매 복기·시장환경 분석 | BVT Replay" },
      { name: "description", content: "거래내역 CSV와 당시 거래대금·산업·시장 흐름을 연결해 반복되는 수익·손실 환경을 확인하세요." },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/replay/" }],
  }),
  component: ReplayPage,
});

type Stage = "upload" | "ocr" | "mapping" | "review" | "loading" | "result";

function ReplayPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [tradeErrors, setTradeErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [trades, setTrades] = useState<CompletedTrade[]>([]);
  const [openingShortfalls, setOpeningShortfalls] = useState<Record<string, number>>({});
  const [openPositions, setOpenPositions] = useState<OpenPosition[]>([]);
  const [tickerDebug, setTickerDebug] = useState<ReplayTickerDebug[]>([]);
  const [tradeLimit, setTradeLimit] = useState<"10" | "20" | "50" | "100" | "all">("50");
  const [datePreset, setDatePreset] = useState<"all" | "30" | "90" | "180" | "custom">("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [executionsCount, setExecutionsCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [inspection, setInspection] = useState<BrokerInspection | null>(null);
  const [importResult, setImportResult] = useState<BrokerImportResult | null>(null);
  const [coverage, setCoverage] = useState<{ first: string | null; last: string | null }>({ first: null, last: null });
  const [ocrText, setOcrText] = useState("");
  const [ocrFileName, setOcrFileName] = useState("");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrRunning, setOcrRunning] = useState(false);

  const reset = () => {
    setStage("upload"); setFileName(""); setParseErrors([]); setTradeErrors([]); setWarnings([]); setTrades([]); setOpeningShortfalls({}); setOpenPositions([]); setTickerDebug([]); setExecutionsCount(0); setUploadError(""); setInspection(null); setImportResult(null); setOcrText(""); setOcrFileName(""); setOcrProgress(0); setOcrRunning(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const processCsv = (text: string, name: string) => {
    setInspection(null); setImportResult(null);
    setFileName(name);
    const parsed = parseReplayCsv(text);
    const combined = combineReplayTrades(parsed.executions);
    setOpeningShortfalls(combined.openingShortfalls);
    setOpenPositions(combined.openPositions);
    setTickerDebug(combined.tickerDebug);
    setExecutionsCount(parsed.executions.length);
    setParseErrors(parsed.errors);
    setTradeErrors(combined.errors);
    setWarnings(combined.warnings);
    setTrades(combined.trades);
    setStage("review");
  };

  const processInspection = (source: BrokerInspection, mapping = source.mapping, numericSide: "1-buy" | "1-sell" | null = null) => {
    const imported = normalizeBrokerRows(source, mapping, numericSide);
    const combined = combineReplayTrades(imported.executions);
    setOpeningShortfalls(combined.openingShortfalls);
    setOpenPositions(combined.openPositions);
    setTickerDebug(combined.tickerDebug);
    setInspection({ ...source, mapping });
    setImportResult(imported);
    setFileName(source.fileName);
    setExecutionsCount(imported.executions.length);
    setParseErrors(imported.errors);
    setTradeErrors(combined.errors);
    setWarnings([...imported.warnings, ...combined.warnings]);
    setTrades(combined.trades);
    setStage("review");
  };

  const selectedTrades = useMemo(() => selectCompletedTrades(trades, { limit: tradeLimit === "all" ? null : Number(tradeLimit), days: datePreset === "all" || datePreset === "custom" ? null : Number(datePreset), customFrom: datePreset === "custom" ? customFrom || undefined : undefined, customTo: datePreset === "custom" ? customTo || undefined : undefined }), [trades, tradeLimit, datePreset, customFrom, customTo]);

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (["png", "jpg", "jpeg", "webp"].includes(extension ?? "")) {
        setOcrFileName(file.name);
        setOcrText("");
        setOcrProgress(0);
        setOcrRunning(true);
        setStage("ocr");
        try {
          const text = await (await import("@/lib/image-trade-import")).recognizeTradeImage(file, (progress) => setOcrProgress(progress));
          setOcrText(text);
        } finally {
          setOcrRunning(false);
        }
        return;
      }
      const inspected = extension === "pdf"
        ? await (await import("@/lib/pdf-trade-import")).inspectPdfTradeFile(file)
        : await inspectBrokerFile(file);
      setInspection(inspected);
      setFileName(file.name);
      if (inspected.automatic) processInspection(inspected);
      else setStage("mapping");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    }
  };

  const onPaste = (text: string, name = "붙여넣은 거래내역") => {
    setUploadError("");
    try {
      const inspected = inspectBrokerText(text, name);
      setInspection(inspected);
      setFileName(inspected.fileName);
      if (inspected.automatic) processInspection(inspected);
      else setStage("mapping");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "붙여넣은 거래내역을 읽지 못했습니다.");
    }
  };

  const loadSample = async () => {
    setUploadError("");
    try {
      const response = await fetch("/replay_data/bvt-sample-trades.csv", { cache: "no-store" });
      if (!response.ok) throw new Error();
      processCsv(await response.text(), "BVT 샘플 거래.csv");
    } catch {
      setUploadError("샘플 파일을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

  const analyze = async () => {
    setStage("loading");
    try {
      const manifestResponse = await fetch("/replay_data/manifest.json", { cache: "no-store" });
      if (!manifestResponse.ok) throw new Error("Replay 데이터 범위를 불러오지 못했습니다.");
      const manifest = await manifestResponse.json() as { dates: string[]; first_date: string | null; last_date: string | null };
      setCoverage({ first: manifest.first_date, last: manifest.last_date });
      const selected = new Map<string, string | null>();
      for (const trade of selectedTrades) {
        const date = [...manifest.dates].reverse().find((value) => value <= trade.entryDate) ?? null;
        selected.set(trade.entryDate, date);
      }
      const snapshotDates = [...new Set([...selected.values()].filter((value): value is string => Boolean(value)))];
      const snapshots = new Map<string, ReplaySnapshot>();
      await Promise.all(snapshotDates.map(async (date) => {
        const response = await fetch(`/replay_data/snapshots/${date}.json`, { cache: "no-store" });
        if (response.ok) snapshots.set(date, await response.json() as ReplaySnapshot);
      }));
      setTrades(selectedTrades.map((trade) => {
        const date = selected.get(trade.entryDate);
        const snapshot = date ? snapshots.get(date) : undefined;
        if (!snapshot) return { ...trade, contextStatus: "보관 범위 이전", context: undefined };
        return addContext(trade, snapshot, date === trade.entryDate ? "정상" : `직전 거래일 ${date}`);
      }));
      setStage("result");
    } catch (error) {
      setTradeErrors([error instanceof Error ? error.message : "분석 데이터를 불러오지 못했습니다."]);
      setStage("review");
    }
  };

  return (
    <PageShell>
      <div className="mx-auto max-w-6xl">
        <PageHeading title="BVT Replay" description="내 매매와 당시 거래대금·산업·시장 흐름을 연결해 반복되는 투자 환경을 복기합니다." showDataStatus={false} />
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/20 bg-success/5 px-4 py-3 text-xs">
          <span className="inline-flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-success" />원본 파일과 붙여넣은 내용은 서버로 전송되지 않고 이 브라우저에서만 처리됩니다.</span>
          {stage !== "upload" && <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1.5 h-4 w-4" />처음부터</Button>}
        </div>

        {stage === "upload" && <UploadPanel inputRef={inputRef} onFile={onFile} onPaste={onPaste} onSample={loadSample} error={uploadError} />}
        {stage === "ocr" && <OcrReviewPanel fileName={ocrFileName} text={ocrText} progress={ocrProgress} running={ocrRunning} error={uploadError} onText={setOcrText} onApply={() => onPaste(ocrText, `${ocrFileName} OCR`)} />}
        {stage === "mapping" && inspection && <MappingPanel inspection={inspection} onApply={(mapping, numericSide) => processInspection(inspection, mapping, numericSide)} />}
        {stage === "review" && <ReviewPanel fileName={fileName} executions={executionsCount} trades={trades} selectedTrades={selectedTrades} tradeLimit={tradeLimit} datePreset={datePreset} customFrom={customFrom} customTo={customTo} parseErrors={parseErrors} tradeErrors={tradeErrors} warnings={warnings} openingShortfalls={openingShortfalls} openPositions={openPositions} tickerDebug={tickerDebug} inspection={inspection} importResult={importResult} onTradeLimit={setTradeLimit} onDatePreset={setDatePreset} onCustomFrom={setCustomFrom} onCustomTo={setCustomTo} onAnalyze={analyze} />}
        {stage === "loading" && <LoadingPanel />}
        {stage === "result" && <ResultPanel trades={trades} warnings={warnings} coverage={coverage} />}
      </div>
    </PageShell>
  );
}

function UploadPanel({ inputRef, onFile, onPaste, onSample, error }: { inputRef: RefObject<HTMLInputElement | null>; onFile: (file?: File) => void; onPaste: (text: string) => void; onSample: () => void; error: string }) {
  const [dragging, setDragging] = useState(false);
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pastedText, setPastedText] = useState("");
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
    <Card><CardContent className="p-5 sm:p-7">
      <div className="mb-5"><div className="text-xs font-semibold text-brand">TRADE IMPORT</div><h2 className="mt-1 text-xl font-bold">증권사 거래내역 가져오기</h2><p className="mt-1 text-sm text-muted-foreground">파일을 올리거나 HTS·MTS의 거래 표를 그대로 붙여넣으세요.</p></div>
      <div className="mb-4 inline-flex rounded-md border border-border bg-surface-2 p-1">
        <Button size="sm" variant={inputMode === "file" ? "default" : "ghost"} onClick={() => setInputMode("file")}><Upload className="mr-1.5 h-4 w-4" />파일 업로드</Button>
        <Button size="sm" variant={inputMode === "paste" ? "default" : "ghost"} onClick={() => setInputMode("paste")}><ClipboardPaste className="mr-1.5 h-4 w-4" />표 붙여넣기</Button>
      </div>
      {inputMode === "file" ? <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); }} className={cn("grid min-h-56 place-items-center rounded-lg border border-dashed p-6 text-center transition-colors", dragging ? "border-brand bg-brand/5" : "border-border bg-surface-2/50")}>
        <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-brand/10 text-brand"><Upload className="h-6 w-6" /></div><div className="mt-4 font-semibold">거래내역 파일을 끌어놓거나 선택하세요</div><div className="mt-1 text-xs text-muted-foreground">CSV, Excel, PDF, PNG, JPG, WEBP</div><Button className="mt-4" onClick={() => inputRef.current?.click()}>파일 선택</Button><input ref={inputRef} className="hidden" type="file" accept=".csv,.xlsx,.xls,.pdf,.png,.jpg,.jpeg,.webp,text/csv,application/pdf,image/png,image/jpeg,image/webp,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => onFile(event.target.files?.[0])} /></div>
      </div> : <div className="rounded-lg border border-border bg-surface-2/50 p-4">
        <label className="text-sm font-semibold" htmlFor="trade-paste">거래내역 표 붙여넣기</label>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">열 제목을 포함해 복사하세요. 티커·거래일·매수/매도·수량·가격 열을 자동으로 찾습니다.</p>
        <textarea id="trade-paste" className="mt-3 min-h-48 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs outline-none focus:border-brand" placeholder={"종목코드\t거래일\t매매구분\t체결수량\t체결단가\nAAPL\t2026-07-01\t매수\t10\t200.00"} value={pastedText} onChange={(event) => setPastedText(event.target.value)} />
        <div className="mt-3 flex justify-end"><Button disabled={!pastedText.trim()} onClick={() => onPaste(pastedText)}>붙여넣은 표 확인</Button></div>
      </div>}
    </CardContent></Card>
    <div className="space-y-4">
      <Card><CardContent className="p-5"><FileSpreadsheet className="h-5 w-5 text-brand" /><h2 className="mt-3 font-semibold">처음 사용한다면</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">표준 양식에 티커, 거래일, 매수·매도, 수량, 가격, 수수료를 입력하세요.</p><div className="mt-4 grid gap-2"><Button asChild variant="outline" className="w-full"><a href="/replay_data/bvt-standard-trades.csv" download><Download className="mr-2 h-4 w-4" />표준 CSV 받기</a></Button><Button variant="ghost" className="w-full" onClick={onSample}>샘플로 체험하기</Button></div>{error && <p className="mt-3 text-xs leading-5 text-danger">{error}</p>}</CardContent></Card>
      <Card><CardContent className="p-5 text-sm"><h2 className="font-semibold">현재 지원 범위</h2><ul className="mt-3 space-y-2 text-muted-foreground"><li>CSV·XLSX·XLS·텍스트형 PDF</li><li>PNG·JPG·WEBP 스크린샷 OCR</li><li>HTS·MTS 거래 표 붙여넣기</li><li>신한투자증권 자동 감지</li><li>그 외 형식 자동 추정·직접 연결</li><li>미국주식 · USD · 최근 완결 거래 선택 분석</li></ul><p className="mt-4 text-xs leading-5 text-muted-foreground">스크린샷 인식 결과는 날짜·수량·가격을 확인한 뒤 사용합니다.</p></CardContent></Card>
    </div>
  </div>;
}

function OcrReviewPanel({ fileName, text, progress, running, error, onText, onApply }: { fileName: string; text: string; progress: number; running: boolean; error: string; onText: (value: string) => void; onApply: () => void }) {
  return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">스크린샷 거래내역 확인</h2><p className="mt-1 text-sm text-muted-foreground">{fileName} · 인식된 날짜·수량·가격을 확인하고 잘못된 부분을 수정해주세요.</p></div><CardContent className="p-5">
    {running ? <div className="grid min-h-64 place-items-center text-center"><div><div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-brand border-t-transparent" /><div className="mt-4 font-semibold">스크린샷에서 거래내역을 읽고 있습니다</div><div className="mt-2 text-sm text-muted-foreground">{Math.round(progress * 100)}%</div><div className="mx-auto mt-3 h-2 w-64 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-brand transition-all" style={{ width: `${Math.max(2, progress * 100)}%` }} /></div></div></div> : <>
      <div className="rounded-md border border-warning/30 bg-warning/5 px-4 py-3 text-xs leading-5 text-warning">OCR은 숫자를 잘못 읽을 수 있습니다. 열 제목과 티커·거래일·매수/매도·수량·가격을 반드시 확인하세요.</div>
      <textarea className="mt-4 min-h-80 w-full resize-y rounded-md border border-border bg-background p-3 font-mono text-xs outline-none focus:border-brand" value={text} onChange={(event) => onText(event.target.value)} />
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      <div className="mt-4 flex justify-end"><Button disabled={!text.trim()} onClick={onApply}>확인한 내용으로 열 연결</Button></div>
    </>}
  </CardContent></Card>;
}

function MappingPanel({ inspection, onApply }: { inspection: BrokerInspection; onApply: (mapping: ColumnMapping, numericSide: "1-buy" | "1-sell" | null) => void }) {
  const [mapping, setMapping] = useState<ColumnMapping>(inspection.mapping);
  const [numericSide, setNumericSide] = useState<"1-buy" | "1-sell" | null>(null);
  const fields = Object.keys(importFieldLabels) as ImportField[];
  const required = new Set<ImportField>(["ticker", "transactionDate", "transactionType", "quantity", "price"]);
  const ready = [...required].every((field) => mapping[field] !== null);
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
    <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">거래내역 열 연결</h2><p className="mt-1 text-sm text-muted-foreground">자동 인식이 부족한 항목만 확인해주세요. 추정한 열은 미리 선택했습니다.</p></div><CardContent className="grid gap-4 p-5 sm:grid-cols-2">
      {fields.map((field) => <label key={field} className="grid gap-1.5 text-sm"><span className="font-medium">{importFieldLabels[field]} {required.has(field) && <span className="text-danger">*</span>}</span><select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={mapping[field] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field]: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">{field === "fee" ? "없음 (0원)" : field === "currency" ? "없음 (USD)" : "열 선택"}</option>{inspection.headers.map((header, index) => <option key={`${header}-${index}`} value={index}>{header || `열 ${index + 1}`}</option>)}</select></label>)}
      {inspection.numericSideValues && <label className="grid gap-1.5 text-sm sm:col-span-2"><span className="font-medium">숫자 매매구분 코드 <span className="text-danger">*</span></span><select className="h-10 rounded-md border border-border bg-background px-3 text-sm" value={numericSide ?? ""} onChange={(event) => setNumericSide(event.target.value as "1-buy" | "1-sell")}><option value="">코드 의미 선택</option><option value="1-buy">1 = 매수 · 2 = 매도</option><option value="1-sell">1 = 매도 · 2 = 매수</option></select></label>}
      <div className="sm:col-span-2 flex justify-end pt-2"><Button disabled={!ready || (inspection.numericSideValues && !numericSide)} onClick={() => onApply(mapping, numericSide)}>이 연결로 거래 확인</Button></div>
    </CardContent></Card>
    <Card><CardContent className="p-5 text-sm"><h2 className="font-semibold">감지 결과</h2><dl className="mt-4 space-y-3 text-muted-foreground"><div><dt className="text-xs">파일</dt><dd className="mt-0.5 break-all text-foreground">{inspection.fileName}</dd></div><div><dt className="text-xs">선택된 시트</dt><dd className="mt-0.5 text-foreground">{inspection.selectedSheet}</dd></div><div><dt className="text-xs">헤더 위치</dt><dd className="mt-0.5 text-foreground">{inspection.headerRow}행</dd></div><div><dt className="text-xs">감지 형식</dt><dd className="mt-0.5 text-foreground">{inspection.detectedBroker}</dd></div></dl><p className="mt-5 text-xs leading-5 text-muted-foreground">계좌번호·고객명 등 개인정보 열은 값이 제거되며 저장되지 않습니다.</p></CardContent></Card>
  </div>;
}

function ReviewPanel({ fileName, executions, trades, selectedTrades, tradeLimit, datePreset, customFrom, customTo, parseErrors, tradeErrors, warnings, openingShortfalls, openPositions, tickerDebug, inspection, importResult, onTradeLimit, onDatePreset, onCustomFrom, onCustomTo, onAnalyze }: { fileName: string; executions: number; trades: CompletedTrade[]; selectedTrades: CompletedTrade[]; tradeLimit: "10" | "20" | "50" | "100" | "all"; datePreset: "all" | "30" | "90" | "180" | "custom"; customFrom: string; customTo: string; parseErrors: string[]; tradeErrors: string[]; warnings: string[]; openingShortfalls: Record<string, number>; openPositions: OpenPosition[]; tickerDebug: ReplayTickerDebug[]; inspection: BrokerInspection | null; importResult: BrokerImportResult | null; onTradeLimit: (value: "10" | "20" | "50" | "100" | "all") => void; onDatePreset: (value: "all" | "30" | "90" | "180" | "custom") => void; onCustomFrom: (value: string) => void; onCustomTo: (value: string) => void; onAnalyze: () => void }) {
  const errors = [...parseErrors, ...tradeErrors];
  const displayWarnings = warnings.filter((message) => !message.includes("미청산 수량"));
  const excluded = [...openPositions, ...Object.entries(openingShortfalls).map(([ticker, quantity]) => ({ ticker, quantity }))].sort((a, b) => a.ticker.localeCompare(b.ticker));
  const usedExecutions = selectedTrades.reduce((sum, trade) => sum + trade.buyCount + trade.sellCount, 0);
  const firstExit = selectedTrades.at(-1)?.exitDate ?? "-";
  const lastExit = selectedTrades[0]?.exitDate ?? "-";
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-4"><Metric label="파일" value={fileName} /><Metric label="인식된 체결" value={`${executions}건`} /><Metric label="전체 완결 거래" value={`${trades.length}건`} /><Metric label="파서 버전" value={REPLAY_PARSER_VERSION} /></section>
    {inspection && importResult && <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">업로드 인식 결과</h2><p className="mt-1 text-xs text-muted-foreground">분석 전에 파일 인식 결과와 제외 항목을 확인해주세요.</p></div><CardContent className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><ImportInfo label="감지된 증권사" value={`${inspection.detectedBroker} · ${inspection.confidence}`} /><ImportInfo label="시트·헤더" value={`${inspection.selectedSheet} · ${inspection.headerRow}행`} /><ImportInfo label="전체 데이터 행" value={`${importResult.totalRows}건`} /><ImportInfo label="제외된 행" value={`${Object.values(importResult.excluded).reduce((sum, count) => sum + count, 0)}건`} /><ImportInfo label="거래 기간" value={importResult.period.first ? `${importResult.period.first} ~ ${importResult.period.last}` : "-"} /><ImportInfo label="통화" value={importResult.currencies.join(", ") || "USD(기본값)"} /><div className="sm:col-span-2"><div className="text-xs text-muted-foreground">제외 사유</div><div className="mt-1 text-foreground">{Object.entries(importResult.excluded).map(([reason, count]) => `${reason} ${count}건`).join(" · ") || "없음"}</div></div></CardContent></Card>}
    <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">분석 범위</h2><p className="mt-1 text-xs text-muted-foreground">완결 거래를 만든 뒤 최종 매도일 기준으로 선택합니다.</p></div><CardContent className="grid gap-5 p-5 lg:grid-cols-2"><div><div className="mb-2 text-xs font-medium text-muted-foreground">최근 완결 거래</div><div className="flex flex-wrap gap-2">{(["10", "20", "50", "100", "all"] as const).map((value) => <Button key={value} size="sm" variant={tradeLimit === value ? "default" : "outline"} onClick={() => onTradeLimit(value)}>{value === "all" ? "전체" : `${value}건`}</Button>)}</div></div><div><div className="mb-2 text-xs font-medium text-muted-foreground">최종 매도일</div><div className="flex flex-wrap gap-2">{(["all", "30", "90", "180", "custom"] as const).map((value) => <Button key={value} size="sm" variant={datePreset === value ? "default" : "outline"} onClick={() => onDatePreset(value)}>{value === "all" ? "전체 기간" : value === "custom" ? "직접 선택" : `최근 ${value}일`}</Button>)}</div>{datePreset === "custom" && <div className="mt-3 flex gap-2"><input type="date" className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={customFrom} onChange={(event) => onCustomFrom(event.target.value)} /><span className="self-center text-muted-foreground">~</span><input type="date" className="h-9 rounded-md border border-border bg-background px-3 text-sm" value={customTo} onChange={(event) => onCustomTo(event.target.value)} /></div>}</div></CardContent></Card>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"><Metric label="분석 대상" value={`${selectedTrades.length}건`} /><Metric label="최종 매도 기간" value={`${firstExit} ~ ${lastExit}`} /><Metric label="전체 체결" value={`${executions}건`} /><Metric label="사용된 체결" value={`${usedExecutions}건`} /><Metric label="제외 종목" value={`${excluded.length}개`} /></section>
    {excluded.length > 0 && <details className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-warning">현재 보유 또는 완결 거래를 만들 수 없는 {excluded.length}개 종목은 분석에서 제외되었습니다. 목록 보기</summary><div className="mt-3 flex flex-wrap gap-2">{excluded.map((row) => <span key={row.ticker} className="rounded-md border border-warning/20 bg-background px-2.5 py-1 text-xs"><strong>{row.ticker}</strong> · {row.quantity.toLocaleString("ko-KR")}주</span>)}</div></details>}
    <details><summary className="cursor-pointer text-xs text-muted-foreground">종목별 수량 검증 보기</summary><div className="mt-3"><TickerDebugTable rows={tickerDebug} /></div></details>
    {(errors.length > 0 || displayWarnings.length > 0) && <Card><CardContent className="p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5 text-warning" />확인할 항목</h2><ul className="mt-3 space-y-2 text-sm">{errors.map((message) => <li key={message} className="text-danger">{message}</li>)}{displayWarnings.map((message) => <li key={message} className="text-warning">{message}</li>)}</ul></CardContent></Card>}
    <Card><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">최근 완결 거래 미리보기</h2><p className="text-xs text-muted-foreground">선택한 범위 중 최신 20건을 표시합니다.</p></div><CheckCircle2 className="h-5 w-5 text-success" /></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{["종목", "최초 매수", "최종 매도", "평균 매수가", "평균 매도가", "수익률", "보유 기간"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{selectedTrades.slice(0, 20).map((trade, index) => <tr key={`${trade.ticker}-${trade.entryDate}-${index}`}><td className="px-4 py-3 font-semibold">{trade.ticker}</td><td className="px-4 py-3 text-right tabular">{trade.entryDate}</td><td className="px-4 py-3 text-right tabular">{trade.exitDate}</td><td className="px-4 py-3 text-right tabular">${trade.averageEntryPrice.toFixed(2)}</td><td className="px-4 py-3 text-right tabular">${trade.averageExitPrice.toFixed(2)}</td><td className={cn("px-4 py-3 text-right font-semibold tabular", trade.returnPercent >= 0 ? "text-success" : "text-danger")}>{trade.returnPercent >= 0 ? "+" : ""}{trade.returnPercent.toFixed(2)}%</td><td className="px-4 py-3 text-right tabular">{trade.holdingDays}일</td></tr>)}</tbody></table></div></Card>
    {selectedTrades.length > 0 && selectedTrades.length < 5 && <p className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">분석 가능한 완결 거래가 {selectedTrades.length}건입니다. 정확한 패턴 분석을 위해 더 긴 기간의 거래내역을 업로드해주세요.</p>}
    <div className="flex justify-end"><Button size="lg" disabled={Boolean(errors.length) || !selectedTrades.length} onClick={onAnalyze}>선택한 완결 거래 분석하기</Button></div>
  </div>;
}

function TickerDebugTable({ rows }: { rows: ReplayTickerDebug[] }) {
  return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">종목별 수량 검증</h2><p className="mt-1 text-xs text-muted-foreground">파서 {REPLAY_PARSER_VERSION} · 가격과 개인정보는 표시하지 않습니다.</p></div><div className="max-h-80 overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground"><tr>{["종목", "총매수", "총매도", "최소 누적수량", "초기 보유 필요", "최종 잔여"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.ticker}><td className="px-4 py-3 font-semibold">{row.ticker}</td><td className="px-4 py-3 text-right tabular">{row.totalBuy.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right tabular">{row.totalSell.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right tabular">{row.minimumRunningQuantity.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right tabular">{row.requiredInitialQuantity.toLocaleString("ko-KR")}</td><td className={cn("px-4 py-3 text-right font-semibold tabular", row.finalRemaining > 0 ? "text-warning" : "text-muted-foreground")}>{row.finalRemaining.toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div></Card>;
}

function ImportInfo({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium text-foreground">{value}</div></div>; }

function LoadingPanel() { return <Card><CardContent className="grid min-h-72 place-items-center text-center"><div><div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-brand border-t-transparent" /><h2 className="mt-4 font-semibold">매수 당시 시장환경을 연결하고 있습니다</h2><p className="mt-1 text-sm text-muted-foreground">종목·산업·시장 상태를 날짜별로 확인합니다.</p></div></CardContent></Card>; }

function ResultPanel({ trades, warnings, coverage }: { trades: CompletedTrade[]; warnings: string[]; coverage: { first: string | null; last: string | null } }) {
  const analytics = useMemo(() => analyzeReplayPerformance(trades), [trades]);
  const worstTicker = analytics.tickerRows.filter((row) => row.trades >= 2).sort((a, b) => a.totalProfit - b.totalProfit)[0];
  const simulations = useMemo(() => [
    { label: "전체 성과", rows: trades },
    { label: "-10% 이하 제외", rows: trades.filter((trade) => trade.returnPercent > -10) },
    { label: "최악 1건 제외", rows: [...trades].sort((a, b) => a.returnPercent - b.returnPercent).slice(1) },
    { label: "최악 3건 제외", rows: [...trades].sort((a, b) => a.returnPercent - b.returnPercent).slice(3) },
    ...(worstTicker?.totalProfit < 0 ? [{ label: `${worstTicker.label} 제외`, rows: trades.filter((trade) => trade.ticker !== worstTicker.label) }] : []),
    { label: "당일 거래 제외", rows: trades.filter((trade) => trade.holdingDays > 0) },
  ].map((item) => ({ label: item.label, analytics: analyzeReplayPerformance(item.rows) })), [trades, worstTicker]);
  const linked = trades.filter((trade) => trade.context && ["FULL", "UNDERLYING_ONLY", "SECTOR_ONLY", "INDEX_ONLY", "PRODUCT_ONLY"].includes(trade.context.supportLevel));
  const fullLinked = trades.filter((trade) => trade.context?.supportLevel === "FULL").length;
  const underlyingLinked = trades.filter((trade) => trade.context?.supportLevel === "UNDERLYING_ONLY").length;
  const groupLinked = trades.filter((trade) => trade.context?.supportLevel === "SECTOR_ONLY" || trade.context?.supportLevel === "INDEX_ONLY").length;
  const productOnly = trades.filter((trade) => trade.context?.supportLevel === "PRODUCT_ONLY").length;
  const mappingRequired = trades.filter((trade) => trade.context?.supportLevel === "MAPPING_REQUIRED").length;
  const historicalMissing = trades.filter((trade) => trade.context?.supportLevel === "HISTORICAL_DATA_MISSING" || trade.context?.supportLevel === "UNSUPPORTED").length;
  const connectionRate = trades.length ? linked.length / trades.length * 100 : 0;
  const patterns = useMemo(() => patternRows(linked), [linked]);
  const linkedAverage = linked.length ? linked.reduce((sum, trade) => sum + trade.returnPercent, 0) / linked.length : 0;
  const excludedPatterns = patterns.filter((row) => row.trades < 10).length;
  const profitable = patterns.filter((row) => row.trades >= 10 && row.averageReturn > 0).sort((a, b) => b.averageReturn - a.averageReturn).slice(0, 5);
  const losing = patterns.filter((row) => row.trades >= 10 && row.averageReturn < 0).sort((a, b) => a.averageReturn - b.averageReturn).slice(0, 5);
  const unlinked = trades.filter((trade) => !linked.includes(trade));
  return <div className="space-y-5">
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric label="총 거래" value={`${analytics.totalTrades}건`} /><Metric label="승률" value={`${analytics.winRate.toFixed(1)}%`} /><Metric label="거래당 평균 수익률" value={`${analytics.averageReturn >= 0 ? "+" : ""}${analytics.averageReturn.toFixed(2)}%`} tone={analytics.averageReturn >= 0 ? "positive" : "negative"} /><Metric label="손익비" value={formatPayoffRatio(analytics.payoffRatio, analytics.winningTrades, analytics.losingTrades)} /><Metric label="최대 단일 손실" value={`${analytics.maximumSingleLoss.toFixed(2)}% · ${fmtUsd(analytics.maximumSingleLossAmount)}`} tone="negative" /><Metric label="최대 낙폭" value={`${fmtUsd(analytics.maximumDrawdown)} · 누적 실현손익`} tone="negative" /></section>
    <Card className="border-brand/20 bg-brand/[0.04]"><CardContent className="p-5"><div className="text-xs font-semibold text-brand">핵심 진단</div><div className="mt-3 space-y-2">{analytics.diagnostics.slice(0, 3).map((line) => <p key={line} className="text-sm font-medium leading-6">{line}</p>)}</div></CardContent></Card>
    <Tabs defaultValue="performance" className="space-y-5">
      <TabsList className="h-auto max-w-full justify-start overflow-x-auto"><TabsTrigger value="performance">내 거래 성과</TabsTrigger><TabsTrigger value="ticker">종목별 분석</TabsTrigger><TabsTrigger value="habit">매매 습관</TabsTrigger><TabsTrigger value="market">시장환경 참고</TabsTrigger><TabsTrigger value="unlinked">미연결 거래 {unlinked.length}</TabsTrigger></TabsList>
      <TabsContent value="performance" className="space-y-5">
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6"><Metric label="총 손익" value={fmtUsd(analytics.totalProfit)} tone={analytics.totalProfit >= 0 ? "positive" : "negative"} /><Metric label="평균 이익" value={analytics.winningTrades ? `+${analytics.averageWin.toFixed(2)}%` : "—"} tone={analytics.winningTrades ? "positive" : undefined} /><Metric label="평균 손실" value={analytics.losingTrades ? `${analytics.averageLoss.toFixed(2)}%` : "—"} tone={analytics.losingTrades ? "negative" : undefined} /><Metric label="거래당 기대손익" value={fmtUsd(analytics.expectedProfit)} tone={analytics.expectedProfit >= 0 ? "positive" : "negative"} /><Metric label="최대 연속 손실" value={`${analytics.maximumLossStreak}건`} /><Metric label={analytics.winningTrades > 5 ? "총 이익 중 상위 5개 비중" : "수익 거래"} value={analytics.winningTrades > 5 ? `${analytics.topFiveProfitShare.toFixed(0)}%` : `${analytics.winningTrades}건`} /></section>
        <div className="grid gap-5 lg:grid-cols-2"><EquityCurve data={analytics.equityCurve} /><DistributionChart data={analytics.distribution} /></div>
        <SimulationPanel rows={simulations} />
      </TabsContent>
      <TabsContent value="ticker" className="space-y-5"><TickerProfitChart rows={analytics.tickerRows} /><PerformanceTable title="종목별 성과" rows={analytics.tickerRows} showHolding /></TabsContent>
      <TabsContent value="habit" className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><PerformanceTable title="보유기간별 성과" rows={analytics.holdingRows} /><PerformanceTable title="매도 요일별 성과" rows={analytics.weekdayRows} /></div></TabsContent>
      <TabsContent value="market" className="space-y-5">
        <div className="rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm"><strong>{linked.length === trades.length ? `${trades.length}건 모두 시장환경과 연결되어 참고용으로 제공합니다.` : `${trades.length}건 중 ${linked.length}건이 시장환경과 연결되어 참고용으로 제공됩니다.`}</strong><div className="mt-1 text-xs text-muted-foreground">시장환경 지원 범위: {coverage.first ?? "-"}~{coverage.last ?? "-"}</div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"><Metric label="연결률" value={`${connectionRate.toFixed(0)}%`} /><Metric label="전체 연결" value={`${fullLinked}건`} /><Metric label="기초자산 연결" value={`${underlyingLinked}건`} /><Metric label="섹터·지수 연결" value={`${groupLinked}건`} /><Metric label="상품 데이터만" value={`${productOnly}건`} /><Metric label="매핑 필요" value={`${mappingRequired}건`} /></div>
        {connectionRate < 50 && <p className="rounded-md bg-warning/5 px-3 py-2 text-xs text-warning">연결률이 {connectionRate.toFixed(0)}%로 낮아 시장환경 결과는 탐색적 참고자료입니다.</p>}
        {excludedPatterns > 0 && <p className="text-xs text-muted-foreground">표본 10건 미만 조건 {excludedPatterns}개는 시장환경 카드에서 제외했습니다.</p>}
        <EnvironmentComparisonTable trades={linked} baseline={linkedAverage} />
        <div className="grid gap-5 lg:grid-cols-2"><PatternCard title="연결된 거래에서 관찰된 조건" icon={TrendingUp} rows={profitable} baseline={linkedAverage} positive /><PatternCard title="손실 거래에서 관찰된 조건" icon={TrendingDown} rows={losing} baseline={linkedAverage} /></div>
        <EnvironmentTradeList trades={linked} linked={linked} baseline={linkedAverage} />
      </TabsContent>
      <TabsContent value="unlinked" className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><Metric label="상품 매핑 필요" value={`${mappingRequired}건`} /><Metric label="과거 데이터 부족" value={`${historicalMissing}건`} /><Metric label="미연결 전체" value={`${unlinked.length}건`} /></div><details className="rounded-lg border border-border bg-card"><summary className="cursor-pointer px-5 py-4 text-sm font-semibold">미연결 거래 {unlinked.length}건 보기</summary><div className="border-t border-border"><EnvironmentTradeList trades={unlinked} linked={linked} baseline={analytics.averageReturn} /></div></details></TabsContent>
    </Tabs>
    <PersonalRulePanel trades={trades} analytics={analytics} />
    {warnings.length > 0 && <details className="rounded-lg border border-border px-4 py-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">분석에서 제외된 미청산·확인 거래 안내 보기</summary><div className="mt-3 space-y-1 text-xs text-muted-foreground">{warnings.map((warning) => <p key={warning}>{warning}</p>)}</div></details>}
    <details className="rounded-lg border border-border px-4 py-3"><summary className="cursor-pointer text-xs font-medium text-muted-foreground">계산 기준 보기</summary><ul className="mt-3 grid gap-1 text-xs leading-5 text-muted-foreground sm:grid-cols-2"><li>손익은 체결 수수료를 반영하며 세금·환율은 반영하지 않은 USD 기준입니다.</li><li>평균 수익률은 완결 거래별 수익률의 단순 평균입니다.</li><li>같은 종목은 보유 수량이 0이 되는 시점마다 거래 한 건으로 닫습니다.</li><li>부분 매도 원가는 평균단가 방식으로 배분합니다.</li><li>최대 낙폭은 최종 매도 완료 순서의 누적 실현손익 기준입니다.</li><li>보유기간 0일은 같은 날짜에 매수와 매도를 마친 당일 거래입니다.</li></ul></details>
    <p className="text-xs leading-5 text-muted-foreground">이 결과는 과거 거래 복기용이며 매수·매도 추천이 아닙니다. 레버리지·인버스 상품은 일일 재설정, 복리 효과와 추적 오차가 있어 기초자산 수익률과 동일하지 않습니다.</p>
  </div>;
}

type PersonalRule = {
  id: string;
  title: string;
  text: string;
  kind: "keep" | "loss-limit" | "ticker" | "streak" | "intraday";
  ticker?: string;
  violations: number;
};

function PersonalRulePanel({ trades, analytics }: { trades: CompletedTrade[]; analytics: ReturnType<typeof analyzeReplayPerformance> }) {
  const storageKey = "bvt-replay-personal-rules";
  const generated = useMemo<PersonalRule[]>(() => {
    const worstTicker = analytics.tickerRows.filter((row) => row.trades >= 2).sort((a, b) => a.totalProfit - b.totalProfit)[0];
    const bestHolding = analytics.holdingRows.filter((row) => row.trades >= 3 && row.averageReturn > 0).sort((a, b) => b.averageReturn - a.averageReturn)[0];
    const intraday = trades.filter((trade) => trade.holdingDays === 0);
    const intradayProfit = intraday.reduce((sum, trade) => sum + trade.realizedProfit, 0);
    const rows: PersonalRule[] = [
      {
        id: "loss-limit",
        title: "한 거래 최대 손실",
        text: "한 거래의 손실이 -5%에 도달하면 추가 판단 없이 거래를 종료합니다.",
        kind: "loss-limit",
        violations: trades.filter((trade) => trade.returnPercent <= -5).length,
      },
    ];
    if (analytics.maximumLossStreak >= 3) rows.push({
      id: "loss-streak",
      title: "연속 손실 후 중단",
      text: "3회 연속 손실이 발생하면 해당일의 신규 거래를 중단합니다.",
      kind: "streak",
      violations: Math.max(0, analytics.maximumLossStreak - 2),
    });
    if (worstTicker?.totalProfit < 0) rows.push({
      id: `ticker-${worstTicker.label}`,
      title: `${worstTicker.label} 반복 거래 제한`,
      text: `${worstTicker.label} 재진입 전 이전 손실 원인과 진입 근거를 기록합니다.`,
      kind: "ticker",
      ticker: worstTicker.label,
      violations: trades.filter((trade) => trade.ticker === worstTicker.label).length,
    });
    if (intraday.length >= 3 && intradayProfit < 0) rows.push({
      id: "intraday",
      title: "당일 거래 손실 통제",
      text: "당일 거래에서 손실이 발생하면 같은 날 거래 규모를 늘리지 않습니다.",
      kind: "intraday",
      violations: intraday.filter((trade) => trade.returnPercent < 0).length,
    });
    if (bestHolding) rows.unshift({
      id: "keep-holding",
      title: "계속할 행동",
      text: `${bestHolding.label} 보유 거래는 평균 ${bestHolding.averageReturn >= 0 ? "+" : ""}${bestHolding.averageReturn.toFixed(2)}%로 상대적으로 양호했습니다.`,
      kind: "keep",
      violations: 0,
    });
    return rows;
  }, [analytics, trades]);
  const [rules, setRules] = useState<PersonalRule[]>(generated);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        setRules(generated);
        return;
      }
      const savedRules = JSON.parse(stored) as Array<Pick<PersonalRule, "id" | "text">>;
      setRules(generated.map((rule) => ({ ...rule, text: savedRules.find((savedRule) => savedRule.id === rule.id)?.text ?? rule.text })));
    } catch {
      setRules(generated);
    }
  }, [generated]);

  const saveRules = () => {
    localStorage.setItem(storageKey, JSON.stringify(rules.map(({ id, text }) => ({ id, text }))));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1800);
  };

  return <Card className="border-brand/20">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
      <div><h2 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-5 w-5 text-brand" />개인 매매 규칙</h2><p className="mt-1 text-xs text-muted-foreground">이번 분석에서 반복된 행동을 다음 거래에서 확인할 규칙으로 바꿨습니다.</p></div>
      <Button size="sm" onClick={saveRules}>{saved ? "저장됨" : "규칙 저장"}</Button>
    </div>
    <CardContent className="grid gap-3 p-5 lg:grid-cols-2">
      {rules.map((rule) => <div key={rule.id} className={cn("rounded-lg border p-4", rule.kind === "keep" ? "border-success/25 bg-success/5" : "border-border bg-muted/20")}>
        <div className="flex items-center justify-between gap-3"><span className={cn("text-xs font-semibold", rule.kind === "keep" ? "text-success" : "text-brand")}>{rule.title}</span>{rule.kind !== "keep" && <span className={cn("rounded-full px-2 py-0.5 text-[11px]", rule.violations ? "bg-danger/10 text-danger" : "bg-success/10 text-success")}>이번 분석 {rule.violations}건 해당</span>}</div>
        <textarea aria-label={`${rule.title} 규칙`} value={rule.text} onChange={(event) => setRules((current) => current.map((item) => item.id === rule.id ? { ...item, text: event.target.value } : item))} className="mt-3 min-h-20 w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-6 outline-none focus:border-brand" />
      </div>)}
    </CardContent>
  </Card>;
}

function fmtUsd(value: number) {
  if (Math.abs(value) < 0.005) return "$0.00";
  return `${value > 0 ? "+" : "-"}$${Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPayoffRatio(value: number, wins: number, losses: number) {
  if (!wins) return "수익 없음";
  if (!losses) return "손실 없음";
  return value.toFixed(2);
}

function SimulationPanel({ rows }: { rows: Array<{ label: string; analytics: ReturnType<typeof analyzeReplayPerformance> }> }) { return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">대형 손실 제외 시뮬레이션</h2><p className="text-xs text-muted-foreground">손실 통제가 전체 성과에 미치는 영향을 비교합니다.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{["조건", "거래", "승률", "평균 수익률", "총 손익", "손익비"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map(({ label, analytics }) => <tr key={label}><td className="px-4 py-3 font-semibold">{label}</td><td className="px-4 py-3 text-right">{analytics.totalTrades}건</td><td className="px-4 py-3 text-right">{analytics.winRate.toFixed(1)}%</td><td className={cn("px-4 py-3 text-right", analytics.averageReturn >= 0 ? "text-success" : "text-danger")}>{analytics.averageReturn >= 0 ? "+" : ""}{analytics.averageReturn.toFixed(2)}%</td><td className={cn("px-4 py-3 text-right", analytics.totalProfit >= 0 ? "text-success" : "text-danger")}>{fmtUsd(analytics.totalProfit)}</td><td className="px-4 py-3 text-right">{formatPayoffRatio(analytics.payoffRatio, analytics.winningTrades, analytics.losingTrades)}</td></tr>)}</tbody></table></div></Card>; }

function TickerProfitChart({ rows }: { rows: PerformanceRow[] }) { const data = [...rows].sort((a, b) => a.totalProfit - b.totalProfit); const selected = [...data.slice(0, 5), ...data.slice(-5)].filter((row, index, all) => all.findIndex((item) => item.label === row.label) === index).sort((a, b) => a.totalProfit - b.totalProfit); return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">종목별 손익 기여</h2><p className="text-xs text-muted-foreground">손실 상위 5개와 수익 상위 5개</p></div><CardContent className="h-80 p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={selected} layout="vertical" margin={{ top: 4, right: 18, bottom: 4, left: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" tickFormatter={(value) => fmtUsd(Number(value)).replace("+", "")} tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="label" width={55} tick={{ fontSize: 11 }} /><ReferenceLine x={0} stroke="currentColor" strokeOpacity={0.4} /><ChartTooltip formatter={(value) => [fmtUsd(Number(value)), "총 실현손익"]} /><Bar dataKey="totalProfit" fill="var(--color-brand, #2563eb)" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>; }

function EquityCurve({ data }: { data: Array<{ order: number; ticker: string; profit: number }> }) { return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">거래 순서별 누적 손익</h2><p className="text-xs text-muted-foreground">실현 손익 기준</p></div><CardContent className="h-72 p-4"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="order" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} width={55} tickFormatter={(value) => `$${value}`} /><ReferenceLine y={0} stroke="currentColor" strokeOpacity={0.35} /><ChartTooltip formatter={(value) => [`$${Number(value).toFixed(0)}`, "누적 손익"]} /><Line type="monotone" dataKey="profit" stroke="var(--color-brand, #2563eb)" strokeWidth={2} dot={false} /></LineChart></ResponsiveContainer></CardContent></Card>; }

function DistributionChart({ data }: { data: Array<{ label: string; count: number }> }) { return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">수익률 분포</h2><p className="text-xs text-muted-foreground">큰 손실과 수익의 꼬리를 확인합니다.</p></div><CardContent className="h-72 p-4"><ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 8, right: 4, bottom: 28, left: -16 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" angle={-25} textAnchor="end" tick={{ fontSize: 10 }} interval={0} /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><ChartTooltip formatter={(value) => [`${value}건`, "거래"]} /><Bar dataKey="count" fill="var(--color-brand, #2563eb)" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></CardContent></Card>; }

function PerformanceTable({ title, rows, showHolding = false }: { title: string; rows: PerformanceRow[]; showHolding?: boolean }) { return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">{title}</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[920px] text-sm"><thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{["구분", "거래 수", "승률", "평균 수익률", "총 손익", "평균 이익", "평균 손실", "손익비", ...(showHolding ? ["평균 보유"] : []), "최대 이익", "최대 손실", "표본"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.label} className={row.trades < 5 ? "opacity-60" : ""}><td className="px-4 py-3 font-semibold">{row.label}</td><td className="px-4 py-3 text-right">{row.trades}건</td><td className="px-4 py-3 text-right">{row.winRate.toFixed(1)}%</td><td className={cn("px-4 py-3 text-right font-semibold", row.averageReturn >= 0 ? "text-success" : "text-danger")}>{row.averageReturn >= 0 ? "+" : ""}{row.averageReturn.toFixed(2)}%</td><td className={cn("px-4 py-3 text-right", row.totalProfit >= 0 ? "text-success" : "text-danger")}>{fmtUsd(row.totalProfit)}</td><td className="px-4 py-3 text-right text-success">{row.wins ? `+${row.averageWin.toFixed(2)}%` : "—"}</td><td className="px-4 py-3 text-right text-danger">{row.losses ? `${row.averageLoss.toFixed(2)}%` : "—"}</td><td className="px-4 py-3 text-right">{formatPayoffRatio(row.payoffRatio, row.wins, row.losses)}</td>{showHolding && <td className="px-4 py-3 text-right">{row.averageHoldingDays.toFixed(1)}일</td>}<td className="px-4 py-3 text-right text-success">{row.wins ? `+${row.maximumGain.toFixed(2)}%` : "—"}</td><td className="px-4 py-3 text-right text-danger">{row.losses ? `${row.maximumLoss.toFixed(2)}%` : "—"}</td><td className="px-4 py-3 text-right text-xs text-muted-foreground">{row.trades < 5 ? "표본 부족" : row.trades < 10 ? "참고" : "분석 가능"}</td></tr>)}</tbody></table></div></Card>; }

function EnvironmentTradeList({ trades, linked, baseline }: { trades: CompletedTrade[]; linked: CompletedTrade[]; baseline: number }) { return <Card><div className="divide-y divide-border">{trades.map((trade, index) => <article key={`${trade.ticker}-${trade.entryDate}-${index}`} className="grid gap-3 px-5 py-5 md:grid-cols-[140px_1fr] md:gap-5"><div><div className="flex items-center gap-2"><span className="font-semibold">{trade.ticker}</span><span className={cn("font-semibold tabular", trade.returnPercent >= 0 ? "text-success" : "text-danger")}>{trade.returnPercent >= 0 ? "+" : ""}{trade.returnPercent.toFixed(2)}%</span></div><div className="mt-1 text-xs text-muted-foreground">{trade.entryDate} 진입</div><div className="mt-2 inline-flex rounded-full bg-secondary px-2 py-1 text-[11px] font-medium">{coverageLabel(trade.context?.supportLevel)}</div></div><div>{trade.context && linked.includes(trade) ? <TradeReviewNarrative trade={trade} baseline={baseline} /> : <p className="text-sm text-muted-foreground">{trade.contextStatus}</p>}</div></article>)}</div></Card>; }

type EnvironmentPerformance = { label: string; trades: number; winRate: number; averageReturn: number; averageLoss: number; payoffRatio: number; difference: number };

function environmentCondition(trade: CompletedTrade) {
  const context = trade.context;
  if (!context) return null;
  const volumeState = context.underlyingTicker?.volume_state ?? (!context.asset ? context.ticker?.volume_state : undefined);
  if (volumeState) {
    const bucket = volumeState.includes("강") ? "강함" : volumeState.includes("약") ? "약함" : "보통";
    return `기초자산 거래대금 ${bucket}`;
  }
  const flow = context.underlyingGroup?.flow_status ?? context.industry?.flow_status ?? context.sector?.flow_status;
  if (flow) {
    const bucket = /(확대|유입|강함)/.test(flow) ? "점유율 확대" : /(축소|이탈|약함)/.test(flow) ? "점유율 축소" : "중립";
    return `산업 흐름 ${bucket}`;
  }
  return context.underlyingIndex ? `지수 ${context.underlyingIndex.change_percent != null && context.underlyingIndex.change_percent >= 0 ? "상승" : "하락"}` : null;
}

function environmentPerformanceRows(trades: CompletedTrade[], baseline: number): EnvironmentPerformance[] {
  const groups = new Map<string, CompletedTrade[]>();
  for (const trade of trades) {
    const label = environmentCondition(trade);
    if (label) groups.set(label, [...(groups.get(label) ?? []), trade]);
  }
  return [...groups].map(([label, rows]) => {
    const wins = rows.filter((trade) => trade.returnPercent > 0);
    const losses = rows.filter((trade) => trade.returnPercent < 0);
    const averageReturn = rows.reduce((sum, trade) => sum + trade.returnPercent, 0) / rows.length;
    const averageWin = wins.length ? wins.reduce((sum, trade) => sum + trade.returnPercent, 0) / wins.length : 0;
    const averageLoss = losses.length ? losses.reduce((sum, trade) => sum + trade.returnPercent, 0) / losses.length : 0;
    return { label, trades: rows.length, winRate: wins.length / rows.length * 100, averageReturn, averageLoss, payoffRatio: losses.length && wins.length ? averageWin / Math.abs(averageLoss) : 0, difference: averageReturn - baseline };
  }).sort((a, b) => b.trades - a.trades || b.averageReturn - a.averageReturn);
}

function EnvironmentComparisonTable({ trades, baseline }: { trades: CompletedTrade[]; baseline: number }) {
  const rows = environmentPerformanceRows(trades, baseline);
  return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">진입 환경별 실제 성과</h2><p className="mt-1 text-xs text-muted-foreground">같은 환경에서 내 거래 결과가 전체 연결 거래 평균보다 나았는지 비교합니다.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{["진입 당시 환경", "거래", "승률", "평균 수익률", "평균 손실", "손익비", "전체 평균 대비"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.label}><td className="px-4 py-3 font-semibold">{row.label}</td><td className="px-4 py-3 text-right">{row.trades}건</td><td className="px-4 py-3 text-right">{row.winRate.toFixed(1)}%</td><td className={cn("px-4 py-3 text-right font-semibold", row.averageReturn >= 0 ? "text-success" : "text-danger")}>{signedPercent(row.averageReturn)}</td><td className="px-4 py-3 text-right text-danger">{row.averageLoss ? `${row.averageLoss.toFixed(2)}%` : "—"}</td><td className="px-4 py-3 text-right">{row.payoffRatio ? row.payoffRatio.toFixed(2) : "—"}</td><td className={cn("px-4 py-3 text-right", row.difference >= 0 ? "text-success" : "text-danger")}>{signedPercent(row.difference, "p")}</td></tr>)}</tbody></table></div></Card>;
}

function signedPercent(value: number, suffix = "") {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%${suffix}`;
}

function TradeReviewNarrative({ trade, baseline }: { trade: CompletedTrade; baseline: number }) {
  const context = trade.context!;
  const asset = context.asset;
  const metric = context.underlyingTicker ?? (!asset ? context.ticker : undefined);
  const ratio = metric?.dollar_volume_ratio_20d;
  const priceDirection = metric?.daily_return == null ? null : metric.daily_return >= 0 ? "상승" : "하락";
  const direction = asset ? `${asset.leverageMultiple > 1 ? `${asset.leverageMultiple}배 ` : ""}${asset.direction === "SHORT" ? "인버스" : "롱"} 상품` : "일반 주식";
  const difference = trade.returnPercent - baseline;
  const subject = asset?.underlyingTicker ?? asset?.theme ?? metric?.name_ko ?? trade.ticker;
  const environment = metric
    ? `${subject} 거래대금은 ${ratio != null ? `20일 평균의 ${ratio.toFixed(1)}배` : metric.volume_state}였고${priceDirection ? `, 기초자산 가격은 ${priceDirection} 중` : ""}이었습니다.`
    : context.underlyingGroup
      ? `${asset?.theme ?? "관련 산업"} 거래대금 흐름은 ${context.underlyingGroup.flow_status}였습니다.`
      : context.underlyingIndex
        ? `${context.underlyingIndex.name}는 ${context.underlyingIndex.change_percent == null ? "변화율 미수집" : signedPercent(context.underlyingIndex.change_percent)} 상태였습니다.`
        : `진입 당시 시장은 ${context.market.market_regime} 구간이었습니다.`;
  const result = `${direction} ${trade.ticker}에 진입해 ${signedPercent(trade.returnPercent)}로 마감했으며, 전체 연결 거래 평균보다 ${Math.abs(difference).toFixed(2)}%p ${difference >= 0 ? "높았습니다" : "낮았습니다"}.`;
  let review = "환경 확인 후 진입했는지와 청산 기준이 일관되었는지 복기해보세요.";
  if (trade.returnPercent < 0 && metric?.volume_state.includes("강")) review = "거래대금 급증 후 추격 진입했는지, 진입 전 손절 기준이 있었는지 점검하세요.";
  else if (trade.returnPercent < 0 && metric?.volume_state.includes("약") && asset?.direction !== "SHORT") review = "기초자산의 시장 관심이 약한 상태에서 롱 방향으로 진입한 근거를 점검하세요.";
  else if (trade.returnPercent > 0 && context.underlyingGroup && /(확대|유입|강함)/.test(context.underlyingGroup.flow_status) && asset?.direction !== "SHORT") review = "산업 흐름과 거래 방향이 일치했습니다. 같은 확인 절차를 반복할 수 있는지 정리해보세요.";
  else if (asset && asset.leverageMultiple > 1 && (!metric || metric.volume_state === "보통")) review = "뚜렷한 거래대금 확대 없이 고배율 상품에 진입한 근거와 보유 시간을 점검하세요.";
  return <div className="space-y-3"><div><div className="text-[11px] font-semibold uppercase tracking-wide text-brand">환경</div><p className="mt-1 text-sm leading-6">{environment}</p></div><div className="rounded-md bg-surface-2 px-3 py-3"><div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">내 결과</div><p className="mt-1 text-sm font-medium leading-6">{result}</p></div><div><div className="text-[11px] font-semibold uppercase tracking-wide text-warning">복기 질문</div><p className="mt-1 text-sm leading-6 text-muted-foreground">{review}</p></div></div>;
}

type Pattern = { label: string; trades: number; winRate: number; averageReturn: number };
function patternRows(trades: CompletedTrade[]): Pattern[] {
  const groups = new Map<string, number[]>();
  for (const trade of trades) {
    const context = trade.context!;
    const labels = [`시장 상태 ${context.market.market_regime}`];
    if (context.ticker) labels.push(`종목 거래대금 ${context.ticker.volume_state}`);
    if (context.asset?.leverageMultiple && context.asset.leverageMultiple > 1) labels.push(`${context.asset.leverageMultiple}배 상품`);
    if (context.underlyingGroup) labels.push(`기초자산 흐름 ${context.underlyingGroup.flow_status}`);
    if (context.industry) labels.push(`산업 흐름 ${context.industry.flow_status}`);
    for (const label of labels) groups.set(label, [...(groups.get(label) ?? []), trade.returnPercent]);
  }
  return [...groups].map(([label, values]) => ({ label, trades: values.length, winRate: values.filter((value) => value > 0).length / values.length * 100, averageReturn: values.reduce((sum, value) => sum + value, 0) / values.length }));
}

function coverageLabel(status?: NonNullable<CompletedTrade["context"]>["supportLevel"]) {
  const labels = { FULL: "전체 환경 연결", UNDERLYING_ONLY: "기초자산 연결", SECTOR_ONLY: "섹터 연결", INDEX_ONLY: "지수 연결", PRODUCT_ONLY: "상품 데이터만", MAPPING_REQUIRED: "상품 매핑 필요", HISTORICAL_DATA_MISSING: "과거 데이터 부족", UNSUPPORTED: "시장환경 미연결" };
  return status ? labels[status] : "시장환경 미연결";
}

function PatternCard({ title, icon: Icon, rows, baseline, positive = false }: { title: string; icon: typeof TrendingUp; rows: Pattern[]; baseline: number; positive?: boolean }) { return <Card><div className="flex items-center gap-2 border-b border-border px-5 py-4"><Icon className={cn("h-5 w-5", positive ? "text-success" : "text-danger")} /><h2 className="font-semibold">{title}</h2></div><CardContent className="p-0">{rows.length ? <div className="divide-y divide-border">{rows.map((row) => { const difference = row.averageReturn - baseline; return <div key={row.label} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-4"><div><div className="text-sm font-medium">{row.label}</div><div className="mt-1 text-xs text-muted-foreground">{row.trades}건 · 승률 {row.winRate.toFixed(1)}% · {confidence(row.trades)}</div><div className="mt-1 text-xs text-muted-foreground">연결 거래 평균 대비 {difference >= 0 ? "+" : ""}{difference.toFixed(2)}%p</div></div><div className={cn("font-semibold tabular", row.averageReturn >= 0 ? "text-success" : "text-danger")}>{row.averageReturn >= 0 ? "+" : ""}{row.averageReturn.toFixed(2)}%</div></div>; })}</div> : <div className="px-5 py-10 text-center text-sm text-muted-foreground">표본 10건 이상인 조건이 아직 없습니다.</div>}</CardContent></Card>; }

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) { return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={cn("mt-1 truncate text-lg font-bold tabular", tone === "positive" && "text-success", tone === "negative" && "text-danger")}>{value}</div></CardContent></Card>; }
