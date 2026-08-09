import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell, PageHeading } from "@/components/page-shell";
import { RotationSummary } from "@/components/rotation-summary";
import {
  FilterBar,
  type Category,
  type Period,
} from "@/components/filter-bar";
import { ComparisonChart, type Metric, type Range } from "@/components/comparison-chart";
import { SectorTable } from "@/components/sector-table";
import { ReadingGuide } from "@/components/reading-guide";
import { FocusStocks } from "@/components/focus-stocks";
import {
  DataPageFallback,
  DataSectionState,
  DataSourcesStatus,
} from "@/components/data-source-state";
import {
  ROUTE_DATA_SOURCES,
  hasUsableSourceData,
  useDataSources,
} from "@/lib/data-runtime";
import { LIVE_COMPANIES_BY_ID, LIVE_MARKET_DATA, SECTORS, type Sector } from "@/lib/mock-data";
import { useWatchlist } from "@/lib/user-library";

const INITIAL_GROUPS = ["technology", "communication", "financial"];
const CATEGORY_LABELS: Record<Category, string> = {
  sector: "대분류 섹터", industry: "세부 산업", universe: "편입 지수",
  custom: "커스텀 그룹", mcap: "시가총액",
  watchlist: "관심종목",
};
const PERIOD_LABELS: Record<Period, string> = {
  "1d": "전일", "5d": "최근 5일", "20d": "최근 20일", "60d": "최근 60일",
};
const LEGACY_SECTOR_IDS: Record<string, string> = {
  Technology: "technology", "Communication Services": "communication",
  "Financial Services": "financial", "Consumer Cyclical": "consumer-discretionary",
  Healthcare: "healthcare", Industrials: "industrials", Energy: "energy",
  "Consumer Defensive": "consumer-staples", Utilities: "utilities",
  "Real Estate": "real-estate", "Basic Materials": "materials",
};

function readUrlState() {
  const defaults = {
    category: "sector" as Category, period: "1d" as Period,
    metric: "index" as Metric, range: "60d" as Range, groups: [] as string[],
  };
  if (typeof window === "undefined") return defaults;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const mode = params.get("m") as Category | null;
  const period = params.get("p") as Period | null;
  const metric = params.get("mt");
  const range = params.get("r");
  if (["sector", "industry", "universe", "custom", "mcap", "watchlist"].includes(mode ?? "")) defaults.category = mode!;
  if (["1d", "5d", "20d", "60d"].includes(period ?? "")) defaults.period = period!;
  if (metric === "share" || metric === "change") defaults.metric = metric;
  if (range === "5" || range === "20" || range === "60") defaults.range = `${range}d` as Range;
  defaults.groups = (params.get("g") ?? "").split("|").filter(Boolean);
  return defaults;
}

function initialSelection(groups: string[], rows: Sector[]) {
  const resolved = groups.map((id) => LEGACY_SECTOR_IDS[id] ?? id).filter((id) =>
    rows.some((row) => row.id === id) || Boolean(LIVE_COMPANIES_BY_ID[id]),
  );
  return (resolved.length ? resolved : rows.slice(0, 3).map((row) => row.id)).slice(0, 8);
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "미국 주식의 돈이 어디로 움직였는지 | BVT Money Flow" },
      {
        name: "description",
        content:
          "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다. 거래대금과 점유율 변화를 바탕으로 시장의 관심 이동을 확인하세요.",
      },
      { property: "og:title", content: "미국 주식의 돈이 어디로 움직였는지 | BVT Money Flow" },
      {
        property: "og:description",
        content: "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다.",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/" }],
  }),
  component: MarketFlowPage,
});

