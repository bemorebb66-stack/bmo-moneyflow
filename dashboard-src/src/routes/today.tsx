import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  TrendingUp,
  Search,
  Users,
  CalendarClock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DeltaText } from "@/components/signal-badge";
import { cn } from "@/lib/utils";
import {
  SECTORS,
  SURGE_STOCKS,
  INSIDER_ROWS,
  LOCKUP_ROWS,
  LIVE_META,
  LIVE_STOCKS,
} from "@/lib/mock-data";
import { fmtBp, fmtMoney, fmtPct } from "@/lib/format";
import { ShareMenu } from "@/components/share-menu";
import { DailyMarketAnalysis } from "@/components/daily-market-analysis";

export const Route = createFileRoute("/today")({
  head: () => ({
    meta: [
      { title: "오늘의 미국 시장 거래대금 요약 | BVT Money Flow" },
      {
        name: "description",
        content:
          "섹터 자금 흐름, 종목 스캐너, 내부자 거래, IPO 락업의 오늘의 핵심을 한 화면에서.",
      },
      { property: "og:title", content: "오늘의 미국 시장 요약" },
      {
        property: "og:description",
        content: "네 개 데이터의 핵심 카드를 한눈에 살펴보세요.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/today/" }],
  }),
  component: TodayPage,
});

