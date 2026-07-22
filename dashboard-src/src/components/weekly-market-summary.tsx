import { useEffect, useState } from "react";
import { BarChart3, CalendarRange, ChevronDown } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct } from "@/lib/format";

type IndexRow = { symbol: string; name: string; close: number; change: number | null };
type SectorRow = { id: string; name: string; changeBp: number; share: number };
type ActiveStock = { ticker: string; name: string; dollarVolume: number };
type Week = {
  weekId: string; label: string; startDate: string; endDate: string;
  status: "complete" | "in_progress"; tradingDays: number; summary: string;
  indices: IndexRow[];
  market: { averageDollarVolume: number; lastDayVolumeChange: number | null; advancingShare: number | null };
  sectorGainers: SectorRow[]; sectorLosers: SectorRow[]; activeStocks: ActiveStock[];
};
type Payload = { coverageStart: string; coverageEnd: string; weeks: Week[] };
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export function WeeklyMarketSummary() {
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/weekly_summary.json", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: Payload) => { setData(payload); setSelected(payload.weeks?.[0]?.weekId ?? ""); })
      .catch(() => setData(null));
  }, []);

  const weeks = data?.weeks ?? [];
  const current = weeks.find((week) => week.weekId === selected) ?? weeks[0];
  if (!current) return null;
  const visible = expanded ? weeks : weeks.slice(0, 6);

  return (
    <section className="mt-5" aria-labelledby="weekly-summary-title">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand">Weekly Brief</div>
          <h2 id="weekly-summary-title" className="mt-1 text-lg font-semibold">주간 시장 요약</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">저장된 장마감 데이터를 주별로 비교합니다.</p>
        </div>
        <div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted/35 p-1 no-scrollbar">
          {visible.map((week) => (
            <button key={week.weekId} type="button" onClick={() => setSelected(week.weekId)} className={cn("shrink-0 rounded-md px-3 py-1.5 text-xs font-medium", week.weekId === current.weekId ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>{week.label}</button>
          ))}
          {weeks.length > 6 && <button type="button" onClick={() => setExpanded((value) => !value)} className="inline-flex shrink-0 items-center gap-1 px-2 text-xs text-brand">{expanded ? "접기" : `이전 ${weeks.length - 6}주`}<ChevronDown className={cn("h-3 w-3", expanded && "rotate-180")} /></button>}
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold"><CalendarRange className="h-4 w-4 text-brand" />{current.startDate} ~ {current.endDate}</div>
              <p className="mt-1 text-xs text-muted-foreground">미국장 {current.tradingDays}거래일</p>
            </div>
            <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium", current.status === "complete" ? "border-success/25 bg-success/10 text-success" : "border-warning/30 bg-warning/10 text-warning-foreground")}>{current.status === "complete" ? "주간 확정" : "진행 중"}</span>
          </div>

          <p className="py-4 text-base font-semibold leading-7">{current.summary}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="주간 일평균 거래대금" value={fmtMoney(current.market.averageDollarVolume / 1_000_000)} />
            <Metric label="마지막 거래일 거래대금" value={current.market.lastDayVolumeChange == null ? "비교 자료 없음" : `${fmtPct(current.market.lastDayVolumeChange, 1)} 전일 대비`} tone={current.market.lastDayVolumeChange ?? 0} />
            <Metric label="상승 종목 비중" value={current.market.advancingShare == null ? "-" : `${current.market.advancingShare.toFixed(1)}%`} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr_1fr]">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-brand" />미국 주요 지수</h3>
              <div className="divide-y divide-border/70 rounded-lg border">
                {current.indices.map((row) => <div key={row.symbol} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"><span className="font-medium">{row.name}</span><span className="text-xs tabular text-muted-foreground">{number.format(row.close)}</span><span className={cn("min-w-16 text-right font-semibold tabular", (row.change ?? 0) > 0 ? "text-success" : (row.change ?? 0) < 0 ? "text-danger" : "text-muted-foreground")}>{row.change == null ? "-" : fmtPct(row.change, 2)}</span></div>)}
              </div>
            </div>
            <SectorList title="점유율 확대" rows={current.sectorGainers} />
            <SectorList title="점유율 축소" rows={current.sectorLosers} />
          </div>

          <div className="mt-5 border-t border-border/70 pt-4">
            <h3 className="mb-2 text-sm font-semibold">주간 거래대금 집중 종목</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {current.activeStocks.map((stock) => <a key={stock.ticker} href={`/stock/?ticker=${encodeURIComponent(stock.ticker)}`} className="rounded-lg border px-3 py-2 hover:border-brand/40 hover:bg-brand/5"><div className="font-mono text-xs font-semibold">{stock.ticker}</div><div className="mt-0.5 truncate text-[11px] text-muted-foreground">{stock.name}</div><div className="mt-1 text-xs font-medium tabular">{fmtMoney(stock.dollarVolume / 1_000_000)}</div></a>)}
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">주간 수익률은 직전 주 마지막 거래일 종가 대비입니다. 첫 제공 주는 비교 기준이 없어 수익률을 표시하지 않습니다.</p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: number }) {
  return <div className="rounded-lg border bg-muted/25 px-3 py-2.5"><div className="text-[11px] text-muted-foreground">{label}</div><div className={cn("mt-1 text-sm font-semibold tabular", tone && tone > 0 ? "text-success" : tone && tone < 0 ? "text-danger" : "")}>{value}</div></div>;
}

function SectorList({ title, rows }: { title: string; rows: SectorRow[] }) {
  return <div><h3 className="mb-2 text-sm font-semibold">{title}</h3><div className="divide-y divide-border/70 rounded-lg border">{rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><div><div className="font-medium">{row.name}</div><div className="text-[11px] text-muted-foreground">점유율 {row.share.toFixed(1)}%</div></div><span className={cn("font-semibold tabular", row.changeBp > 0 ? "text-success" : "text-danger")}>{row.changeBp > 0 ? "+" : ""}{row.changeBp} bp</span></div>)}</div></div>;
}
