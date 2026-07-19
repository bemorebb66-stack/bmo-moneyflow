import { useMemo, useRef, useState, type RefObject } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, RotateCcw, ShieldCheck, TrendingDown, TrendingUp, Upload } from "lucide-react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { addContext, combineReplayTrades, confidence, parseReplayCsv, type CompletedTrade, type ReplaySnapshot } from "@/lib/replay";
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

type Stage = "upload" | "review" | "loading" | "result";

function ReplayPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("upload");
  const [fileName, setFileName] = useState("");
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [tradeErrors, setTradeErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [trades, setTrades] = useState<CompletedTrade[]>([]);
  const [executionsCount, setExecutionsCount] = useState(0);
  const [uploadError, setUploadError] = useState("");
  const [coverage, setCoverage] = useState<{ first: string | null; last: string | null }>({ first: null, last: null });

  const reset = () => {
    setStage("upload"); setFileName(""); setParseErrors([]); setTradeErrors([]); setWarnings([]); setTrades([]); setExecutionsCount(0); setUploadError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const processCsv = (text: string, name: string) => {
    setFileName(name);
    const parsed = parseReplayCsv(text);
    const combined = combineReplayTrades(parsed.executions);
    setExecutionsCount(parsed.executions.length);
    setParseErrors(parsed.errors);
    setTradeErrors(combined.errors);
    setWarnings(combined.warnings);
    setTrades(combined.trades);
    setStage("review");
  };

  const onFile = async (file?: File) => {
    if (file) processCsv(await file.text(), file.name);
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
          <span className="inline-flex items-center gap-2 font-medium"><ShieldCheck className="h-4 w-4 text-success" />원본 CSV는 서버로 전송되지 않고 이 브라우저에서만 처리됩니다.</span>
          {stage !== "upload" && <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="mr-1.5 h-4 w-4" />처음부터</Button>}
        </div>

        {stage === "upload" && <UploadPanel inputRef={inputRef} onFile={onFile} onSample={loadSample} error={uploadError} />}
        {stage === "review" && <ReviewPanel fileName={fileName} executions={executionsCount} trades={trades} parseErrors={parseErrors} tradeErrors={tradeErrors} warnings={warnings} onAnalyze={analyze} />}
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
      <div className="mb-5"><div className="text-xs font-semibold text-brand">TRADE IMPORT</div><h2 className="mt-1 text-xl font-bold">거래내역 불러오기</h2><p className="mt-1 text-sm text-muted-foreground">미국주식 USD 체결내역을 BVT 표준 CSV로 올려주세요.</p></div>
      <div onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); }} className={cn("grid min-h-56 place-items-center rounded-lg border border-dashed p-6 text-center transition-colors", dragging ? "border-brand bg-brand/5" : "border-border bg-surface-2/50")}>
        <div><div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-brand/10 text-brand"><Upload className="h-6 w-6" /></div><div className="mt-4 font-semibold">CSV 파일을 끌어놓거나 선택하세요</div><div className="mt-1 text-xs text-muted-foreground">최대 500개 체결내역 · CSV 형식</div><Button className="mt-4" onClick={() => inputRef.current?.click()}>파일 선택</Button><input ref={inputRef} className="hidden" type="file" accept=".csv,text/csv" onChange={(event) => onFile(event.target.files?.[0])} /></div>
      </div>
    </CardContent></Card>
    <div className="space-y-4">
      <Card><CardContent className="p-5"><FileSpreadsheet className="h-5 w-5 text-brand" /><h2 className="mt-3 font-semibold">처음 사용한다면</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">표준 양식에 티커, 거래일, 매수·매도, 수량, 가격, 수수료를 입력하세요.</p><div className="mt-4 grid gap-2"><Button asChild variant="outline" className="w-full"><a href="/replay_data/bvt-standard-trades.csv" download><Download className="mr-2 h-4 w-4" />표준 CSV 받기</a></Button><Button variant="ghost" className="w-full" onClick={onSample}>샘플로 체험하기</Button></div>{error && <p className="mt-3 text-xs leading-5 text-danger">{error}</p>}</CardContent></Card>
      <Card><CardContent className="p-5 text-sm"><h2 className="font-semibold">현재 지원 범위</h2><ul className="mt-3 space-y-2 text-muted-foreground"><li>미국주식 · USD 거래</li><li>완전히 매도한 거래</li><li>평균단가 방식</li><li>최대 500개 체결내역</li></ul></CardContent></Card>
    </div>
  </div>;
}

function ReviewPanel({ fileName, executions, trades, parseErrors, tradeErrors, warnings, onAnalyze }: { fileName: string; executions: number; trades: CompletedTrade[]; parseErrors: string[]; tradeErrors: string[]; warnings: string[]; onAnalyze: () => void }) {
  const errors = [...parseErrors, ...tradeErrors, ...(executions > 500 ? ["체결내역은 최대 500건까지 분석할 수 있습니다."] : [])];
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-3"><Metric label="파일" value={fileName} /><Metric label="인식된 체결" value={`${executions}건`} /><Metric label="완결 거래" value={`${trades.length}건`} /></section>
    {(errors.length > 0 || warnings.length > 0) && <Card><CardContent className="p-5"><h2 className="flex items-center gap-2 font-semibold"><AlertCircle className="h-5 w-5 text-warning" />확인할 항목</h2><ul className="mt-3 space-y-2 text-sm">{errors.map((message) => <li key={message} className="text-danger">{message}</li>)}{warnings.map((message) => <li key={message} className="text-warning">{message}</li>)}</ul></CardContent></Card>}
    <Card><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">완결 거래 미리보기</h2><p className="text-xs text-muted-foreground">전량 매도된 거래만 분석합니다.</p></div><CheckCircle2 className="h-5 w-5 text-success" /></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead className="bg-surface-2 text-xs text-muted-foreground"><tr>{["종목", "최초 매수", "최종 매도", "평균 매수가", "평균 매도가", "수익률", "보유 기간"].map((label) => <th key={label} className="px-4 py-3 text-right first:text-left">{label}</th>)}</tr></thead><tbody className="divide-y divide-border">{trades.slice(0, 20).map((trade, index) => <tr key={`${trade.ticker}-${trade.entryDate}-${index}`}><td className="px-4 py-3 font-semibold">{trade.ticker}</td><td className="px-4 py-3 text-right tabular">{trade.entryDate}</td><td className="px-4 py-3 text-right tabular">{trade.exitDate}</td><td className="px-4 py-3 text-right tabular">${trade.averageEntryPrice.toFixed(2)}</td><td className="px-4 py-3 text-right tabular">${trade.averageExitPrice.toFixed(2)}</td><td className={cn("px-4 py-3 text-right font-semibold tabular", trade.returnPercent >= 0 ? "text-success" : "text-danger")}>{trade.returnPercent >= 0 ? "+" : ""}{trade.returnPercent.toFixed(2)}%</td><td className="px-4 py-3 text-right tabular">{trade.holdingDays}일</td></tr>)}</tbody></table></div></Card>
    <div className="flex justify-end"><Button size="lg" disabled={Boolean(errors.length) || !trades.length || executions > 500} onClick={onAnalyze}>시장환경 연결하고 분석하기</Button></div>
  </div>;
}

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
    {linked.length < trades.length && <div className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3 text-sm text-warning">현재 보관 범위는 {coverage.first ?? "-"}~{coverage.last ?? "-"}입니다. 범위 이전 거래는 성과 계산만 표시하고 시장환경 분석에서는 제외했습니다.</div>}
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