function TodayPage() {
  const topSector = [...SECTORS].sort((a, b) => b.shareDelta - a.shareDelta)[0];
  const bottomSector = [...SECTORS].sort((a, b) => a.shareDelta - b.shareDelta)[0];
  const todayStocks = LIVE_STOCKS.length ? LIVE_STOCKS : SURGE_STOCKS;
  const surgeTop = [...todayStocks]
    .filter((s) => (s.volumeVs?.["1d"] ?? 0) > 0)
    .sort((a, b) => (b.volumeVs?.["1d"] ?? 0) - (a.volumeVs?.["1d"] ?? 0))
    .slice(0, 3);
  const dailyVolumeGainers = todayStocks.filter((s) => (s.volumeVs?.["1d"] ?? 0) > 0).length;
  const totalVolume = todayStocks.reduce((sum, stock) => sum + stock.volume, 0);
  const previousTotalVolume = todayStocks.reduce((sum, stock) => {
    const change = stock.volumeVs?.["1d"];
    return change == null || change <= -100 ? sum : sum + stock.volume / (1 + change / 100);
  }, 0);
  const totalVolumeChange = previousTotalVolume ? (totalVolume / previousTotalVolume - 1) * 100 : 0;
  const insiderTop = INSIDER_ROWS.filter((row) => row.tradeDate === LIVE_META.asOf)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 3);
  const lockupSoon = [...LOCKUP_ROWS]
    .filter((r) => r.daysLeft >= 0 && r.daysLeft <= 7)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 3);

  return (
    <PageShell>
      <PageHeading
        title="오늘의 요약"
        description="장 마감 기준 네 가지 데이터의 핵심을 한 화면에서 확인하세요."
      />
      <div className="-mt-2 mb-4 flex justify-end">
        <ShareMenu label="오늘의 요약 공유" />
      </div>

      <section
        aria-label="핵심 결론"
        className="mb-5 rounded-xl border border-border/70 bg-surface p-4 sm:p-5"
      >
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          오늘의 한 줄
        </div>
        <p className="mt-1.5 text-base font-semibold sm:text-lg">
          전일 대비 거래대금 점유율은 <span className="text-success">{topSector.name} {fmtBp(topSector.shareDelta)}</span>,{" "}
          <span className="text-danger">{bottomSector.name} {fmtBp(bottomSector.shareDelta)}</span>로 변했습니다.
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          전체 거래대금 {fmtMoney(totalVolume)} · 전일 대비 {fmtPct(totalVolumeChange, 1)} · 거래대금 증가 종목 {dailyVolumeGainers}개 · 기준일 내부자 거래{" "}
          {insiderTop.length}건 · 7일 내 락업 해제{" "}
          {lockupSoon.length}건이 예정되어 있습니다.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          icon={TrendingUp}
          title="시장 흐름"
          subtitle="전일 대비 섹터 거래대금 점유율 변화"
          to="/"
          linkLabel="전체 대시보드로"
          className="lg:col-span-2"
        >
          <ul className="grid gap-x-8 sm:grid-cols-2">
            {[topSector, bottomSector].map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular">
                    거래대금 {fmtMoney(s.volume)} · 점유율 {s.share.toFixed(1)}%
                  </div>
                </div>
                <DeltaText value={s.shareDelta} suffix=" bp" digits={0} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          icon={Search}
          title="종목 스캐너"
          subtitle="전일 대비 거래대금 증가 상위"
          to="/scanner"
          linkLabel="스캐너로"
        >
          <ul className="divide-y divide-border/70">
            {surgeTop.map((s) => (
              <li key={s.ticker} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px] font-semibold tabular">
                      {s.ticker}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {s.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular">
                    거래대금 {fmtMoney(s.volume)} · 전일 대비 {fmtPct(s.volumeVs?.["1d"] ?? 0, 1)}
                  </div>
                </div>
                <DeltaText value={s.change} />
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard
          icon={Users}
          title="내부자 거래"
          subtitle={`${LIVE_META.asOf} 거래일 기준`}
          to="/insider"
          linkLabel="내부자 거래로"
        >
          <ul className="divide-y divide-border/70">
            {insiderTop.map((r, i) => (
              <li key={i} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px] font-semibold tabular">
                      {r.ticker}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.insider} ({r.role})
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular">
                    거래일 {r.tradeDate}
                  </div>
                </div>
                <span
                  className={cn(
                    "text-xs font-medium tabular",
                    r.type === "buy" ? "text-success" : "text-danger",
                  )}
                >
                  {r.type === "buy" ? "매수" : "매도"} {fmtMoney(r.amount)}
                </span>
              </li>
            ))}
            {insiderTop.length === 0 && (
              <li className="py-5 text-center text-sm text-muted-foreground">
                기준일에 확인된 내부자 거래가 없습니다.
              </li>
            )}
          </ul>
        </SectionCard>

        <SectionCard
          icon={CalendarClock}
          title="IPO 락업"
          subtitle="D-7 이내 해제 이벤트"
          to="/ipo-lockup"
          linkLabel="IPO 락업으로"
        >
          <ul className="divide-y divide-border/70">
            {lockupSoon.map((r) => (
              <li key={r.ticker} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[13px] font-semibold tabular">
                      {r.ticker}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {r.company}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular">
                    해제일 {r.unlockDate} · {r.estValue > 0 ? fmtMoney(r.estValue) : "가치 미수집"}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular",
                    r.daysLeft <= 7
                      ? "border-danger/25 bg-danger/10 text-danger"
                      : "border-info/25 bg-info/10 text-info",
                  )}
                >
                  D-{r.daysLeft}
                </span>
              </li>
            ))}
            {lockupSoon.length === 0 && (
              <li className="py-5 text-center text-sm text-muted-foreground">
                7일 내 예정된 락업 해제가 없습니다.
              </li>
            )}
          </ul>
        </SectionCard>
      </div>

      <DailyMarketAnalysis />

      <p className="mt-5 text-[11px] text-muted-foreground">
        장 마감 데이터와 SEC 공시를 기준으로 정리했습니다. 실제 투자 판단은 원본 공시와 실시간 데이터를 함께 확인하세요. 점유율 확대 1위 {topSector.name} {fmtBp(topSector.shareDelta)}.
      </p>
    </PageShell>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  to,
  linkLabel,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  to: string;
  linkLabel: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{title}</div>
            <div className="text-[11px] text-muted-foreground">{subtitle}</div>
          </div>
          <Link
            to={to}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            {linkLabel}
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="mt-3">{children}</div>
      </CardContent>
    </Card>
  );
}
