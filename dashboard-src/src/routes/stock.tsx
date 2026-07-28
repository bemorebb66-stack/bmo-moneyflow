import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarClock,
  ChartNoAxesCombined,
  ExternalLink,
  Globe2,
  Newspaper,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { PageShell } from "@/components/page-shell";
import { DataStatusBar } from "@/components/data-status-bar";
import { SignalBadge } from "@/components/signal-badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fmtMcap, fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import {
  loadStockDirectory,
  type DirectoryStock,
} from "@/lib/stock-directory";
import {
  EARNINGS_ROWS,
  COMPANY_NEWS,
  generateSeries,
  INSIDER_ROWS,
  LIVE_MARKET_DATA,
  LIVE_META,
  LIVE_STOCKS,
  LOCKUP_ROWS,
  type MarketPeriod,
  type StockRow,
} from "@/lib/mock-data";

export const Route = createFileRoute("/stock")({
  head: () => ({
    meta: [
      { title: "미국 주식 종목별 거래대금 분석 | BVT Money Flow" },
      {
        name: "description",
        content:
          "미국 주식의 가격, 시가총액, 섹터와 1일·5일·20일·60일 거래대금 변화를 종목별로 확인합니다.",
      },
      { property: "og:title", content: "미국 주식 종목별 거래대금 분석" },
      {
        property: "og:description",
        content:
          "시장 흐름에서 섹터와 실제 종목까지 한 번에 내려가 살펴보세요.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/stock/" }],
  }),
  component: StockPage,
});

const PERIODS: { id: MarketPeriod; label: string }[] = [
  { id: "1d", label: "1일 대비" },
  { id: "5d", label: "5일 대비" },
  { id: "20d", label: "20일 대비" },
  { id: "60d", label: "60일 대비" },
];

const COMPANY_SUMMARIES: Record<string, string> = {
  NVDA: "AI 연산용 GPU와 데이터센터 가속기를 설계하는 반도체 기업입니다.",
  MSFT: "클라우드, 업무용 소프트웨어와 AI 서비스를 제공하는 글로벌 기술 기업입니다.",
  AAPL: "아이폰·맥·웨어러블과 디지털 서비스를 제공하는 소비자 기술 기업입니다.",
  META: "페이스북·인스타그램과 디지털 광고, AI 플랫폼을 운영하는 기업입니다.",
  TSLA: "전기차와 에너지 저장장치, 자율주행 기술을 개발하는 기업입니다.",
  AMD: "CPU와 GPU, 데이터센터 반도체를 설계하는 팹리스 기업입니다.",
  GOOGL: "검색·광고·유튜브·클라우드와 AI 서비스를 운영하는 기업입니다.",
  BE: "연료전지 기반 분산형 전력 시스템을 개발하는 청정에너지 기업입니다.",
  CRDO: "데이터센터의 고속 연결을 위한 반도체와 네트워크 솔루션을 설계하는 기업입니다.",
};

