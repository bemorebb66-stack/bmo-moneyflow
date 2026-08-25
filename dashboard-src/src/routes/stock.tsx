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
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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
import { AccessibleChart } from "@/components/accessible-chart";
import { fmtMcap, fmtMoney, fmtPct, fmtQuote } from "@/lib/format";
import {
  DataPageFallback,
  DataSectionState,
  DataSourcesStatus,
} from "@/components/data-source-state";
import {
  ROUTE_DATA_SOURCES,
  hasUsableSourceData,
  useDataSources,
  type DataSourceState,
} from "@/lib/data-runtime";
import { loadStockDirectory, type DirectoryStock } from "@/lib/stock-directory";
import { SaveStockButton } from "@/components/save-stock-button";
import {
  EARNINGS_ROWS,
  COMPANY_NEWS,
  INSIDER_ROWS,
  LIVE_MARKET_DATA,
  LIVE_META,
  LIVE_STOCKS,
  LIVE_STOCK_VOLUME_SERIES,
  LOCKUP_ROWS,
  NEWS_META,
  type MarketPeriod,
  type StockRow,
} from "@/lib/mock-data";
import {
  buildVolumeTrend,
  calculateVolumeMomentum,
  isLatestVolumeBreakout20,
  volumeMomentumLabel,
} from "@/lib/volume-analysis";

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
  component: LegacyStockPage,
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

function formatNewsGeneratedAt(value: string) {
  if (!value) return "수집 시각 미확인";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "수집 시각 미확인";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(parsed);
}

function companyXSearchUrl(ticker: string) {
  return `https://x.com/search?q=${encodeURIComponent(`$${ticker}`)}&src=typed_query&f=live`;
}

function companyIrSearchUrl(website: string | undefined, name: string) {
  let domain = "";
  if (website) {
    try {
      domain = new URL(website).hostname.replace(/^www\./, "");
    } catch {
      domain = "";
    }
  }
  const query = domain
    ? `site:${domain} investor relations`
    : `${name} investor relations`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function LegacyStockPage() {
  const ticker =
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search)
          .get("ticker")
          ?.trim()
          .toUpperCase() ?? "");
  return <StockPage ticker={ticker} />;
}