function MarketFlowPage() {
  const sourceStates = useDataSources(ROUTE_DATA_SOURCES.home);
  const marketState = sourceStates.market;
  const [initial] = useState(readUrlState);
  const [category, setCategory] = useState<Category>(initial.category);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [metric, setMetric] = useState<Metric>(initial.metric);
  const [range, setRange] = useState<Range>(initial.range);
  const [query, setQuery] = useState("");
  const watchlist = useWatchlist();
  const watchlistRows = useMemo<Sector[]>(() =>
    watchlist.tickers.flatMap((ticker) => {
      const company = LIVE_COMPANIES_BY_ID[`stock:${ticker}`];
      return company ? [{
        id: company.id,
        name: `${company.ticker} · ${company.name}`,
        group: "sector",
        volume: company.volume,
        volumeChange: company.volumeVs?.[period] ?? 0,
        priceChange: company.change,
        shareDelta: 0,
        share: company.share,
        signal: company.signal,
        leaders: [company.ticker],
      }] : [];
    }), [period, watchlist.tickers.join("|")]);
  const marketRows = category === "watchlist" ? [] : LIVE_MARKET_DATA[category]?.[period] ?? [];
  const rows = category === "watchlist"
    ? watchlistRows
    : marketRows.length ? marketRows : SECTORS;
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelection(initial.groups.length ? initial.groups : INITIAL_GROUPS, rows),
  );

  useEffect(() => {
    const syncFromHash = () => {
      const next = readUrlState();
      const nextMarketRows = next.category === "watchlist" ? [] : LIVE_MARKET_DATA[next.category]?.[next.period] ?? [];
      const nextRows = next.category === "watchlist"
        ? watchlistRows
        : nextMarketRows.length ? nextMarketRows : SECTORS;
      setCategory(next.category);
      setPeriod(next.period);
      setMetric(next.metric);
      setRange(next.range);
      setSelected(initialSelection(next.groups, nextRows));
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, [watchlistRows]);

  useEffect(() => {
    setSelected((current) => {
      const valid = current.filter((id) => rows.some((row) => row.id === id) || Boolean(LIVE_COMPANIES_BY_ID[id]));
      return valid.length ? valid : rows.slice(0, 3).map((row) => row.id);
    });
  }, [category, period, rows]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("m", category);
    params.set("p", period);
    params.set("mt", metric === "index" ? "idx" : metric);
    params.set("r", range.replace("d", ""));
    if (selected.length) params.set("g", selected.join("|"));
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${params}`);
  }, [category, period, metric, range, selected]);

  const changeCategory = (next: Category) => {
    setCategory(next);
    setQuery("");
    const nextRows = next === "watchlist" ? watchlistRows : LIVE_MARKET_DATA[next]?.[period] ?? [];
    setSelected(nextRows.slice(0, 3).map((row) => row.id));
  };

  const toggleCompare = (id: string) =>
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= 8
          ? cur
          : [...cur, id],
    );

  if (!hasUsableSourceData(marketState)) {
    return (
      <DataPageFallback
        title="시장 흐름"
        description="미국 주식 시장의 거래대금 흐름을 섹터·산업·시가총액별로 비교합니다."
        state={marketState}
      />
    );
  }

  return (
    <PageShell>
      <PageHeading
        title="미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다."
        description="거래대금과 점유율 변화로 미국 시장의 관심 이동을 확인하세요."
      />
      <DataSourcesStatus
        states={[sourceStates.market, sourceStates.history]}
        className="mb-4"
      />
      <p className="-mt-2 mb-5 max-w-4xl text-xs leading-relaxed text-muted-foreground">
        BVT Money Flow는 미국 주식의 종목별 거래대금과 섹터·산업·시가총액별 거래대금 점유율 변화를 분석합니다. 거래대금은 매수와 매도를 함께 포함하며 실제 순매수나 자금 유입을 뜻하지 않습니다.
      </p>
      <nav aria-label="주요 기능 바로가기" className="mb-5 grid gap-2 sm:grid-cols-3">
        <Link to="/today" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-brand/25 bg-brand/5 px-4 text-sm font-semibold text-brand hover:border-brand/50 hover:bg-brand/10">
          주간 브리핑 보기
        </Link>
        <Link to="/watchlist" className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold hover:border-brand/40 hover:bg-brand/5">
          관심종목 확인
        </Link>
        <Link to="/scanner" className="inline-flex min-h-11 items-center justify-center rounded-lg border px-4 text-sm font-semibold hover:border-brand/40 hover:bg-brand/5">
          스캐너 열기
        </Link>
      </nav>
      <div className="space-y-5">
        <RotationSummary rows={rows} categoryLabel={CATEGORY_LABELS[category]} periodLabel={PERIOD_LABELS[period]} />
        <FocusStocks />
        <FilterBar
          category={category}
          onCategory={changeCategory}
          period={period}
          onPeriod={setPeriod}
          query={query}
          onQuery={setQuery}
        />
        <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
          현재 조건 · {CATEGORY_LABELS[category]} · {PERIOD_LABELS[period]} 기준 · {rows.length}개 그룹
        </p>
        <div className="grid gap-5">
          <DataSectionState state={sourceStates.history} minHeight="h-72">
            <ComparisonChart
              rows={rows}
              selected={selected}
              onSelected={setSelected}
              metric={metric}
              onMetric={setMetric}
              range={range}
              onRange={setRange}
              addableRows={watchlistRows}
            />
          </DataSectionState>
          <SectorTable
            data={rows}
            selectedIds={selected}
            onToggleCompare={toggleCompare}
            onAddCompany={toggleCompare}
            query={query}
            categoryLabel={CATEGORY_LABELS[category]}
            periodLabel={PERIOD_LABELS[period]}
          />
        </div>
        <ReadingGuide />
      </div>
    </PageShell>
  );
}