function formatNewsDate(timestamp: number) {
  if (!timestamp) return "날짜 미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function StockPage() {
  const ticker =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search)
          .get("ticker")
          ?.trim()
          .toUpperCase() ?? "");
  const stock = LIVE_STOCKS.find((row) => row.ticker.toUpperCase() === ticker);
  const [directoryStock, setDirectoryStock] = useState<
    DirectoryStock | null | undefined
  >(undefined);

  useEffect(() => {
    if (stock) return;
    if (!ticker) {
      setDirectoryStock(null);
      return;
    }
    void loadStockDirectory().then((rows) => {
      setDirectoryStock(
        rows.find((row) => row.ticker.toUpperCase() === ticker) ?? null,
      );
    });
  }, [stock, ticker]);

  if (!stock) {
    if (directoryStock) {
      return (
        <PageShell>
          <div className="mx-auto max-w-2xl py-12">
            <Card>
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-brand-soft p-2 text-brand">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-brand">
                      {directoryStock.ticker}
                    </p>
                    <h1 className="mt-1 text-xl font-bold">
                      {directoryStock.name}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {[directoryStock.sector, directoryStock.industry]
                        .filter(Boolean)
                        .join(" · ") || "미국 상장 종목"}
                    </p>
                  </div>
                </div>
                <div className="mt-6 rounded-md border border-border bg-surface-2 p-4">
                  <h2 className="font-semibold">거래대금 분석 준비 중</h2>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    상장 종목으로 확인됐지만 아직 BVT 거래대금 분석 대상에는
                    포함되지 않았습니다. 데이터 요청을 남기면 수집 우선순위에
                    반영합니다.
                  </p>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a
                    href={`/feedback/?type=missing-stock&ticker=${encodeURIComponent(directoryStock.ticker)}`}
                    className="inline-flex min-h-10 items-center rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground"
                  >
                    이 종목 데이터 요청
                  </a>
                  <a
                    href={`https://finance.yahoo.com/quote/${encodeURIComponent(directoryStock.ticker)}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-semibold"
                  >
                    외부 시세 확인 <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
              </CardContent>
            </Card>
          </div>
        </PageShell>
      );
    }

    return (
      <PageShell>
        <div className="mx-auto max-w-xl py-16 text-center">
          <Building2 className="mx-auto h-9 w-9 text-muted-foreground" />
          <h1 className="mt-4 text-xl font-bold">종목을 찾지 못했습니다</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {directoryStock === undefined
              ? "미국 상장 종목 목록을 확인하고 있습니다."
              : "티커를 다시 확인하거나 데이터 요청을 남겨주세요."}
          </p>
          <a
            href="/scanner/"
            className="mt-5 inline-flex min-h-10 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground"
          >
            종목 스캐너로 이동 <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </PageShell>
    );
  }

  return <StockDetail stock={stock} />;
}

function CompanyLogo({
  ticker,
  name,
  preferredLogo,
}: {
  ticker: string;
  name: string;
  preferredLogo?: string;
}) {
  const sources = useMemo(
    () =>
      [
        preferredLogo,
        `https://financialmodelingprep.com/image-stock/${encodeURIComponent(ticker)}.png`,
      ].filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index,
      ),
    [preferredLogo, ticker],
  );
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => setSourceIndex(0), [preferredLogo, ticker]);

  const source = sources[sourceIndex];
  return (
    <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white shadow-sm sm:h-[72px] sm:w-[72px]">
      {source ? (
        <img
          src={source}
          alt={`${name} 회사 로고`}
          className="h-full w-full object-contain p-2"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setSourceIndex((current) => current + 1)}
        />
      ) : (
        <span className="px-1 text-center font-mono text-sm font-bold text-slate-700">
          {ticker.slice(0, 5)}
        </span>
      )}
    </div>
  );
}

