import { useEffect, useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Star } from "lucide-react";
import { ShareMenu } from "./share-menu";
import { Card, CardContent } from "./ui/card";
import {
  BRIEFING_DISCLAIMER,
  buildDailyBriefing,
  buildReplaySnapshotFromMarketData,
  buildWatchlistBriefing,
  buildWeeklySentences,
  formatBriefingMoney,
  type ReplaySnapshot,
  type WeeklySource,
} from "@/lib/briefing";
import { useWatchlist } from "@/lib/user-library";
import { formatKstTimestamp } from "@/lib/date-time";
import { cn } from "@/lib/utils";
import { LIVE_META } from "@/lib/mock-data";

function trackBriefingView(
  period: "daily" | "weekly",
  dateKey: string,
  status: string,
  entryPoint: "today" | "archive" | "shared_link",
  hasWatchlistSection: boolean,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("bvt:analytics", {
      detail: {
        event: "briefing_view",
        period,
        date_key: dateKey,
        briefing_status: status,
        entry_point: entryPoint,
        has_watchlist_section: hasWatchlistSection,
      },
    }),
  );
}

export function BriefingDateNavigation({
  dates,
  current,
  period = "daily",
  weekIds = [],
}: {
  dates: string[];
  current: string;
  period?: "daily" | "weekly";
  weekIds?: string[];
}) {
  const values = period === "daily" ? dates : weekIds;
  const index = values.indexOf(current);
  const previous = index > 0 ? values[index - 1] : undefined;
  const next = index >= 0 && index < values.length - 1 ? values[index + 1] : undefined;
  const pathFor = (value: string) =>
    period === "daily" ? `/briefings/${value}/` : `/briefings/weeks/${value}/`;
  const mondayFor = (dateValue: string) => {
    const date = new Date(`${dateValue}T12:00:00Z`);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return date.toISOString().slice(0, 10);
  };
  const selectedWeek = weekIds.find((weekId, weekIndex) => {
    const nextWeek = weekIds[weekIndex + 1];
    return current >= weekId && (!nextWeek || current < nextWeek);
  }) ?? mondayFor(current);
  const currentWeekIndex = weekIds.indexOf(current);
  const followingWeek = currentWeekIndex >= 0 ? weekIds[currentWeekIndex + 1] : undefined;
  const dailyDateForWeek = period === "weekly"
    ? [...dates].reverse().find((date) => date >= current && (!followingWeek || date < followingWeek)) ?? dates.at(-1)
    : current;
  return (
    <nav
      aria-label="브리핑 날짜 탐색"
      className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface p-2"
    >
      <a
        href={previous ? pathFor(previous) : undefined}
        aria-disabled={!previous}
        className={cn(
          "grid min-h-11 min-w-11 place-items-center rounded-md border",
          !previous && "pointer-events-none opacity-40",
        )}
        aria-label={period === "daily" ? "이전 거래일" : "이전 주"}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </a>
      <label className="relative min-w-52 flex-1 sm:flex-none">
        <span className="sr-only">{period === "daily" ? "거래일" : "주간"} 선택</span>
        <select
          value={current}
          onChange={(event) => {
            if (typeof window !== "undefined") window.location.assign(pathFor(event.target.value));
          }}
          className="min-h-11 w-full appearance-none rounded-md border bg-background px-3 pr-9 text-sm font-medium"
        >
          {values.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>
        <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </label>
      <a
        href={next ? pathFor(next) : undefined}
        aria-disabled={!next}
        className={cn(
          "grid min-h-11 min-w-11 place-items-center rounded-md border",
          !next && "pointer-events-none opacity-40",
        )}
        aria-label={period === "daily" ? "다음 거래일" : "다음 주"}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </a>
      <div className="ml-auto flex rounded-md border p-1 text-xs font-semibold" aria-label="브리핑 단위">
        <a
          href={period === "daily" ? pathFor(current) : `/briefings/${dailyDateForWeek ?? current}/`}
          aria-current={period === "daily" ? "page" : undefined}
          className={cn("rounded px-3 py-2", period === "daily" && "bg-brand text-brand-foreground")}
        >일간</a>
        <a
          href={`/briefings/weeks/${period === "weekly" ? current : selectedWeek}/`}
          aria-current={period === "weekly" ? "page" : undefined}
          className={cn("rounded px-3 py-2", period === "weekly" && "bg-brand text-brand-foreground")}
        >주간</a>
      </div>
    </nav>
  );
}

export function DailyBriefingView({
  snapshot,
  dates = [],
  entryPoint = "archive",
  delayed = false,
  compact = false,
}: {
  snapshot: ReplaySnapshot;
  dates?: string[];
  entryPoint?: "today" | "archive" | "shared_link";
  delayed?: boolean;
  compact?: boolean;
}) {
  const briefing = useMemo(() => buildDailyBriefing(snapshot), [snapshot]);
  const watchlist = useWatchlist();
  const watchlistBriefing = useMemo(
    () => buildWatchlistBriefing(snapshot, watchlist.tickers),
    [snapshot, watchlist.tickers.join("|")],
  );
  const status = delayed ? "delayed" : briefing.quality;
  useEffect(() => {
    trackBriefingView("daily", briefing.date, status, entryPoint, true);
  }, [briefing.date, entryPoint, status]);
  const canonical = `https://www.bvtmoneyflow.xyz/briefings/${briefing.date}/`;

  return (
    <section aria-labelledby={`daily-briefing-${briefing.date}`} className="space-y-4">
      {!compact && dates.length > 0 && (
        <BriefingDateNavigation dates={dates} current={briefing.date} />
      )}
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-brand">
                <span>{compact ? "장 마감 브리핑" : "일간 브리핑"}</span>
                <span className={cn(
                  "rounded-full border px-2 py-0.5",
                  delayed || briefing.quality === "partial"
                    ? "border-warning/30 bg-warning/10 text-warning"
                    : "border-success/25 bg-success/10 text-success",
                )}>
                  {delayed ? "데이터 지연" : briefing.quality === "partial" ? "일부 데이터" : "장 마감"}
                </span>
              </div>
              <h2 id={`daily-briefing-${briefing.date}`} className="mt-1 text-xl font-bold sm:text-2xl">
                {briefing.date} 미국 시장 브리핑
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                데이터 기준일 {briefing.date}
                {briefing.sourceUpdatedAt ? ` · 원천 갱신 ${formatKstTimestamp(briefing.sourceUpdatedAt)}` : ""}
              </p>
            </div>
            <ShareMenu
              label="브리핑 공유"
              title={`${briefing.date} 미국 시장 브리핑 | BVT Money Flow`}
              text={briefing.shareText}
              url={canonical}
              period="daily"
              dateKey={briefing.date}
              briefingStatus={status}
              disabled={!briefing.market.totalDollarVolume}
            />
          </div>

          <div className="mt-5 space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-4" data-briefing-sentences>
            <div className="text-[11px] font-semibold text-brand">데이터 해석</div>
            {briefing.sentences.slice(0, compact ? 2 : 3).map((sentence, index) => (
              <p key={sentence.id} className={cn(index === 0 ? "text-base font-semibold leading-7" : "text-sm leading-6 text-muted-foreground")}>
                {sentence.text}
              </p>
            ))}
          </div>

          <div className="mt-5 text-[11px] font-semibold text-muted-foreground">사실</div>
          <dl className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="전체 거래대금" value={formatBriefingMoney(briefing.market.totalDollarVolume)} />
            <Metric label="전일 대비" value={briefing.market.changePercent == null ? "비교 자료 없음" : `${briefing.market.changePercent > 0 ? "+" : ""}${briefing.market.changePercent.toFixed(1)}%`} />
            <Metric label="상승 · 하락" value={`${briefing.market.advancing.toLocaleString("ko-KR")} · ${briefing.market.declining.toLocaleString("ko-KR")}`} />
            <Metric label="비교 가능 종목" value={`${briefing.coverage.comparableTickers.toLocaleString("ko-KR")} / ${briefing.coverage.tickers.toLocaleString("ko-KR")}`} />
          </dl>

          {!compact && (
            <>
              <div className="mt-6 grid gap-4 lg:grid-cols-2">
                <section aria-labelledby="briefing-sector-title" className="rounded-lg border p-4">
                  <h3 id="briefing-sector-title" className="text-sm font-semibold">섹터 점유율 변화</h3>
                  <ul className="mt-3 space-y-2">
                    {[...briefing.sectors.slice(0, 2), ...briefing.sectors.slice(-2)]
                      .filter((row, index, all) => all.findIndex((item) => item.id === row.id) === index)
                      .map((row) => (
                        <li key={row.id} className="flex justify-between gap-3 text-sm">
                          <span>{row.name} <span className="text-xs text-muted-foreground">점유율 {row.share.toFixed(1)}%</span></span>
                          <strong className="tabular">{row.changeBp > 0 ? "+" : ""}{Math.round(row.changeBp)}bp</strong>
                        </li>
                      ))}
                  </ul>
                </section>
                <section aria-labelledby="briefing-stock-title" className="rounded-lg border p-4">
                  <h3 id="briefing-stock-title" className="text-sm font-semibold">20일 평균 대비 거래대금 상위</h3>
                  <ul className="mt-3 space-y-2">
                    {briefing.notableStocks.map((row) => (
                      <li key={row.ticker} className="flex justify-between gap-3 text-sm">
                        <span><strong className="font-mono">{row.ticker}</strong> <span className="text-xs text-muted-foreground">{row.name}</span></span>
                        <span className="tabular">{row.ratio20d.toFixed(2)}배</span>
                      </li>
                    ))}
                    {!briefing.notableStocks.length && <li className="text-sm text-muted-foreground">조건을 충족한 종목이 없습니다.</li>}
                  </ul>
                </section>
              </div>

              <section aria-labelledby="watchlist-briefing-title" className="mt-5 rounded-lg border border-brand/20 bg-brand/5 p-4">
                <div className="flex items-center gap-2">
                  <Star className="h-4 w-4 text-brand" aria-hidden />
                  <h3 id="watchlist-briefing-title" className="text-sm font-semibold">내 관심종목 요약</h3>
                  <span className="text-[11px] text-muted-foreground">이 브라우저에서만 표시</span>
                </div>
                <p className="mt-2 text-sm leading-6">{watchlistBriefing.sentence}</p>
                {watchlistBriefing.rows.length > 0 ? (
                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                    {watchlistBriefing.rows.map((row) => (
                      <li key={row.ticker} className="flex flex-wrap justify-between gap-x-3 gap-y-1 rounded-md bg-background px-3 py-2 text-xs">
                        <span className="min-w-0 break-words"><strong className="font-mono">{row.ticker}</strong> {row.name}</span>
                        <span className="shrink-0 tabular">{row.ratio20d.toFixed(2)}배 · {row.dailyReturn == null ? "등락 없음" : `${row.dailyReturn > 0 ? "+" : ""}${row.dailyReturn.toFixed(2)}%`}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <a href="/scanner/" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline">관심종목 추가하기</a>
                )}
                {watchlistBriefing.missingTickers.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">저장 {watchlistBriefing.savedCount}개 중 {watchlistBriefing.availableCount}개를 비교했습니다.</p>
                )}
              </section>
            </>
          )}

          {compact && (
            <a href={`/briefings/${briefing.date}/`} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-brand underline">전체 브리핑과 관심종목 보기</a>
          )}
          <footer className="mt-6 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">데이터 안내 · 기준일 {briefing.date} · {BRIEFING_DISCLAIMER}</footer>
        </CardContent>
      </Card>
    </section>
  );
}

export function WeeklyBriefingView({
  week,
  weekIds,
  dates,
}: {
  week: WeeklySource;
  weekIds: string[];
  dates: string[];
}) {
  const sentences = useMemo(() => buildWeeklySentences(week), [week]);
  useEffect(() => {
    trackBriefingView("weekly", week.weekId, week.status, "archive", false);
  }, [week.weekId, week.status]);
  const canonical = `https://www.bvtmoneyflow.xyz/briefings/weeks/${week.weekId}/`;
  return (
    <section aria-labelledby={`weekly-briefing-${week.weekId}`} className="space-y-4">
      <BriefingDateNavigation dates={dates} current={week.weekId} period="weekly" weekIds={weekIds} />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-brand">주간 브리핑</div>
              <h2 id={`weekly-briefing-${week.weekId}`} className="mt-1 text-2xl font-bold">{week.startDate} ~ {week.endDate}</h2>
              <p className="mt-1 text-xs text-muted-foreground">데이터 기준일 {week.endDate} · {week.tradingDays}거래일 집계 · {week.status === "complete" ? "주간 확정" : "진행 중"}</p>
            </div>
            <ShareMenu
              label="주간 공유"
              title={`${week.label} 미국 시장 브리핑 | BVT Money Flow`}
              text={sentences.shareText}
              url={canonical}
              period="weekly"
              dateKey={week.weekId}
              briefingStatus={week.status}
            />
          </div>
          <div className="mt-5 space-y-3 rounded-lg border border-brand/20 bg-brand/5 p-4">
            <div className="text-[11px] font-semibold text-brand">데이터 해석</div>
            <p className="text-base font-semibold leading-7">{sentences.marketSentence}</p>
            <p className="text-sm leading-6 text-muted-foreground">{sentences.sectorSentence}</p>
          </div>
          <div className="mt-5 text-[11px] font-semibold text-muted-foreground">사실</div>
          <dl className="mt-2 grid gap-2 sm:grid-cols-3">
            <Metric label="주간 일평균 거래대금" value={formatBriefingMoney(week.market.averageDollarVolume)} />
            <Metric label="상승 종목 비중" value={week.market.advancingShare == null ? "자료 없음" : `${week.market.advancingShare.toFixed(1)}%`} />
            <Metric label="거래일" value={`${week.tradingDays}일`} />
          </dl>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="rounded-lg border p-4" aria-labelledby="weekly-index-title">
              <h2 id="weekly-index-title" className="text-sm font-semibold">주요 지수</h2>
              <ul className="mt-3 space-y-2">
                {week.indices.map((row) => <li key={row.symbol} className="flex justify-between text-sm"><span>{row.name}</span><strong>{row.change == null ? "비교 자료 없음" : `${row.change > 0 ? "+" : ""}${row.change.toFixed(2)}%`}</strong></li>)}
              </ul>
            </section>
            <section className="rounded-lg border p-4" aria-labelledby="weekly-active-title">
              <h2 id="weekly-active-title" className="text-sm font-semibold">주간 거래대금 상위</h2>
              <ul className="mt-3 space-y-2">
                {week.activeStocks.slice(0, 5).map((row) => <li key={row.ticker} className="flex justify-between text-sm"><span><strong className="font-mono">{row.ticker}</strong> <span className="text-xs text-muted-foreground">{row.name}</span></span><span>{formatBriefingMoney(row.dollarVolume)}</span></li>)}
              </ul>
            </section>
          </div>
          <footer className="mt-6 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">데이터 안내 · 기준일 {week.endDate} · {BRIEFING_DISCLAIMER}</footer>
        </CardContent>
      </Card>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-muted/20 px-3 py-2.5"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 text-sm font-semibold tabular">{value}</dd></div>;
}

export function LatestDailyBriefing({ marketData }: { marketData: unknown }) {
  const snapshot = useMemo(
    () => buildReplaySnapshotFromMarketData(marketData),
    [marketData],
  );
  if (!snapshot)
    return <div role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-5 text-sm">장 마감 브리핑을 계산하지 못했습니다. 아래 시장 데이터는 계속 확인할 수 있습니다.</div>;
  return (
    <DailyBriefingView
      snapshot={snapshot}
      entryPoint="today"
      delayed={LIVE_META.status === "stale" || LIVE_META.status === "partial"}
      compact
    />
  );
}