export function StockPage({ ticker }: { ticker: string }) {
  const sourceStates = useDataSources(ROUTE_DATA_SOURCES.stock);
  const stock = LIVE_STOCKS.find((row) => row.ticker.toUpperCase() === ticker);
  const [directoryStock, setDirectoryStock] = useState<
    DirectoryStock | null | undefined
  >(undefined);

  useEffect(() => {
    if (!hasUsableSourceData(sourceStates.market)) return;
    if (stock) return;
    if (!ticker) {
      setDirectoryStock(null);
      return;
    }
    const controller = new AbortController();
    void loadStockDirectory(controller.signal).then((rows) => {
      if (!controller.signal.aborted) {
        setDirectoryStock(
          rows.find((row) => row.ticker.toUpperCase() === ticker) ?? null,
        );
      }
    });
    return () => controller.abort();
  }, [sourceStates.market.data, sourceStates.market.phase, stock, ticker]);

  if (!hasUsableSourceData(sourceStates.market)) {
    return (
      <DataPageFallback
        title="종목 상세"
        description="종목별 거래대금 변화와 가격 흐름, 주요 이벤트를 확인합니다."
        state={sourceStates.market}
      />
    );
  }

  if (!stock) {
    if (directoryStock) {
      const directoryNews = COMPANY_NEWS[directoryStock.ticker];
      return (
        <PageShell>
          <div className="mx-auto max-w-2xl py-12">
            <Card>
              <CardContent className="p-6 sm:p-8">
                <div className="flex items-start gap-4">
                  <CompanyLogo
                    ticker={directoryStock.ticker}
                    name={directoryStock.name}
                    preferredLogo={directoryNews?.logo}
                  />
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
                  <SaveStockButton ticker={directoryStock.ticker} showLabel />
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
                  {directoryNews?.website && (
                    <a
                      href={directoryNews.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border px-4 text-sm font-semibold"
                    >
                      공식 홈페이지 <Globe2 className="h-4 w-4" />
                    </a>
                  )}
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

  return <StockDetail stock={stock} sourceStates={sourceStates} />;
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

function StockDetail({
  stock,
  sourceStates,
}: {
  stock: StockRow;
  sourceStates: Record<
    (typeof ROUTE_DATA_SOURCES.stock)[number],
    DataSourceState
  >;
}) {
  const volumeTrend = useMemo(
    () =>
      buildVolumeTrend(
        (LIVE_STOCK_VOLUME_SERIES[stock.ticker] ?? []).slice(-60),
      ),
    [stock.ticker, sourceStates.history.lastSuccessAt],
  );
  const [volumeChartMode, setVolumeChartMode] = useState<"bar" | "line">("bar");
  const volumeMomentum = calculateVolumeMomentum(
    LIVE_STOCK_VOLUME_SERIES[stock.ticker] ?? [],
  );
  const volumeBreakout20 = isLatestVolumeBreakout20(
    LIVE_STOCK_VOLUME_SERIES[stock.ticker] ?? [],
  );
  const insiders = INSIDER_ROWS.filter((row) => row.ticker === stock.ticker);
  const companyNews = COMPANY_NEWS[stock.ticker];
  const lockup = LOCKUP_ROWS.find((row) => row.ticker === stock.ticker);
  const earnings = EARNINGS_ROWS.filter(
    (row) => row.ticker === stock.ticker,
  ).sort((a, b) => b.date.localeCompare(a.date));
  const earningsReferenceDate = latestReferenceDate();
  const nextEarnings = [...earnings]
    .filter(
      (row) =>
        row.epsActual == null &&
        row.revenueActual == null &&
        row.date >= earningsReferenceDate,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const awaitingEarnings = earnings.find(
    (row) =>
      row.epsActual == null &&
      row.revenueActual == null &&
      row.date < earningsReferenceDate,
  );
  const recentEarnings = earnings
    .filter(
      (row) =>
        row.epsActual != null ||
        row.revenueActual != null ||
        row.netIncomeActual != null,
    )
    .slice(0, 8);
  const earningsTier = earnings.find((row) => row.trackingTier)?.trackingTier;
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
      <DataSourcesStatus
        states={[
          sourceStates.market,
          sourceStates.history,
          sourceStates.insider,
          sourceStates.lockup,
          sourceStates.earnings,
          sourceStates.news,
        ]}
        className="mb-4"
      />
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
            <SaveStockButton ticker={stock.ticker} showLabel />
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
              href={companyIrSearchUrl(companyNews?.website, stock.name)}
              target="_blank"
              rel="noreferrer"
              title={`${stock.name} 투자자 관계 페이지 검색`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:bg-secondary"
            >
              IR 찾기 <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <a
              href={companyXSearchUrl(stock.ticker)}
              target="_blank"
              rel="noreferrer"
              title={`X에서 $${stock.ticker} 최신 게시물 검색`}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-semibold hover:bg-secondary"
            >
              X 실시간 검색 <ExternalLink className="h-3.5 w-3.5" />
            </a>
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
        className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7"
      >
        <StatCard
          label="현재가"
          value={fmtQuote(stock.price)}
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
        <div className="text-xs font-semibold text-brand">거래 흐름 해석</div>
        <h2 className="mt-1 text-base font-semibold">{context.title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {context.description}
        </p>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]">
        <DataSectionState state={sourceStates.history} minHeight="h-[420px]">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <div className="text-xs font-semibold text-brand">
                    거래대금 추이
                  </div>
                  <h2 className="mt-1 text-base font-semibold sm:text-lg">
                    60일 거래대금과 이동평균
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    일별 가격×거래량 · 5일·20일 단순이동평균
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-xs font-semibold",
                      volumeMomentum != null && volumeMomentum >= 65
                        ? "border-success/30 bg-success/5 text-success"
                        : "border-border text-muted-foreground",
                    )}
                  >
                    모멘텀{" "}
                    {volumeMomentum == null
                      ? "-"
                      : `${volumeMomentum}점 · ${volumeMomentumLabel(volumeMomentum)}`}
                  </span>
                  {volumeBreakout20 && (
                    <span className="rounded-md border border-warning/35 bg-warning/10 px-2.5 py-1.5 text-xs font-semibold text-warning">
                      최신 20일선 상향 돌파
                    </span>
                  )}
                  <div
                    className="inline-flex rounded-md border border-border bg-background p-0.5"
                    role="group"
                    aria-label="거래대금 차트 표시 방식"
                  >
                    {(
                      [
                        ["bar", "막대"],
                        ["line", "선"],
                      ] as const
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={volumeChartMode === mode}
                        onClick={() => setVolumeChartMode(mode)}
                        className={cn(
                          "min-h-9 rounded px-3 text-xs font-semibold",
                          volumeChartMode === mode
                            ? "bg-brand text-brand-foreground"
                            : "text-muted-foreground hover:bg-secondary",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {volumeTrend.length >= 20 ? (
                <AccessibleChart
                  title={`${stock.name} 60일 거래대금과 이동평균`}
                  description="날짜별 거래대금과 5일·20일 단순이동평균을 표시합니다. 가격 추세나 매수·매도 신호가 아닙니다."
                  table={
                    <table className="w-full min-w-80 text-sm">
                      <caption className="sr-only">
                        {stock.name} 60일 거래대금과 이동평균
                      </caption>
                      <thead className="sticky top-0 bg-surface-2 text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">날짜</th>
                          <th className="px-3 py-2 text-right">거래대금</th>
                          <th className="px-3 py-2 text-right">5일 평균</th>
                          <th className="px-3 py-2 text-right">20일 평균</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {volumeTrend.map((row) => (
                          <tr key={row.date}>
                            <td className="px-3 py-2">{row.date}</td>
                            <td className="px-3 py-2 text-right tabular">
                              {fmtMoney(row.value)}
                            </td>
                            <td className="px-3 py-2 text-right tabular">
                              {row.ma5 == null ? "-" : fmtMoney(row.ma5)}
                            </td>
                            <td className="px-3 py-2 text-right tabular">
                              {row.ma20 == null ? "-" : fmtMoney(row.ma20)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  }
                >
                  <div className="mt-4 h-[300px] w-full sm:h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={volumeTrend}
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
                          width={48}
                          tickFormatter={(value) =>
                            value >= 1000
                              ? `${(value / 1000).toFixed(0)}B`
                              : `${value.toFixed(0)}M`
                          }
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "var(--color-popover)",
                            border: "1px solid var(--color-border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(value: number, name: string) => [
                            fmtMoney(value),
                            name,
                          ]}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        {volumeChartMode === "bar" ? (
                          <Bar
                            dataKey="value"
                            name="일별 거래대금"
                            fill="var(--color-brand)"
                            fillOpacity={0.42}
                            radius={[2, 2, 0, 0]}
                          />
                        ) : (
                          <Line
                            type="monotone"
                            dataKey="value"
                            name="일별 거래대금"
                            stroke="var(--color-brand)"
                            strokeWidth={1.5}
                            dot={false}
                          />
                        )}
                        <Line
                          type="monotone"
                          dataKey="ma5"
                          name="5일 평균"
                          stroke="var(--color-chart-2)"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="ma20"
                          name="20일 평균"
                          stroke="var(--color-warning)"
                          strokeWidth={2.25}
                          dot={false}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </AccessibleChart>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                  20거래일 이상의 거래대금 이력이 없어 이동평균을 계산할 수
                  없습니다.
                </div>
              )}
              <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
                모멘텀 점수는 최신 거래대금의 20일 평균 대비 강도(50점), 5일
                평균의 20일 평균 대비 추세(30점), 최근 5일 지속성(20점)을
                합산합니다. 화면 알림이며 투자 추천이 아닙니다.
              </p>
            </CardContent>
          </Card>
        </DataSectionState>

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
                      : awaitingEarnings
                        ? `${awaitingEarnings.date} 결과 갱신 대기`
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

      <DataSectionState state={sourceStates.earnings} minHeight="mt-5 h-48">
        <Card id="earnings" className="mt-5">
          <CardContent className="p-0">
            <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <div className="text-xs font-semibold text-brand">실적</div>
                <h2 className="mt-1 text-base font-semibold sm:text-lg">
                  발표된 분기 실적 추이
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  최근 발표된 실제 매출·순이익·순이익률 · Yahoo Finance·Finnhub·기업 IR 기준
                </p>
                {earningsTier && (
                  <p className="mt-1 text-[10px] font-medium text-brand">
                    {earningsTrackingLabel(earningsTier)}
                  </p>
                )}
              </div>
              {nextEarnings && (
                <div className="rounded-md border border-success/25 bg-success/5 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">다음 발표 </span>
                  <strong className="ml-1 tabular">
                    {nextEarnings.date} · {earningsHourLabel(nextEarnings.hour)}
                  </strong>
                  <span className="ml-2 text-success">
                    {nextEarnings.confirmed ? "공식 일정" : "발표 예정"}
                  </span>
                </div>
              )}
              {!nextEarnings && awaitingEarnings && (
                <div className="rounded-md border border-warning/25 bg-warning/5 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">최근 발표 </span>
                  <strong className="ml-1 tabular">
                    {awaitingEarnings.date}
                  </strong>
                  <span className="ml-2 text-warning">결과 갱신 대기</span>
                </div>
              )}
            </div>
            {recentEarnings.length > 0 ? (
              <div>
                <ReportedEarningsChart
                  ticker={stock.ticker}
                  rows={recentEarnings}
                />
                <div className="overflow-x-auto border-t border-border/70">
                  <table className="w-full min-w-[680px] text-left text-xs">
                    <thead className="bg-surface-2 text-[10px] text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 font-medium sm:px-5">
                          발표일
                        </th>
                        <th className="px-4 py-2.5 font-medium">EPS 실제</th>
                        <th className="px-4 py-2.5 font-medium">EPS 예상</th>
                        <th className="px-4 py-2.5 font-medium">
                          EPS 서프라이즈
                        </th>
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
                                surprise != null &&
                                  surprise > 0 &&
                                  "text-success",
                                surprise != null &&
                                  surprise < 0 &&
                                  "text-danger",
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
              </div>
            ) : (
              <div className="px-5 py-8 text-center text-sm text-muted-foreground">
                <p>
                  {nextEarnings
                    ? "예정된 실적 발표는 있으나 아직 실제치가 공개되지 않았습니다."
                    : awaitingEarnings
                      ? "실적 발표 일정은 확인됐으며 EPS·매출 실제치를 갱신하고 있습니다."
                      : "아직 수집된 실적 발표 데이터가 없습니다."}
                </p>
                <p className="mt-1 text-xs">
                  S&P 500·Nasdaq 100과 양자·디지털자산·인기 소형주를 우선
                  추적합니다.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </DataSectionState>

      <DataSectionState state={sourceStates.news} minHeight="mt-5 h-48">
        <Card id="news" className="mt-5">
          <CardContent className="p-0">
            <div className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 sm:flex-row sm:items-end sm:justify-between sm:px-5">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                  최신 뉴스
                </div>
                <h2 className="mt-1 text-base font-semibold sm:text-lg">
                  최신 뉴스
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {companyNews?.news?.length
                    ? `${companyNews.news.length}개 · 한국어 한 줄 요약 · ${formatNewsGeneratedAt(NEWS_META.generatedAt)} 수집`
                    : `BVT 우선 수집 ${NEWS_META.tickerCount || 240}개 종목 · 외부 뉴스로 이어서 확인할 수 있습니다.`}
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
                        <div className="flex flex-wrap items-center gap-1.5">
                          {item.topic && (
                            <span className="rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {item.topic}
                            </span>
                          )}
                          {item.sentiment && (
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                item.sentiment === "positive"
                                  ? "bg-success/10 text-success"
                                  : item.sentiment === "negative"
                                    ? "bg-danger/10 text-danger"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {item.sentiment === "positive"
                                ? "긍정"
                                : item.sentiment === "negative"
                                  ? "부정"
                                  : "중립"}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-[10px] font-semibold text-brand">
                          한 줄 요약
                        </p>
                        <p className="mt-0.5 text-sm font-semibold leading-5 group-hover:text-brand">
                          {item.summaryKo || item.headlineKo || item.headline}
                        </p>
                        {(item.summaryKo || item.headlineKo) && (
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                            영문 헤드라인: {item.headline}
                          </p>
                        )}
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
                <p className="mt-1 text-xs">
                  뉴스가 없거나 현재 BVT 우선 수집 대상 밖에 있는 종목입니다.
                </p>
                <a
                  href={`https://finance.yahoo.com/quote/${encodeURIComponent(stock.ticker)}/news/`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  {stock.ticker} 외부 뉴스 확인
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                <a
                  href={companyXSearchUrl(stock.ticker)}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-4 mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
                >
                  X 실시간 검색
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </DataSectionState>

      <Card className="mt-5">
        <CardContent className="p-0">
          <div className="border-b border-border/70 px-4 py-3 sm:px-5">
            <div className="text-xs font-semibold text-brand">비교 종목</div>
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

function latestReferenceDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const easternToday = `${value.year}-${value.month}-${value.day}`;
  return [LIVE_META.asOf, easternToday].sort().at(-1) || LIVE_META.asOf;
}

function earningsTrackingLabel(
  tier: "core-index" | "theme" | "popular-small-cap" | "calendar",
) {
  if (tier === "core-index") return "S&P 500·Nasdaq 100 우선 추적";
  if (tier === "theme") return "양자·디지털자산 테마 우선 추적";
  if (tier === "popular-small-cap") return "인기 소형주 우선 추적";
  return "실적 캘린더 추적";
}

function ReportedEarningsChart({
  ticker,
  rows,
}: {
  ticker: string;
  rows: typeof EARNINGS_ROWS;
}) {
  const chartRows = [...rows].reverse().map((row) => ({
    period:
      row.year && row.quarter
        ? `${String(row.year).slice(-2)}년 ${row.quarter}Q`
        : row.date.slice(2, 7).replace("-", "."),
    epsActual: row.epsActual,
    revenueActual:
      row.revenueActual == null ? undefined : row.revenueActual / 1e9,
    netIncomeActual:
      row.netIncomeActual == null ? undefined : row.netIncomeActual / 1e9,
    netMargin:
      row.netIncomeActual == null || row.revenueActual == null || row.revenueActual === 0
        ? undefined
        : (row.netIncomeActual / row.revenueActual) * 100,
  }));
  return (
    <div
      className="p-4 sm:p-5"
      role="group"
      aria-label={`${ticker} 발표된 분기별 실제 매출, 순이익과 순이익률 그래프`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold">분기별 발표 실적</h3>
        <span className="text-[10px] text-muted-foreground">막대: 매출·순이익 · 선: 순이익률</span>
      </div>
      <div className="mt-3 h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartRows} margin={{ top: 8, right: 2, bottom: 4, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.55} />
            <XAxis dataKey="period" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
            <YAxis yAxisId="revenue" stroke="var(--color-muted-foreground)" fontSize={10} tickLine={false} axisLine={false} width={46} tickFormatter={(value) => `$${value.toFixed(0)}B`} />
            <YAxis yAxisId="margin" orientation="right" stroke="var(--color-warning)" fontSize={10} tickLine={false} axisLine={false} width={42} tickFormatter={(value) => `${value.toFixed(0)}%`} />
            <Tooltip contentStyle={{ backgroundColor: "var(--color-popover)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} formatter={(value: number, name: string) => [name === "순이익률" ? `${value.toFixed(2)}%` : `$${value.toFixed(2)}B`, name]} />
            <Legend wrapperStyle={{ fontSize: 10 }} />
            <Bar yAxisId="revenue" dataKey="revenueActual" name="매출" fill="var(--color-brand)" fillOpacity={0.82} radius={[3, 3, 0, 0]} maxBarSize={42} />
            <Bar yAxisId="revenue" dataKey="netIncomeActual" name="순이익" fill="var(--color-success)" fillOpacity={0.72} radius={[3, 3, 0, 0]} maxBarSize={42} />
            <Line yAxisId="margin" type="monotone" dataKey="netMargin" name="순이익률" stroke="var(--color-warning)" strokeWidth={2.25} dot={{ r: 3, fill: "var(--color-background)" }} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        그래프의 정확한 수치는 아래 실적 표에서 확인할 수 있습니다.
      </p>
    </div>
  );
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
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div
          className={cn(
            "mt-1 break-words text-base font-semibold leading-tight tabular min-[380px]:text-lg",
            tone !== undefined && tone > 0 && "text-success",
            tone !== undefined && tone < 0 && "text-danger",
          )}
        >
          {value}
        </div>
        <div className="mt-1 text-xs leading-snug text-muted-foreground">
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
