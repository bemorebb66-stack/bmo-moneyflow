import { useMemo, useRef, useState, type RefObject } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, ShieldCheck, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { inspectBrokerFile, importFieldLabels, normalizeBrokerRows, type BrokerImportResult, type BrokerInspection, type ColumnMapping, type ImportField } from "@/lib/broker-import";
import { addContext, combineReplayTrades, confidence, parseReplayCsv, REPLAY_PARSER_VERSION, type CompletedTrade, type OpeningHolding, type ReplayExecution, type ReplaySnapshot, type ReplayTickerDebug } from "@/lib/replay";
import { cn } from "@/lib/utils";

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

type Stage = "upload" | "mapping" | "review" | "loading" | "result";

function ReplayPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [tradeErrors, setTradeErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [trades, setTrades] = useState<CompletedTrade[]>([]);
  const [executions, setExecutions] = useState<ReplayExecution[]>([]);
  const [openingShortfalls, setOpeningShortfalls] = useState<Record<string, number>>({});
  const [tickerDebug, setTickerDebug] = useState<ReplayTickerDebug[]>([]);
  const [executionsCount, setExecutionsCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [inspection, setInspection] = useState<BrokerInspection | null>(null);
  const [importResult, setImportResult] = useState<BrokerImportResult | null>(null);
  const [coverage, setCoverage] = useState<{ first: string | null; last: string | null }>({ first: null, last: null });

  const reset = () => {
    setStage("upload"); setFileName(""); setParseErrors([]); setTradeErrors([]); setWarnings([]); setTrades([]); setExecutions([]); setOpeningShortfalls({}); setTickerDebug([]); setExecutionsCount(0); setUploadError(""); setInspection(null); setImportResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const processCsv = (text: string, name: string) => {
    setInspection(null); setImportResult(null);
    setFileName(name);
    const parsed = parseReplayCsv(text);
    const combined = combineReplayTrades(parsed.executions);
    setExecutions(parsed.executions);
    setOpeningShortfalls(combined.openingShortfalls);
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
    setExecutions(imported.executions);
    setOpeningShortfalls(combined.openingShortfalls);
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

  const applyOpeningHoldings = (holdings: Record<string, OpeningHolding>) => {
    const combined = combineReplayTrades(executions, holdings);
    setTradeErrors(combined.errors);
    setWarnings([...(importResult?.warnings ?? []), ...combined.warnings]);
    setTrades(combined.trades);
    setOpeningShortfalls(combined.openingShortfalls);
    setTickerDebug(combined.tickerDebug);
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setUploadError("");
    try {
      const inspected = await inspectBrokerFile(file);
      setInspection(inspected);
      setFileName(file.name);
      if (inspected.automatic) processInspection(inspected);
      else setStage("mapping");
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
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
      for (const trade of trades) {
        const date = [...manifest.dates].reverse().find((value) => value <= trade.entryDate) ?? null;
        selected.set(trade.entryDate, date);
      }
      const snapshotDates = [...new Set([...selected.values()].filter((value): value is string => Boolean(value)))];
      const snapshots = new Map<string, ReplaySnapshot>();
      await Promise.all(snapshotDates.map(async (date) => {
        const response = await fetch(`/replay_data/snapshots/${date}.json`, { cache: "no-store" });
        if (response.ok) snapshots.set(date, await response.json() as ReplaySnapshot);
      }));
      setTrades(trades.map((trade) => {
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
          <span className="inline-flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-success" />원본 CSV·Excel 파일은 서버로 전송되지 않고 이 브라우저에서만 처리됩니다.</span>
          {stage !== "upload" && <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1.5 h-4 w-4" />처음부터</Button>}
        </div>

        {stage === "upload" && <UploadPanel inputRef={inputRef} onFile={onFile} onSample={loadSample} error={uploadError} />}
        {stage === "mapping" && inspection && <MappingPanel inspection={inspection} onApply={(mapping, numericSide) => processInspection(inspection, mapping, numericSide)} />}
        {stage === "review" && <ReviewPanel fileName={fileName} executions={executionsCount} trades={trades} parseErrors={parseErrors} tradeErrors={tradeErrors} warnings={warnings} openingShortfalls={openingShortfalls} tickerDebug={tickerDebug} inspection={inspection} importResult={importResult} onApplyOpening={applyOpeningHoldings} onAnalyze={analyze} />}
        {stage === "loading" && <LoadingPanel />}
        {stage === "result" && <ResultPanel trades={trades} warnings={warnings} coverage={coverage} />}
      </div>
    </PageShell>
  );
}

function UploadPanel({ inputRef, onFile, onSample, error }: { inputRef: RefObject<HTMLInputElement | null>; onFile: (file?: File) => void; onSample: () => void; error: string }) {
  const [dragging, setDragging] = useState(false);
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,.65fr)]">
    <Card><CardContent className="p-5 sm:p-7">
      <div className="mb-5"><div className="text-xs font-semibold text-brand">TRADE IMPORT</div><h2 className="mt-1 text-xl font-bold">증권사 거래내역 파일 업로드</h2><p className="mt-1 text-sm text-muted-foreground">증권사 HTS에서 받은 CSV 또는 Excel 파일을 그대로 올려주세요.</p></div>
      <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); }} className={cn("grid min-h-56 place-items-center rounded-lg border border-dashed p-6 text-center transition-colors", dragging ? "border-brand bg-brand/5" : "border-border bg-surface-2/50")}>
        <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-brand/10 text-brand"><Upload className="h-6 w-6" /></div><div className="mt-4 font-semibold">거래내역 파일을 끌어놓거나 선택하세요</div><div className="mt-1 text-xs text-muted-foreground">CSV, XLSX, XLS · 최대 500개 인식 체결</div><Button className="mt-4" onClick={() => inputRef.current?.click()}>파일 선택</Button><input ref={inputRef} className="hidden" type="file" accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" onChange={(event) => onFile(event.target.files?.[0])} /></div>
      </div>
    </CardContent></Card>
    <div className="space-y-4">
      <Card><CardContent className="p-5"><FileSpreadsheet className="h-5 w-5 text-brand" /><h2 className="mt-3 font-semibold">처음 사용한다면</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">표준 양식에 티커, 거래일, 매수·매도, 수량, 가격, 수수료를 입력하세요.</p><div className="mt-4 grid gap-2"><Button asChild variant="outline" className="w-full"><a href="/replay_data/bvt-standard-trades.csv" download><Download className="mr-2 h-4 w-4" />표준 CSV 받기</a></Button><Button variant="ghost" className="w-full" onClick={onSample}>샘플로 체험하기</Button></div>{error && <p className="mt-3 text-xs leading-5 text-danger">{error}</p>}</CardContent></Card>
      <Card><CardContent className="p-5 text-sm"><h2 className="font-semibold">현재 지원 범위</h2><ul className="mt-3 space-y-2 text-muted-foreground"><li>CSV·XLSX·XLS</li><li>신한투자증권 자동 감지</li><li>그 외 형식 자동 추정·직접 연결</li><li>미국주식 · USD · 최대 500개 체결</li></ul></CardContent></Card>
    </div>
  </div>;
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

function ReviewPanel({ fileName, executions, trades, parseErrors, tradeErrors, warnings, openingShortfalls, tickerDebug, inspection, importResult, onApplyOpening, onAnalyze }: { fileName: string; executions: number; trades: CompletedTrade[]; parseErrors: string[]; tradeErrors: string[]; warnings: string[]; openingShortfalls: Record<string, number>; tickerDebug: ReplayTickerDebug[]; inspection: BrokerInspection | null; importResult: BrokerImportResult | null; onApplyOpening: (holdings: Record<string, OpeningHolding>) => void; onAnalyze: () => void }) {
  const errors = [...parseErrors, ...tradeErrors, ...(executions > 500 ? ["체결내역은 최대 500건까지 분석할 수 있습니다."] : [])];
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-4"><Metric label="파일" value={fileName} /><Metric label="인식된 체결" value={`${executions}건`} /><Metric label="완결 거래" value={`${trades.length}건`} /><Metric label="파서 버전" value={REPLAY_PARSER_VERSION} /></section>
    {inspection && importResult && <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">업로드 인식 결과</h2><p className="mt-1 text-xs text-muted-foreground">분석 전에 파일 인식 결과와 제외 항목을 확인해주세요.</p></div><CardContent className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2 lg:grid-cols-4"><ImportInfo label="감지된 증권사" value={`${inspection.detectedBroker} · ${inspection.confidence}`} /><ImportInfo label="시트·헤더" value={`${inspection.selectedSheet} · ${inspection.headerRow}행`} /><ImportInfo label="전체 데이터 행" value={`${importResult.totalRows}건`} /><ImportInfo label="제외된 행" value={`${Object.values(importResult.excluded).reduce((sum, count) => sum + count, 0)}건`} /><ImportInfo label="거래 기간" value={importResult.period.first ? `${importResult.period.first} ~ ${importResult.period.last}` : "-"} /><ImportInfo label="통화" value={importResult.currencies.join(", ") || "USD(기본값)"} /><div className="sm:col-span-2"><div className="text-xs text-muted-foreground">제외 사유</div><div className="mt-1 text-foreground">{Object.entries(importResult.excluded).map(([reason, count]) => `${reason} ${count}건`).join(" · ") || "없음"}</div></div></CardContent></Card>}
    {Object.keys(openingShortfalls).length > 0 && <OpeningHoldingsPanel shortfalls={openingShortfalls} onApply={onApplyOpening} />}
    <TickerDebugTable rows={tickerDebug} />
    {(errors.length > 0 || warnings.length > 0) && <Card><CardContent className="p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5 text-warning" />확인할 항목</h2><ul className="mt-3 space-y-2 text-sm">{errors.map((message) => <li key={message} className="text-danger">{message}</li>)}{warnings.map((message) => <li key={message} className="text-warning">{message}</li>)}</ul></CardContent></Card>}
    <Card><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">완결 거래 미리보기</h2><p className="text-xs text-muted-foreground">전량 매도된 거래만 분석합니다.</p></div><CheckCircle2 className="h-5 w-5 text-success" /></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{["종목", "최초 매수", "최종 매도", "평균 매수가", "평균 매도가", "수익률", "보유 기간"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{trades.slice(0, 20).map((trade, index) => <tr key={`${trade.ticker}-${trade.entryDate}-${index}`}><td className="px-4 py-3 font-semibold">{trade.ticker}</td><td className="px-4 py-3 text-right tabular">{trade.entryDate}</td><td className="px-4 py-3 text-right tabular">{trade.exitDate}</td><td className="px-4 py-3 text-right tabular">${trade.averageEntryPrice.toFixed(2)}</td><td className="px-4 py-3 text-right tabular">${trade.averageExitPrice.toFixed(2)}</td><td className={cn("px-4 py-3 text-right font-semibold tabular", trade.returnPercent >= 0 ? "text-success" : "text-danger")}>{trade.returnPercent >= 0 ? "+" : ""}{trade.returnPercent.toFixed(2)}%</td><td className="px-4 py-3 text-right tabular">{trade.holdingDays}일</td></tr>)}</tbody></table></div></Card>
    <div className="flex justify-end"><Button size="lg" disabled={Boolean(errors.length) || Boolean(Object.keys(openingShortfalls).length) || !trades.length || executions > 500} onClick={onAnalyze}>시장환경 연결하고 분석하기</Button></div>
  </div>;
}

function TickerDebugTable({ rows }: { rows: ReplayTickerDebug[] }) {
  return <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">종목별 수량 검증</h2><p className="mt-1 text-xs text-muted-foreground">파서 {REPLAY_PARSER_VERSION} · 가격과 개인정보는 표시하지 않습니다.</p></div><div className="max-h-80 overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead className="sticky top-0 bg-surface-2 text-xs text-muted-foreground"><tr>{["종목", "총매수", "총매도", "최소 누적수량", "초기 보유 필요", "최종 잔여"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{rows.map((row) => <tr key={row.ticker}><td className="px-4 py-3 font-semibold">{row.ticker}</td><td className="px-4 py-3 text-right tabular">{row.totalBuy.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right tabular">{row.totalSell.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right tabular">{row.minimumRunningQuantity.toLocaleString("ko-KR")}</td><td className="px-4 py-3 text-right tabular">{row.requiredInitialQuantity.toLocaleString("ko-KR")}</td><td className={cn("px-4 py-3 text-right font-semibold tabular", row.finalRemaining > 0 ? "text-warning" : "text-muted-foreground")}>{row.finalRemaining.toLocaleString("ko-KR")}</td></tr>)}</tbody></table></div></Card>;
}

function OpeningHoldingsPanel({ shortfalls, onApply }: { shortfalls: Record<string, number>; onApply: (holdings: Record<string, OpeningHolding>) => void }) {
  const [values, setValues] = useState<Record<string, { quantity: string; averagePrice: string }>>(() => Object.fromEntries(Object.entries(shortfalls).map(([ticker, quantity]) => [ticker, { quantity: String(quantity), averagePrice: "" }])));
  const ready = Object.entries(shortfalls).every(([ticker, required]) => Number(values[ticker]?.quantity) >= required && Number(values[ticker]?.averagePrice) > 0);
  return <Card className="border-warning/40 bg-warning/5">
    <div className="border-b border-warning/20 px-5 py-4"><h2 className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5 text-warning" />조회 기간 이전 보유분 확인</h2><p className="mt-1 text-sm text-muted-foreground">파일에 매수 기록 없이 매도부터 시작하는 종목입니다. 조회 시작 전에 보유했던 수량과 평균 매수가를 입력하세요.</p></div>
    <CardContent className="p-5"><div className="space-y-3">{Object.entries(shortfalls).map(([ticker, required]) => <div key={ticker} className="grid gap-3 rounded-md border border-border bg-background p-3 sm:grid-cols-[minmax(120px,1fr)_180px_180px] sm:items-end"><div><div className="font-semibold">{ticker}</div><div className="mt-1 text-xs text-muted-foreground">최소 초기 보유 수량 {required.toLocaleString("ko-KR")}주</div></div><label className="grid gap-1 text-xs text-muted-foreground">초기 보유 수량<input className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" inputMode="decimal" value={values[ticker]?.quantity ?? ""} onChange={(event) => setValues((current) => ({ ...current, [ticker]: { ...current[ticker], quantity: event.target.value } }))} /></label><label className="grid gap-1 text-xs text-muted-foreground">초기 평균 매수가 (USD)<input className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground" inputMode="decimal" placeholder="예: 152.40" value={values[ticker]?.averagePrice ?? ""} onChange={(event) => setValues((current) => ({ ...current, [ticker]: { ...current[ticker], averagePrice: event.target.value } }))} /></label></div>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">평균 매수가가 없으면 정확한 손익률을 계산할 수 없어 분석을 진행하지 않습니다.</p><Button disabled={!ready} onClick={() => onApply(Object.fromEntries(Object.entries(values).map(([ticker, value]) => [ticker, { quantity: Number(value.quantity), averagePrice: Number(value.averagePrice) }])))}>초기 보유분 적용</Button></div></CardContent>
  </Card>;
}

function ImportInfo({ label, value }: { label: string; value: string }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 font-medium text-foreground">{value}</div></div>; }

function LoadingPanel() { return <Card><CardContent className="grid min-h-72 place-items-center text-center"><div><div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-brand border-t-transparent" /><h2 className="mt-4 font-semibold">매수 당시 시장환경을 연결하고 있습니다</h2><p className="mt-1 text-sm text-muted-foreground">종목·산업·시장 상태를 날짜별로 확인합니다.</p></div></CardContent></Card>; }

function ResultPanel({ trades, warnings, coverage }: { trades: CompletedTrade[]; warnings: string[]; coverage: { first: string | null; last: string | null } }) {
  const linked = trades.filter((trade) => trade.context);
  const winRate = trades.length ? trades.filter((trade) => trade.returnPercent > 0).length / trades.length * 100 : 0;
  const avgReturn = trades.length ? trades.reduce((sum, trade) => sum + trade.returnPercent, 0) / trades.length : 0;
  const avgHolding = trades.length ? trades.reduce((sum, trade) => sum + trade.holdingDays, 0) / trades.length : 0;
  const patterns = useMemo(() => patternRows(linked), [linked]);
  const profitable = patterns.filter((row) => row.trades >= 3 && row.averageReturn > 0).sort((a, b) => b.averageReturn - a.averageReturn).slice(0, 5);
  const losing = patterns.filter((row) => row.trades >= 3 && row.averageReturn < 0).sort((a, b) => a.averageReturn - b.averageReturn).slice(0, 5);
  return <div className="space-y-5">
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-5"><Metric label="완결 거래" value={`${trades.length}건`} /><Metric label="승률" value={`${winRate.toFixed(1)}%`} /><Metric label="평균 수익률" value={`${avgReturn >= 0 ? "+" : ""}${avgReturn.toFixed(2)}%`} tone={avgReturn >= 0 ? "positive" : "negative"} /><Metric label="평균 보유" value={`${avgHolding.toFixed(1)}일`} /><Metric label="시장환경 연결" value={`${linked.length}/${trades.length}건`} /></section>
    {linked.length < trades.length && <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm leading-6 text-warning"><strong>기본 매매 복기는 모든 거래에 제공됩니다.</strong><br />수익률·승률·보유기간은 정상 계산됐습니다. 종목·산업·시장 자금 흐름 분석은 현재 보관 범위인 {coverage.first ?? "-"}~{coverage.last ?? "-"}의 거래에만 연결되며, 과거 데이터는 순차적으로 확대하고 있습니다.</div>}
    <div className="grid gap-5 lg:grid-cols-2"><PatternCard title="수익이 난 시장환경" icon={TrendingUp} rows={profitable} positive /><PatternCard title="손실이 난 시장환경" icon={TrendingDown} rows={losing} /></div>
    <Card><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">거래별 시장환경</h2><p className="text-xs text-muted-foreground">최초 매수일 또는 직전 거래일 기준</p></div><div className="divide-y divide-border">{trades.map((trade, index) => <div key={`${trade.ticker}-${index}`} className="grid gap-3 px-5 py-4 md:grid-cols-[140px_150px_1fr_auto] md:items-center"><div><div className="font-semibold">{trade.ticker}</div><div className="text-xs text-muted-foreground">{trade.entryDate}</div></div><div className={cn("font-semibold tabular", trade.returnPercent >= 0 ? "text-success" : "text-danger")}>{trade.returnPercent >= 0 ? "+" : ""}{trade.returnPercent.toFixed(2)}%</div><div className="text-sm text-muted-foreground">{trade.context ? `종목 ${trade.context.ticker.volume_state} · 산업 ${trade.context.industry?.flow_status ?? "-"} · 시장 ${trade.context.market.market_regime}` : trade.contextStatus}</div><div className="text-xs text-muted-foreground">{trade.contextStatus}</div></div>)}</div></Card>
    {warnings.length > 0 && <p className="text-xs text-muted-foreground">{warnings.join(" · ")}</p>}
    <p className="text-xs leading-5 text-muted-foreground">이 결과는 과거 거래 복기용이며 매수·매도 추천이 아닙니다. 조건별 거래가 3건 미만이면 통계적 결론으로 표시하지 않습니다.</p>
  </div>;
}

type Pattern = { label: string; trades: number; winRate: number; averageReturn: number };
function patternRows(trades: CompletedTrade[]): Pattern[] {
  const groups = new Map<string, number[]>();
  for (const trade of trades) {
    const context = trade.context!;
    const labels = [`종목 거래대금 ${context.ticker.volume_state}`, `시장 상태 ${context.market.market_regime}`];
    if (context.industry) labels.push(`산업 흐름 ${context.industry.flow_status}`);
    for (const label of labels) groups.set(label, [...(groups.get(label) ?? []), trade.returnPercent]);
  }
  return [...groups].map(([label, values]) => ({ label, trades: values.length, winRate: values.filter((value) => value > 0).length / values.length * 100, averageReturn: values.reduce((sum, value) => sum + value, 0) / values.length }));
}

function PatternCard({ title, icon: Icon, rows, positive = false }: { title: string; icon: typeof TrendingUp; rows: Pattern[]; positive?: boolean }) { return <Card><div className="flex items-center gap-2 border-b border-border px-5 py-4"><Icon className={cn("h-5 w-5", positive ? "text-success" : "text-danger")} /><h2 className="font-semibold">{title}</h2></div><CardContent className="p-0">{rows.length ? <div className="divide-y divide-border">{rows.map((row) => <div key={row.label} className="grid grid-cols-[1fr_auto] gap-3 px-5 py-4"><div><div className="text-sm font-medium">{row.label}</div><div className="mt-1 text-xs text-muted-foreground">{row.trades}건 · 승률 {row.winRate.toFixed(1)}% · 신뢰도 {confidence(row.trades)}</div></div><div className={cn("font-semibold tabular", row.averageReturn >= 0 ? "text-success" : "text-danger")}>{row.averageReturn >= 0 ? "+" : ""}{row.averageReturn.toFixed(2)}%</div></div>)}</div> : <div className="px-5 py-10 text-center text-sm text-muted-foreground">표시할 조건이 아직 없습니다.</div>}</CardContent></Card>; }

function Metric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) { return <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">{label}</div><div className={cn("mt-1 truncate text-lg font-bold tabular", tone === "positive" && "text-success", tone === "negative" && "text-danger")}>{value}</div></CardContent></Card>; }
