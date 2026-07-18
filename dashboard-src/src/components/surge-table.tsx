import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Users,
  Rocket,
  Newspaper,
  Star,
  Search,
  MoreHorizontal,
  X,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { SignalBadge, DeltaText } from "./signal-badge";
import { LIVE_STOCKS, SURGE_STOCKS, type MarketPeriod } from "@/lib/mock-data";
import { fmtMcap, fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { MetricInfo } from "./metric-info";

const PERIODS: { id: MarketPeriod; label: string }[] = [
  { id: "1d", label: "1일 대비" },
  { id: "5d", label: "5일 대비" },
  { id: "20d", label: "20일 대비" },
  { id: "60d", label: "60일 대비" },
];

type SortKey =
  "price" | "change" | "volume" | MarketPeriod | "marketCap" | "signal";
type SortMode = "desc" | "asc" | "average";
type InsightFilter = "all" | "new" | "persistent" | "overheated";
type PresetId =
  | "trading-value-surge"
  | "up-with-volume"
  | "down-with-volume"
  | "sector-leader"
  | "large-cap-interest";
type ExternalFilter = {
  preset?: PresetId;
  priceDirection?: "up" | "down";
  tradingValueDirection?: "up" | "down";
};
const PRESETS: { id: PresetId; label: string; detail: string }[] = [
  {
    id: "trading-value-surge",
    label: "거래대금 급증",
    detail: "20일 평균 2배 이상 · 거래대금 5천만 달러 이상",
  },
  {
    id: "up-with-volume",
    label: "상승 + 거래대금 증가",
    detail: "주가 상승 · 20일 평균 대비 거래대금 증가",
  },
  {
    id: "down-with-volume",
    label: "하락 + 거래대금 증가",
    detail: "주가 하락 · 20일 평균 대비 거래대금 증가",
  },
  {
    id: "sector-leader",
    label: "섹터 주도주",
    detail: "각 섹터에서 당일 거래대금이 가장 큰 종목",
  },
  {
    id: "large-cap-interest",
    label: "대형주 관심 확대",
    detail: "시가총액 2천억 달러 이상 · 20일 평균 대비 증가",
  },
];
const PRESET_IDS = new Set(PRESETS.map((preset) => preset.id));
const INSIGHT_FILTERS: { id: InsightFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "new", label: "신규 급증" },
  { id: "persistent", label: "지속 증가·상승" },
  { id: "overheated", label: "과열 가능성" },
];
const SIGNAL_RANK = {
  inflow: 3,
  neutral: 2,
  "attention-loss": 1,
  outflow: 0,
} as const;
const SORT_LABEL: Record<SortKey, string> = {
  price: "가격",
  change: "등락",
  volume: "거래대금",
  "1d": "1D",
  "5d": "5D",
  "20d": "20D",
  "60d": "60D",
  marketCap: "시총",
  signal: "신호",
};

const sortValue = (stock: (typeof SURGE_STOCKS)[number], key: SortKey) => {
  if (key === "price") return stock.price;
  if (key === "change") return stock.change;
  if (key === "volume") return stock.volume;
  if (key === "marketCap") return stock.marketCap;
  if (key === "signal") return SIGNAL_RANK[stock.signal];
  return stock.volumeVs?.[key] ?? 0;
};

