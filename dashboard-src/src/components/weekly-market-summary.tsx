import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { cn } from "@/lib/utils";
import { fmtMoney, fmtPct } from "@/lib/format";
import { DataSourcesStatus } from "./data-source-state";
import { retryDataSource, useDataSources } from "@/lib/data-runtime";
import { Skeleton } from "./ui/skeleton";
import { Button } from "./ui/button";
import { buildWeeklySentences } from "@/lib/briefing";

type IndexRow = {
  symbol: string;
  name: string;
  close: number;
  change: number | null;
};
type SectorRow = { id: string; name: string; changeBp: number; share: number };
type ActiveStock = { ticker: string; name: string; dollarVolume: number };
type Week = {
  weekId: string;
  label: string;
  startDate: string;
  endDate: string;
  status: "complete" | "in_progress";
  tradingDays: number;
  summary: string;
  indices: IndexRow[];
  market: {
    averageDollarVolume: number;
    lastDayVolumeChange: number | null;
    advancingShare: number | null;
  };
  sectorGainers: SectorRow[];
  sectorLosers: SectorRow[];
  activeStocks: ActiveStock[];
};
type Payload = { coverageStart: string; coverageEnd: string; weeks: Week[] };
const number = new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 2 });

export function WeeklyMarketSummary() {
  const sourceStates = useDataSources(["weekly"] as const);
  const state = sourceStates.weekly;
  const data = state.data as Payload | undefined;
  const [selected, setSelected] = useState("");

  useEffect(() => {
    if (!selected && data?.weeks?.[0]) setSelected(data.weeks[0].weekId);
  }, [data, selected]);

  const weeks = data?.weeks ?? [];
  const current = weeks.find((week) => week.weekId === selected) ?? weeks[0];
  if (!current) {
    const loading =
      state.phase === "idle" ||
      state.phase === "loading" ||
      state.phase === "refreshing";
    return (
      <section className="mt-5" aria-labelledby="weekly-summary-title">
        <h2 id="weekly-summary-title" className="mb-3 text-lg font-semibold">
          주간 시장 요약
        </h2>
        <DataSourcesStatus states={[state]} className="mb-3" />
        {loading ? (
          <Skeleton className="h-64 rounded-xl" />
        ) : (
          <div className="rounded-xl border border-danger/25 bg-danger/5 px-5 py-10 text-center">
            <p className="text-sm font-medium">
              {state.phase === "error"
                ? "주간 요약을 불러오지 못했습니다."
                : "표시할 주간 요약이 없습니다."}
            </p>
            {state.phase === "error" && (
              <Button
                size="sm"
                className="mt-3"
                onClick={() => void retryDataSource("weekly")}
              >
                다시 시도
              </Button>
            )}
          </div>
        )}
      </section>
    );
  }
  const currentIndex = weeks.findIndex(
    (week) => week.weekId === current.weekId,
  );
  const deterministicSummary = buildWeeklySentences(current);
  const olderWeek = weeks[currentIndex + 1];
  const newerWeek = weeks[currentIndex - 1];

  return (
    <section className="mt-5" aria-labelledby="weekly-summary-title">
      <div className="mb-3">
        <div>
          <div className="text-xs font-semibold text-brand">주간 요약</div>
          <h2 id="weekly-summary-title" className="mt-1 text-lg font-semibold">
            주간 시장 요약
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            저장된 장마감 데이터를 주별로 비교합니다.
          </p>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            disabled={!olderWeek}
            onClick={() => olderWeek && setSelected(olderWeek.weekId)}
            aria-label="이전 주 보기"
            title="이전 주"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-brand/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <label className="relative min-w-0 sm:w-64">
            <span className="sr-only">주차 선택</span>
            <select
              value={current.weekId}
              onChange={(event) => setSelected(event.target.value)}
              className="h-9 w-full appearance-none rounded-md border bg-surface px-3 pr-9 text-sm font-medium outline-none hover:border-brand/40 focus:border-brand"
            >
              {weeks.map((week) => (
                <option key={week.weekId} value={week.weekId}>
                  {week.label} · {week.startDate.slice(5)}~
                  {week.endDate.slice(5)}
                </option>
              ))}
            </select>
            <CalendarRange className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </label>
          <button
            type="button"
            disabled={!newerWeek}
            onClick={() => newerWeek && setSelected(newerWeek.weekId)}
            aria-label="다음 주 보기"
            title="다음 주"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-brand/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="hidden text-xs text-muted-foreground sm:inline">
            전체 {weeks.length}주
          </span>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/70 pb-4">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CalendarRange className="h-4 w-4 text-brand" />
                {current.startDate} ~ {current.endDate}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                미국장 {current.tradingDays}거래일
              </p>
            </div>
            <span
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium",
                current.status === "complete"
                  ? "border-success/25 bg-success/10 text-success"
                  : "border-warning/30 bg-warning/10 text-warning-foreground",
              )}
            >
              {current.status === "complete" ? "주간 확정" : "진행 중"}
            </span>
          </div>

          <p className="py-4 text-base font-semibold leading-7">
            {deterministicSummary.sectorSentence}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              label="주간 일평균 거래대금"
              value={fmtMoney(current.market.averageDollarVolume / 1_000_000)}
            />
            <Metric
              label="직전 주 마지막 거래일 대비"
              value={
                current.market.lastDayVolumeChange == null
                  ? "비교 자료 없음"
                  : `${fmtPct(current.market.lastDayVolumeChange, 1)} 전일 대비`
              }
              tone={current.market.lastDayVolumeChange ?? 0}
            />
            <Metric
              label="상승 종목 비중"
              value={
                current.market.advancingShare == null
                  ? "-"
                  : `${current.market.advancingShare.toFixed(1)}%`
              }
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[1.15fr_1fr_1fr]">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <BarChart3 className="h-4 w-4 text-brand" />
                미국 주요 지수
              </h3>
              <div className="divide-y divide-border/70 rounded-lg border">
                {current.indices.map((row) => (
                  <div
                    key={row.symbol}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2.5 text-sm"
                  >
                    <span className="font-medium">{row.name}</span>
                    <span className="text-xs tabular text-muted-foreground">
                      {number.format(row.close)}
                    </span>
                    <span
                      className={cn(
                        "min-w-16 text-right font-semibold tabular",
                        (row.change ?? 0) > 0
                          ? "text-success"
                          : (row.change ?? 0) < 0
                            ? "text-danger"
                            : "text-muted-foreground",
                      )}
                    >
                      {row.change == null ? "-" : fmtPct(row.change, 2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <SectorList title="점유율 확대" rows={current.sectorGainers} />
            <SectorList title="점유율 축소" rows={current.sectorLosers} />
          </div>

          <div className="mt-5 border-t border-border/70 pt-4">
            <h3 className="mb-2 text-sm font-semibold">
              주간 거래대금 집중 종목
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {current.activeStocks.map((stock) => (
                <a
                  key={stock.ticker}
                  href={`/stock/?ticker=${encodeURIComponent(stock.ticker)}`}
                  className="rounded-lg border px-3 py-2 hover:border-brand/40 hover:bg-brand/5"
                >
                  <div className="font-mono text-xs font-semibold">
                    {stock.ticker}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    {stock.name}
                  </div>
                  <div className="mt-1 text-xs font-medium tabular">
                    {fmtMoney(stock.dollarVolume / 1_000_000)}
                  </div>
                </a>
              ))}
            </div>
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground">
            주간 수익률은 직전 주 마지막 거래일 종가 대비입니다. 첫 제공 주는
            비교 기준이 없어 수익률을 표시하지 않습니다.
          </p>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  return (
    <div className="rounded-lg border bg-muted/25 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-sm font-semibold tabular",
          tone && tone > 0
            ? "text-success"
            : tone && tone < 0
              ? "text-danger"
              : "",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SectorList({ title, rows }: { title: string; rows: SectorRow[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <div className="divide-y divide-border/70 rounded-lg border">
        {rows.map((row) => (
          <div
            key={row.id}
            className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
          >
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-[11px] text-muted-foreground">
                점유율 {row.share.toFixed(1)}%
              </div>
            </div>
            <span
              className={cn(
                "font-semibold tabular",
                row.changeBp > 0 ? "text-success" : "text-danger",
              )}
            >
              {row.changeBp > 0 ? "+" : ""}
              {row.changeBp} bp
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