function StockDetail({ stock }: { stock: StockRow }) {
  const series = useMemo(
    () => generateSeries(`stock:${stock.ticker}`, 60),
    [stock.ticker],
  );
  const insiders = INSIDER_ROWS.filter((row) => row.ticker === stock.ticker);
  const companyNews = COMPANY_NEWS[stock.ticker];
  const lockup = LOCKUP_ROWS.find((row) => row.ticker === stock.ticker);
  const earnings = EARNINGS_ROWS.filter(
    (row) => row.ticker === stock.ticker,
  ).sort((a, b) => b.date.localeCompare(a.date));
  const nextEarnings = [...earnings]
    .filter((row) => row.date >= LIVE_META.asOf)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const recentEarnings = earnings
    .filter((row) => row.date <= LIVE_META.asOf && row.epsActual != null)
    .slice(0, 4);
  const sectorRow = LIVE_MARKET_DATA.sector["1d"].find(
    (row) => row.name === stock.sector,
  );
  const industryRow = LIVE_MARKET_DATA.industry["1d"].find(
    (row) => row.name === stock.industry,
  );
  const related = useMemo(() => {
    const sameIndustry = LIVE_STOCKS.filter(
      (row) =>
        row.ticker !== stock.ticker &&
        stock.industry &&
        row.industry === stock.industry,
    );
    const source =
      sameIndustry.length >= 4
        ? sameIndustry
        : LIVE_STOCKS.filter(
            (row) => row.ticker !== stock.ticker && row.sector === stock.sector,
          );
    return source.sort((a, b) => b.volume - a.volume).slice(0, 6);
  }, [stock]);
  const context = interpretStock(stock);
  const summary =
    COMPANY_SUMMARIES[stock.ticker] ??
    `${stock.industry || stock.sector} 분야에서 사업하는 미국 상장기업입니다.`;

  return (
    <PageShell>
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        <a
          href="/"
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 시장 흐름
        </a>
        <span>/</span>
        {sectorRow ? (
          <a
            href={`/#m=sector&p=1d&mt=idx&r=60&g=${encodeURIComponent(sectorRow.id)}`}
            className="hover:text-foreground"
          >
            {stock.sector}
          </a>
        ) : (
          <span>{stock.sector}</span>
        )}
        <span>/</span>
        {industryRow ? (
          <a
            href={`/#m=industry&p=1d&mt=idx&r=60&g=${encodeURIComponent(industryRow.id)}`}
            className="hover:text-foreground"
          >
            {stock.industry}
          </a>
        ) : (
          <span>{stock.industry || "산업 미분류"}</span>
        )}
      </div>

      <header className="mb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <CompanyLogo
              ticker={stock.ticker}
              name={stock.name}
              preferredLogo={companyNews?.logo}
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-brand/10 px-2 py-1 font-mono text-sm font-bold text-brand">
                  {stock.ticker}
                </span>
                <SignalBadge signal={stock.signal} />
              </div>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
                {stock.name}
              </h1>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                {summary}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {companyNews?.website && (
              <a
                href={companyNews.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:bg-secondary"
              >
                <Globe2 className="h-3.5 w-3.5" /> 공식 홈페이지
              </a>
            )}
            <a
              href={`/scanner/?ticker=${encodeURIComponent(stock.ticker)}`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:bg-secondary"
            >
              스캐너에서 보기
            </a>
            <a
              href={`https://finance.yahoo.com/quote/${stock.ticker}/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:bg-secondary"
            >
              가격 정보 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
        <DataStatusBar />
      </header>

      <section
        aria-label="종목 핵심 지표"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
      >
        <StatCard
          label="현재가"
          value={`$${fmtPrice(stock.price)}`}
          tone={stock.change}
          hint={fmtPct(stock.change)}
        />
        <StatCard
          label="거래대금"
          value={fmtMoney(stock.volume)}
          hint="당일 가격×거래량"
        />
        <StatCard
          label="시가총액"
          value={fmtMcap(stock.marketCap)}
          hint={stock.sector}
        />
        {PERIODS.map(({ id, label }) => (
          <StatCard
            key={id}
            label={label}
            value={fmtPct(stock.volumeVs?.[id] ?? 0)}
            tone={stock.volumeVs?.[id] ?? 0}
            hint="평균 거래대금 기준"
          />
        ))}
      </section>

      <section
        className={cn(
          "mt-4 rounded-lg border px-4 py-3",
          context.tone === "success"
            ? "border-success/25 bg-success/5"
            : context.tone === "danger"
              ? "border-danger/25 bg-danger/5"
              : "border-info/25 bg-info/5",
        )}
      >
        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
          FLOW CONTEXT
        </div>
        <h2 className="mt-1 text-base font-semibold">{context.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {context.description}
        </p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <Card>
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                  VOLUME TREND
                </div>
                <h2 className="mt-1 text-base font-semibold sm:text-lg">
                  60일 거래대금 상대 흐름
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  첫 거래일을 100으로 지수화한 상대 변화
                </p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                최근값{" "}
                <span className="font-semibold text-foreground">
                  {series.at(-1)?.value.toFixed(1)}
                </span>
              </div>
            </div>
            <div className="mt-4 h-[300px] w-full sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series}
                  margin={{ top: 8, right: 12, bottom: 4, left: -12 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    opacity={0.55}
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    stroke="var(--color-muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    domain={["auto", "auto"]}
                    width={48}
                  />
                  <ReferenceLine
                    y={100}
                    stroke="var(--color-muted-foreground)"
                    strokeDasharray="4 4"
                    opacity={0.7}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "var(--color-popover)",
                      border: "1px solid var(--color-border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [value.toFixed(1), "지수"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    name={stock.ticker}
                    stroke="var(--color-brand)"
                    strokeWidth={2.25}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="text-base font-semibold">기업 분류</h2>
              <dl className="mt-3 divide-y divide-border/70 text-sm">
                <Detail label="대분류 섹터" value={stock.sector} />
                <Detail label="세부 산업" value={stock.industry || "미분류"} />
                <Detail
                  label="시장 점유율"
                  value={`${((stock.volume / LIVE_STOCKS.reduce((sum, row) => sum + row.volume, 0)) * 100).toFixed(2)}%`}
                />
                <Detail
                  label="20일 거래 강도"
                  value={`${stock.volumeRatio.toFixed(2)}배`}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h2 className="text-base font-semibold">관련 데이터</h2>
              <div className="mt-3 space-y-2">
                <ContextLink
                  href="/today/#event-calendar"
                  icon={<ChartNoAxesCombined className="h-4 w-4" />}
                  title="실적 발표"
                  description={
                    nextEarnings
                      ? `${nextEarnings.date} · ${earningsHourLabel(nextEarnings.hour)}`
                      : recentEarnings.length
                        ? `최근 실적 ${recentEarnings[0].date}`
                        : "수집된 실적 일정 없음"
                  }
                />
                <ContextLink
                  href={`/insider/?ticker=${stock.ticker}`}
                  icon={<Users className="h-4 w-4" />}
                  title="내부자 거래"
                  description={
                    insiders.length
                      ? `${insiders.length}건의 공시 데이터`
                      : "확인된 최근 공시 없음"
                  }
                />
                <ContextLink
                  href={`/ipo-lockup/?ticker=${stock.ticker}`}
                  icon={<CalendarClock className="h-4 w-4" />}
                  title="IPO 락업"
                  description={
                    lockup
                      ? `${lockup.unlockDate} · D-${Math.max(0, lockup.daysLeft)}`
                      : "예정된 락업 이벤트 없음"
                  }
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card id="earnings" className="mt-5">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                EARNINGS
              </div>
              <h2 className="mt-1 text-base font-semibold sm:text-lg">
                실적 발표와 예상치 비교
              </h2>
              <p className="text-[11px] text-muted-foreground">
                EPS·매출 실제치와 시장 예상치 · Finnhub 기준
              </p>
            </div>
            {nextEarnings && (
              <div className="rounded-md border border-success/25 bg-success/5 px-3 py-2 text-xs">
                <span className="text-muted-foreground">다음 발표 </span>
                <strong className="ml-1 tabular">
                  {nextEarnings.date} · {earningsHourLabel(nextEarnings.hour)}
                </strong>
              </div>
            )}
          </div>
          {recentEarnings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-xs">
                <thead className="bg-surface-2 text-[10px] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium sm:px-5">발표일</th>
                    <th className="px-4 py-2.5 font-medium">EPS 실제</th>
                    <th className="px-4 py-2.5 font-medium">EPS 예상</th>
                    <th className="px-4 py-2.5 font-medium">EPS 서프라이즈</th>
                    <th className="px-4 py-2.5 font-medium">매출 실제</th>
                    <th className="px-4 py-2.5 font-medium">매출 예상</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {recentEarnings.map((row) => {
                    const surprise = earningsSurprise(
                      row.epsActual,
                      row.epsEstimate,
                    );
                    return (
                      <tr key={`${row.ticker}-${row.date}`}>
                        <td className="px-4 py-3 font-medium tabular sm:px-5">
                          {row.date}
                        </td>
                        <td className="px-4 py-3 tabular">
                          {row.epsActual == null
                            ? "-"
                            : `$${row.epsActual.toFixed(2)}`}
                        </td>
                        <td className="px-4 py-3 tabular text-muted-foreground">
                          {row.epsEstimate == null
                            ? "-"
                            : `$${row.epsEstimate.toFixed(2)}`}
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 font-semibold tabular",
                            surprise != null && surprise > 0 && "text-success",
                            surprise != null && surprise < 0 && "text-danger",
                          )}
                        >
                          {surprise == null ? "-" : fmtPct(surprise)}
                        </td>
                        <td className="px-4 py-3 tabular">
                          {row.revenueActual == null
                            ? "-"
                            : fmtMoney(row.revenueActual / 1e6)}
                        </td>
                        <td className="px-4 py-3 tabular text-muted-foreground">
                          {row.revenueEstimate == null
                            ? "-"
                            : fmtMoney(row.revenueEstimate / 1e6)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              아직 수집된 실적 발표 데이터가 없습니다.
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="news" className="mt-5">
        <CardContent className="p-0">
          <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                LATEST NEWS
              </div>
              <h2 className="mt-1 text-base font-semibold sm:text-lg">
                최신 뉴스
              </h2>
              <p className="text-[11px] text-muted-foreground">
                최근 헤드라인만 빠르게 확인하고 원문에서 상세 내용을 확인하세요.
              </p>
            </div>
            <a
              href={`https://finance.yahoo.com/quote/${encodeURIComponent(stock.ticker)}/news/`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
            >
              뉴스 전체 보기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          {companyNews?.news?.length ? (
            <ul className="divide-y divide-border/70">
              {companyNews.news.map((item) => (
                <li key={`${item.datetime}-${item.url}`}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="group flex items-start gap-3 px-4 py-3 hover:bg-secondary/50 sm:px-5"
                  >
                    <div className="mt-0.5 rounded-md bg-brand/10 p-2 text-brand">
                      <Newspaper className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-5 group-hover:text-brand">
                        {item.headline}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {item.source} · {formatNewsDate(item.datetime)}
                      </p>
                    </div>
                    <ExternalLink className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              <p>최근 수집된 뉴스가 없습니다.</p>
              <a
                href={`https://finance.yahoo.com/quote/${encodeURIComponent(stock.ticker)}/news/`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
              >
                {stock.ticker} 외부 뉴스 확인
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-0">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
              RELATED STOCKS
            </div>
            <h2 className="mt-1 text-base font-semibold sm:text-lg">
              같이 비교할 종목
            </h2>
            <p className="text-[11px] text-muted-foreground">
              {stock.industry || stock.sector} 기준 · 거래대금 상위
            </p>
          </div>
          <div className="divide-y divide-border/70">
            {related.map((row) => (
              <a
                key={row.ticker}
                href={`/stock/?ticker=${row.ticker}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 hover:bg-secondary/50 sm:grid-cols-[minmax(220px,1fr)_1fr_1fr_auto] sm:px-5"
              >
                <div className="min-w-0">
                  <span className="font-mono text-sm font-bold">
                    {row.ticker}
                  </span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {row.name}
                  </span>
                </div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  {row.industry || row.sector}
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">
                    20일 대비
                  </div>
                  <div
                    className={cn(
                      "text-sm font-semibold tabular",
                      (row.volumeVs?.["20d"] ?? 0) > 0
                        ? "text-success"
                        : "text-danger",
                    )}
                  >
                    {fmtPct(row.volumeVs?.["20d"] ?? 0)}
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </a>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function earningsHourLabel(hour: "bmo" | "amc" | "dmh" | "") {
  if (hour === "bmo") return "장전";
  if (hour === "amc") return "장후";
  if (hour === "dmh") return "장중";
  return "시간 미정";
}

function earningsSurprise(actual?: number, estimate?: number) {
  if (actual == null || estimate == null || estimate === 0) return null;
  return ((actual - estimate) / Math.abs(estimate)) * 100;
}

function interpretStock(stock: StockRow) {
  const volume20 = stock.volumeVs?.["20d"] ?? (stock.volumeRatio - 1) * 100;
  if (volume20 >= 30 && stock.change > 0)
    return {
      tone: "success",
      title: "평소보다 많은 거래가 주가 상승과 함께 나타났습니다",
      description:
        "시장 참여가 뚜렷하게 늘어난 구간입니다. 거래대금 증가는 관심 확대를 의미하지만 상승 지속을 보장하지는 않습니다.",
    } as const;
  if (volume20 >= 30 && stock.change < 0)
    return {
      tone: "danger",
      title: "거래가 늘었지만 주가는 하락했습니다",
      description:
        "매수와 매도가 모두 활발해진 변동성 구간일 수 있습니다. 거래대금 증가를 순매수로 해석하지 않도록 주의하세요.",
    } as const;
  if (volume20 <= -20)
    return {
      tone: "info",
      title: "최근 평균보다 거래 관심이 감소했습니다",
      description:
        "현재 거래대금이 20일 평균을 크게 밑돕니다. 관심 회복 여부는 1일·5일 지표와 함께 확인하는 편이 좋습니다.",
    } as const;
  return {
    tone: "info",
    title: "거래대금과 가격에서 뚜렷한 방향은 아직 없습니다",
    description:
      "평균적인 거래 구간입니다. 단기 변화보다 20일·60일 흐름과 같은 산업의 다른 종목을 함께 비교해 보세요.",
  } as const;
}

function StatCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: number;
}) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 text-lg font-semibold tabular",
            tone !== undefined && tone > 0 && "text-success",
            tone !== undefined && tone < 0 && "text-danger",
          )}
        >
          {value}
        </div>
        <div className="mt-1 truncate text-[10px] text-muted-foreground">
          {hint}
        </div>
      </CardContent>
    </Card>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-right text-xs font-semibold tabular">{value}</dd>
    </div>
  );
}

function ContextLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-md border border-border/70 px-3 py-2 hover:bg-secondary/50"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand/10 text-brand">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold">{title}</span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </a>
  );
}