export function SurgeTable() {
  const [period, setPeriod] = useState<MarketPeriod>(() => {
    if (typeof window === "undefined") return "20d";
    const value = new URLSearchParams(window.location.search).get("period");
    return ["1d", "5d", "20d", "60d"].includes(value ?? "")
      ? (value as MarketPeriod)
      : "20d";
  });
  const [sort, setSort] = useState<{ key: SortKey; mode: SortMode }>({
    key: "20d",
    mode: "desc",
  });
  const [query, setQuery] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("ticker") ?? params.get("q") ?? "";
  });
  const [insight, setInsight] = useState<InsightFilter>(() => {
    if (typeof window === "undefined") return "all";
    const value = new URLSearchParams(window.location.search).get("insight");
    return INSIGHT_FILTERS.some((item) => item.id === value)
      ? (value as InsightFilter)
      : "all";
  });
  const [externalFilter, setExternalFilter] = useState<ExternalFilter>(() => {
    if (typeof window === "undefined") return {};
    const params = new URLSearchParams(window.location.search);
    const priceDirection = params.get("priceDirection");
    const tradingValueDirection = params.get("tradingValueDirection");
    return {
      preset: PRESET_IDS.has(params.get("preset") as PresetId)
        ? (params.get("preset") as PresetId)
        : undefined,
      priceDirection:
        priceDirection === "up" || priceDirection === "down"
          ? priceDirection
          : undefined,
      tradingValueDirection:
        tradingValueDirection === "up" || tradingValueDirection === "down"
          ? tradingValueDirection
          : undefined,
    };
  });
  const [watch, setWatch] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("bmoWatch") || "[]");
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("bmoWatch", JSON.stringify(watch));
  }, [watch]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("ticker");
    query.trim()
      ? url.searchParams.set("q", query.trim())
      : url.searchParams.delete("q");
    period !== "20d"
      ? url.searchParams.set("period", period)
      : url.searchParams.delete("period");
    insight !== "all"
      ? url.searchParams.set("insight", insight)
      : url.searchParams.delete("insight");
    externalFilter.preset
      ? url.searchParams.set("preset", externalFilter.preset)
      : url.searchParams.delete("preset");
    externalFilter.priceDirection
      ? url.searchParams.set("priceDirection", externalFilter.priceDirection)
      : url.searchParams.delete("priceDirection");
    externalFilter.tradingValueDirection
      ? url.searchParams.set(
          "tradingValueDirection",
          externalFilter.tradingValueDirection,
        )
      : url.searchParams.delete("tradingValueDirection");
    window.history.replaceState({}, "", url);
  }, [externalFilter, insight, period, query]);

  const sectorLeaderBySector = useMemo(() => {
    const leaders = new Map<string, string>();
    for (const stock of LIVE_STOCKS) {
      const current = leaders.get(stock.sector);
      const currentStock = current
        ? LIVE_STOCKS.find((row) => row.ticker === current)
        : undefined;
      if (!currentStock || stock.volume > currentStock.volume) {
        leaders.set(stock.sector, stock.ticker);
      }
    }
    return leaders;
  }, []);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const source =
      q ||
      externalFilter.preset ||
      externalFilter.priceDirection ||
      externalFilter.tradingValueDirection
        ? LIVE_STOCKS
        : SURGE_STOCKS;
    const hasExactTicker = q
      ? source.some((stock) => stock.ticker.toLowerCase() === q)
      : false;
    const filtered = source.filter((stock) => {
      const matchesQuery =
        !q ||
        (hasExactTicker
          ? stock.ticker.toLowerCase() === q
          : stock.ticker.toLowerCase().includes(q) ||
            stock.name.toLowerCase().includes(q) ||
            stock.sector.toLowerCase().includes(q) ||
            stock.industry?.toLowerCase().includes(q));
      const current = stock.volumeVs?.[period] ?? 0;
      const oneDay = stock.volumeVs?.["1d"] ?? 0;
      const fiveDay = stock.volumeVs?.["5d"] ?? 0;
      const twentyDay = stock.volumeVs?.["20d"] ?? 0;
      const matchesInsight =
        insight === "all" ||
        (insight === "new" && oneDay >= 30 && fiveDay < 20) ||
        (insight === "persistent" &&
          fiveDay >= 15 &&
          twentyDay >= 15 &&
          stock.change > 0) ||
        (insight === "overheated" && current >= 100);
      const isSectorLeader =
        sectorLeaderBySector.get(stock.sector) === stock.ticker;
      const matchesPreset =
        !externalFilter.preset ||
        (externalFilter.preset === "trading-value-surge" &&
          stock.volumeRatio >= 2 &&
          stock.volume >= 50_000_000) ||
        (externalFilter.preset === "up-with-volume" &&
          stock.change > 0 &&
          twentyDay > 0) ||
        (externalFilter.preset === "down-with-volume" &&
          stock.change < 0 &&
          twentyDay > 0) ||
        (externalFilter.preset === "sector-leader" && isSectorLeader) ||
        (externalFilter.preset === "large-cap-interest" &&
          stock.marketCap >= 200_000_000_000 &&
          twentyDay > 0);
      const matchesPrice =
        !externalFilter.priceDirection ||
        (externalFilter.priceDirection === "up"
          ? stock.change > 0
          : stock.change <= 0);
      const ratio20d = stock.volumeVs?.["20d"] ?? -100;
      const matchesTradingValue =
        !externalFilter.tradingValueDirection ||
        (externalFilter.tradingValueDirection === "up"
          ? ratio20d >= 0
          : ratio20d < 0);
      return (
        matchesQuery &&
        matchesInsight &&
        matchesPreset &&
        matchesPrice &&
        matchesTradingValue
      );
    });
    const average = filtered.length
      ? filtered.reduce((sum, stock) => sum + sortValue(stock, sort.key), 0) /
        filtered.length
      : 0;
    return filtered.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (sort.mode === "average")
        return Math.abs(av - average) - Math.abs(bv - average);
      return sort.mode === "desc" ? bv - av : av - bv;
    });
  }, [externalFilter, insight, period, query, sectorLeaderBySector, sort]);

  const externalParts = [
    externalFilter.priceDirection === "up"
      ? "주가 상승"
      : externalFilter.priceDirection === "down"
        ? "주가 하락"
        : "",
    externalFilter.tradingValueDirection === "up"
      ? "거래대금 확대"
      : externalFilter.tradingValueDirection === "down"
        ? "거래대금 축소"
        : "",
  ].filter(Boolean);
  const activePreset = PRESETS.find(
    (preset) => preset.id === externalFilter.preset,
  );
  const externalLabel = activePreset?.detail || externalParts.join(" · ");

  const applyPreset = (preset: PresetId) => {
    setExternalFilter({ preset });
    setInsight("all");
    setPeriod("20d");
    setSort({ key: "20d", mode: "desc" });
  };

  const clearExternalFilter = () => {
    setExternalFilter({});
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.delete("preset");
      url.searchParams.delete("priceDirection");
      url.searchParams.delete("tradingValueDirection");
      window.history.replaceState({}, "", url);
    }
  };

  const clearAllFilters = () => {
    setQuery("");
    setInsight("all");
    setExternalFilter({});
    setPeriod("20d");
    setSort({ key: "20d", mode: "desc" });
  };

  const appliedConditions = [
    activePreset
      ? {
          id: "preset",
          label: activePreset.label,
          clear: () => setExternalFilter({}),
        }
      : null,
    insight !== "all"
      ? {
          id: "insight",
          label: INSIGHT_FILTERS.find((item) => item.id === insight)?.label || insight,
          clear: () => setInsight("all"),
        }
      : null,
    query.trim()
      ? { id: "query", label: `검색: ${query.trim()}`, clear: () => setQuery("") }
      : null,
    period !== "20d"
      ? {
          id: "period",
          label: `${period.toUpperCase()} 비교`,
          clear: () => {
            setPeriod("20d");
            setSort({ key: "20d", mode: "desc" });
          },
        }
      : null,
    externalParts.length && !activePreset
      ? {
          id: "external",
          label: externalParts.join(" · "),
          clear: clearExternalFilter,
        }
      : null,
  ].filter(Boolean) as { id: string; label: string; clear: () => void }[];

  const cycleSort = (key: SortKey) =>
    setSort((current) => ({
      key,
      mode:
        current.key !== key
          ? "desc"
          : current.mode === "desc"
            ? "asc"
            : current.mode === "asc"
              ? "average"
              : "desc",
    }));

  const toggleWatch = (ticker: string) =>
    setWatch((current) =>
      current.includes(ticker)
        ? current.filter((item) => item !== ticker)
        : [...current, ticker],
    );

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:px-5 lg:flex-row lg:items-end">
          <div>
            <div className="flex items-center gap-1">
              <h2 className="text-base font-semibold sm:text-lg">
                거래대금 급증 종목
              </h2>
              <MetricInfo label="급증 기준">
                선택 기간의 평균 거래대금과 당일 거래대금을 비교합니다. 20일
                대비 +80%는 평소보다 1.8배 거래됐다는 뜻이며, 평균 거래대금이
                작은 종목은 변화율이 크게 보일 수 있습니다.
              </MetricInfo>
            </div>
            <p className="text-[11px] text-muted-foreground">
              선택 기간 평균 대비 거래대금 증가율 · {rows.length}건 · 현재{" "}
              {SORT_LABEL[sort.key]}{" "}
              {sort.mode === "desc"
                ? "높은 순"
                : sort.mode === "asc"
                  ? "낮은 순"
                  : "평균 근접 순"}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:ml-5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              비교 기준
            </span>
            <div
              role="tablist"
              className="no-scrollbar inline-flex h-11 overflow-x-auto rounded-lg border border-border bg-surface p-0.5 sm:h-9"
            >
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={period === item.id}
                  onClick={() => {
                    setPeriod(item.id);
                    setSort({ key: item.id, mode: "desc" });
                  }}
                  className={cn(
                    "min-h-10 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium sm:min-h-0",
                    period === item.id
                      ? "bg-brand text-brand-foreground"
                      : "text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="relative lg:ml-auto lg:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="티커·기업·섹터 검색"
              aria-label="급증 종목 검색"
              className="h-11 pl-9 sm:h-9"
            />
          </div>
        </div>

        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-semibold">빠른 프리셋</h2>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                조건을 누르면 즉시 적용되고 현재 주소에 저장됩니다.
              </p>
            </div>
            {activePreset && (
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                {activePreset.detail}
              </span>
            )}
          </div>
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto pb-0.5">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                aria-pressed={activePreset?.id === preset.id}
                title={preset.detail}
                className={cn(
                  "min-h-10 shrink-0 rounded-md border px-3 text-xs font-semibold transition-colors sm:min-h-9",
                  activePreset?.id === preset.id
                    ? "border-brand bg-brand text-brand-foreground"
                    : "border-border bg-surface text-foreground hover:border-brand/40 hover:bg-brand/[0.05]",
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div
          className="flex items-center gap-2 overflow-x-auto border-b border-border/70 px-4 py-2.5 sm:px-5 no-scrollbar"
          aria-label="해석형 필터"
        >
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            빠른 해석
          </span>
          {INSIGHT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setInsight(item.id)}
              aria-pressed={insight === item.id}
              className={cn(
                "min-h-10 shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors sm:min-h-0 sm:px-2.5",
                insight === item.id
                  ? "border-brand bg-brand text-brand-foreground"
                  : "border-border bg-surface text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {(appliedConditions.length > 0 || externalLabel) && (
          <div className="border-b border-brand/20 bg-brand/[0.05] px-4 py-2.5 text-xs sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="shrink-0 font-semibold text-brand">
                적용된 조건 {appliedConditions.length}개
              </span>
              {appliedConditions.map((condition) => (
                <button
                  key={condition.id}
                  type="button"
                  onClick={condition.clear}
                  className="inline-flex min-h-8 items-center gap-1 rounded-full border border-brand/25 bg-background px-2.5 font-medium text-foreground hover:bg-secondary"
                >
                  {condition.label}
                  <X className="h-3 w-3 text-muted-foreground" />
                </button>
              ))}
              <span className="text-muted-foreground">결과 {rows.length}개</span>
              <button
                type="button"
                onClick={clearAllFilters}
                className="ml-auto min-h-8 font-semibold text-brand hover:underline"
              >
                전체 초기화
              </button>
            </div>
            {externalLabel && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {externalLabel}
              </p>
            )}
          </div>
        )}

        <TooltipProvider delayDuration={150}>
          <MobileStockList
            rows={rows}
            period={period}
            sectorLeaderBySector={sectorLeaderBySector}
            watch={watch}
            onToggleWatch={toggleWatch}
          />
          <div className="hidden max-h-[680px] overflow-auto md:block">
            <table className="min-w-[1240px] w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">
                    종목
                  </th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">
                    섹터·산업
                  </th>
                  <SortableTh
                    label="가격"
                    sortKey="price"
                    sort={sort}
                    onSort={cycleSort}
                  />
                  <SortableTh
                    label="등락"
                    sortKey="change"
                    sort={sort}
                    onSort={cycleSort}
                  />
                  <SortableTh
                    label="거래대금"
                    sortKey="volume"
                    sort={sort}
                    onSort={cycleSort}
                  />
                  {PERIODS.map((item) => (
                    <SortableTh
                      key={item.id}
                      label={`${item.id.toUpperCase()} 대비`}
                      sortKey={item.id}
                      sort={sort}
                      onSort={cycleSort}
                      active={period === item.id}
                    />
                  ))}
                  <SortableTh
                    label="시총"
                    sortKey="marketCap"
                    sort={sort}
                    onSort={cycleSort}
                  />
                  <SortableTh
                    label="신호"
                    sortKey="signal"
                    sort={sort}
                    onSort={cycleSort}
                    align="left"
                  />
                  <th className="whitespace-nowrap py-2.5 pr-4 text-right font-medium">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((stock) => (
                  <tr
                    key={stock.ticker}
                    className="transition-colors hover:bg-secondary/50"
                  >
                    <td className="whitespace-nowrap py-2.5 pl-4 pr-3">
                      <a
                        href={`/stock/?ticker=${encodeURIComponent(stock.ticker)}`}
                        className="flex flex-col leading-tight hover:text-brand"
                      >
                        <span className="font-mono text-[13px] font-semibold tabular">
                          {stock.ticker}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {stock.name}
                        </span>
                        <StockReasonBadges
                          stock={stock}
                          sectorLeader={
                            sectorLeaderBySector.get(stock.sector) === stock.ticker
                          }
                        />
                      </a>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      <div>{stock.sector}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {stock.industry || "산업 미수집"}
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                      ${fmtPrice(stock.price)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                      <DeltaText value={stock.change} />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                      {fmtMoney(stock.volume)}
                    </td>
                    {PERIODS.map((item) => {
                      const value = stock.volumeVs?.[item.id] ?? 0;
                      return (
                        <td
                          key={item.id}
                          className={cn(
                            "whitespace-nowrap py-2.5 pr-3 text-right font-medium tabular",
                            period === item.id && "bg-brand/[0.04]",
                            value > 0
                              ? "text-success"
                              : value < 0
                                ? "text-danger"
                                : "text-muted-foreground",
                          )}
                        >
                          <span
                            title={
                              Math.abs(value) >= 200
                                ? "평균 거래대금이 작거나 일시적 거래가 집중되면 변화율이 크게 확대될 수 있습니다."
                                : undefined
                            }
                          >
                            {fmtPct(value)}
                            {Math.abs(value) >= 200 && (
                              <sup className="ml-0.5 text-[8px] text-warning">
                                주의
                              </sup>
                            )}
                          </span>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular text-muted-foreground">
                      {fmtMcap(stock.marketCap)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3">
                      <SignalBadge signal={stock.signal} size="xs" />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <IconAction
                          label="가격 차트"
                          href={`https://finance.yahoo.com/quote/${stock.ticker}/chart/`}
                          external
                          icon={<LineChart className="h-3.5 w-3.5" />}
                        />
                        <IconAction
                          label="내부자 거래"
                          href={`/insider/?ticker=${encodeURIComponent(stock.ticker)}`}
                          active={stock.hasInsider}
                          icon={<Users className="h-3.5 w-3.5" />}
                        />
                        <IconAction
                          label="IPO 정보"
                          href={`/ipo-lockup/?ticker=${encodeURIComponent(stock.ticker)}`}
                          active={stock.isIpo}
                          icon={<Rocket className="h-3.5 w-3.5" />}
                        />
                        <IconAction
                          label="관련 뉴스"
                          href={`https://finance.yahoo.com/quote/${stock.ticker}/news/`}
                          external
                          active
                          icon={<Newspaper className="h-3.5 w-3.5" />}
                        />
                        <IconAction
                          label={
                            watch.includes(stock.ticker)
                              ? "관심 종목 제거"
                              : "관심 종목 추가"
                          }
                          onClick={() => toggleWatch(stock.ticker)}
                          active={watch.includes(stock.ticker)}
                          icon={
                            <Star
                              className={cn(
                                "h-3.5 w-3.5",
                                watch.includes(stock.ticker) && "fill-current",
                              )}
                            />
                          }
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={12}
                      className="py-12 text-center text-sm text-muted-foreground"
                    >
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function MobileStockList({
  rows,
  period,
  sectorLeaderBySector,
  watch,
  onToggleWatch,
}: {
  rows: (typeof SURGE_STOCKS)[number][];
  period: MarketPeriod;
  sectorLeaderBySector: Map<string, string>;
  watch: string[];
  onToggleWatch: (ticker: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground md:hidden">
        검색 결과가 없습니다.
      </div>
    );
  }

  return (
    <div className="max-h-[680px] divide-y divide-border/70 overflow-y-auto md:hidden">
      {rows.map((stock) => {
        const periodValue = stock.volumeVs?.[period] ?? 0;
        const watched = watch.includes(stock.ticker);
        return (
          <article key={stock.ticker} className="px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <a
                  href={`/stock/?ticker=${encodeURIComponent(stock.ticker)}`}
                  className="flex items-baseline gap-2 hover:text-brand"
                >
                  <span className="font-mono text-sm font-bold tabular">
                    {stock.ticker}
                  </span>
                  <span className="truncate text-xs font-medium text-muted-foreground">
                    {stock.name}
                  </span>
                </a>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {stock.sector} · {stock.industry || "산업 미수집"} ·{" "}
                  {fmtMcap(stock.marketCap)}
                </p>
                <StockReasonBadges
                  stock={stock}
                  sectorLeader={
                    sectorLeaderBySector.get(stock.sector) === stock.ticker
                  }
                />
              </div>
              <SignalBadge signal={stock.signal} size="xs" />
            </div>

            <div className="mt-3 grid grid-cols-4 gap-1 rounded-lg border border-border/70 bg-surface-2/55 p-2.5">
              <MobileMetric label="거래대금" value={fmtMoney(stock.volume)} />
              <MobileMetric
                label={`${period.toUpperCase()} 대비`}
                value={fmtPct(periodValue)}
                tone={
                  periodValue > 0
                    ? "success"
                    : periodValue < 0
                      ? "danger"
                      : undefined
                }
                emphasized
              />
              <MobileMetric label="가격" value={`$${fmtPrice(stock.price)}`} />
              <MobileMetric
                label="등락"
                value={<DeltaText value={stock.change} />}
              />
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-3">
              <a
                href={`https://finance.yahoo.com/quote/${stock.ticker}/chart/`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface text-xs font-semibold transition-colors hover:bg-secondary"
              >
                <LineChart className="h-4 w-4" />
                가격 차트
              </a>
              <MobileActionMenu
                stock={stock}
                watched={watched}
                onToggleWatch={onToggleWatch}
              />
              <button
                type="button"
                onClick={() => onToggleWatch(stock.ticker)}
                aria-label={
                  watched
                    ? `${stock.ticker} 관심 종목 제거`
                    : `${stock.ticker} 관심 종목 추가`
                }
                aria-pressed={watched}
                className={cn(
                  "grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-surface text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                  watched && "border-brand/30 bg-brand/10 text-brand",
                )}
              >
                <Star className={cn("h-4 w-4", watched && "fill-current")} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function StockReasonBadges({
  stock,
  sectorLeader,
}: {
  stock: (typeof SURGE_STOCKS)[number];
  sectorLeader: boolean;
}) {
  const change20d = stock.volumeVs?.["20d"] ?? 0;
  const reasons = [
    change20d >= 30 ? `20일 평균 대비 ${(1 + change20d / 100).toFixed(1)}배` : "",
    change20d > 0 && stock.change > 0
      ? "상승 동반 확대"
      : change20d > 0 && stock.change < 0
        ? "하락 동반 확대"
        : "",
    sectorLeader ? `${stock.sector} 거래대금 1위` : "",
  ]
    .filter(Boolean)
    .slice(0, 2);

  if (!reasons.length) return null;
  return (
    <div className="mt-1 flex max-w-full flex-wrap gap-1">
      {reasons.map((reason) => (
        <span
          key={reason}
          className="rounded border border-brand/15 bg-brand/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-brand"
        >
          {reason}
        </span>
      ))}
    </div>
  );
}

function MobileMetric({
  label,
  value,
  tone,
  emphasized,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "success" | "danger";
  emphasized?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 text-center",
        emphasized && "rounded-md bg-brand/[0.07] py-1",
      )}
    >
      <div className="truncate text-[10px] text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-0.5 truncate text-xs font-semibold tabular",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function MobileActionMenu({
  stock,
  watched,
  onToggleWatch,
}: {
  stock: (typeof SURGE_STOCKS)[number];
  watched: boolean;
  onToggleWatch: (ticker: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-md border border-border bg-surface text-xs font-semibold transition-colors hover:bg-secondary"
          aria-label={`${stock.ticker} 추가 정보`}
        >
          더보기
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem asChild className="min-h-10">
          <a href={`/insider/?ticker=${encodeURIComponent(stock.ticker)}`}>
            <Users /> 내부자 거래
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-10">
          <a href={`/ipo-lockup/?ticker=${encodeURIComponent(stock.ticker)}`}>
            <Rocket /> IPO 정보
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className="min-h-10">
          <a
            href={`https://finance.yahoo.com/quote/${stock.ticker}/news/`}
            target="_blank"
            rel="noreferrer"
          >
            <Newspaper /> 관련 뉴스
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="min-h-10"
          onSelect={() => onToggleWatch(stock.ticker)}
        >
          <Star className={cn(watched && "fill-current text-brand")} />
          {watched ? "관심 종목 제거" : "관심 종목 추가"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  active,
  align = "right",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; mode: SortMode };
  onSort: (key: SortKey) => void;
  active?: boolean;
  align?: "left" | "right";
}) {
  const selected = sort.key === sortKey;
  const indicator = !selected
    ? ""
    : sort.mode === "desc"
      ? "↓"
      : sort.mode === "asc"
        ? "↑"
        : "≈";
  const description = !selected
    ? "정렬"
    : sort.mode === "desc"
      ? "높은 순"
      : sort.mode === "asc"
        ? "낮은 순"
        : "평균 근접 순";
  return (
    <th
      className={cn(
        "whitespace-nowrap py-2.5 pr-3 font-medium",
        align === "right" ? "text-right" : "text-left",
        active && "text-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        title={`${label} · 클릭할 때 높은 순 → 낮은 순 → 평균 근접 순`}
        aria-label={`${label} 정렬 · 현재 ${description}`}
        className="inline-flex items-center gap-1 rounded px-1 py-0.5 hover:bg-secondary hover:text-foreground"
      >
        {label} <span className="w-3 text-center text-[10px]">{indicator}</span>
      </button>
    </th>
  );
}

function IconAction({
  label,
  icon,
  active,
  onClick,
  href,
  external,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  href?: string;
  external?: boolean;
}) {
  const className = cn(
    "relative grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active && "text-brand",
  );
  const content = (
    <>
      {icon}
      {active && (
        <span
          className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-brand"
          aria-hidden
        />
      )}
    </>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a
            href={href}
            target={external ? "_blank" : undefined}
            rel={external ? "noreferrer" : undefined}
            aria-label={label}
            className={className}
          >
            {content}
          </a>
        ) : (
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            aria-pressed={active}
            className={className}
          >
            {content}
          </button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
