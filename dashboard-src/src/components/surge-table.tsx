import { useEffect, useMemo, useState } from "react";
import { LineChart, Users, Rocket, Newspaper, Star, Search } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Input } from "./ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { SignalBadge, DeltaText } from "./signal-badge";
import { SURGE_STOCKS, type MarketPeriod } from "@/lib/mock-data";
import { fmtMcap, fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

const PERIODS: { id: MarketPeriod; label: string }[] = [
  { id: "1d", label: "1일 대비" },
  { id: "5d", label: "5일 대비" },
  { id: "20d", label: "20일 대비" },
  { id: "60d", label: "60일 대비" },
];

type SortKey = "price" | "change" | "volume" | MarketPeriod | "marketCap" | "signal";
type SortMode = "desc" | "asc" | "average";
type InsightFilter = "all" | "new" | "persistent" | "overheated";
const INSIGHT_FILTERS: { id: InsightFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "new", label: "신규 급증" },
  { id: "persistent", label: "지속 증가·상승" },
  { id: "overheated", label: "과열 가능성" },
];
const SIGNAL_RANK = { inflow: 3, neutral: 2, "attention-loss": 1, outflow: 0 } as const;
const SORT_LABEL: Record<SortKey, string> = {
  price: "가격", change: "등락", volume: "거래대금", "1d": "1D", "5d": "5D",
  "20d": "20D", "60d": "60D", marketCap: "시총", signal: "신호",
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
  const [period, setPeriod] = useState<MarketPeriod>("20d");
  const [sort, setSort] = useState<{ key: SortKey; mode: SortMode }>({ key: "20d", mode: "desc" });
  const [query, setQuery] = useState("");
  const [insight, setInsight] = useState<InsightFilter>("all");
  const [watch, setWatch] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("bmoWatch") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("bmoWatch", JSON.stringify(watch));
  }, [watch]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = SURGE_STOCKS.filter((stock) => {
      const matchesQuery = !q || stock.ticker.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q) ||
        stock.sector.toLowerCase().includes(q) || stock.industry?.toLowerCase().includes(q);
      const current = stock.volumeVs?.[period] ?? 0;
      const oneDay = stock.volumeVs?.["1d"] ?? 0;
      const fiveDay = stock.volumeVs?.["5d"] ?? 0;
      const twentyDay = stock.volumeVs?.["20d"] ?? 0;
      const matchesInsight = insight === "all" ||
        (insight === "new" && oneDay >= 30 && fiveDay < 20) ||
        (insight === "persistent" && fiveDay >= 15 && twentyDay >= 15 && stock.change > 0) ||
        (insight === "overheated" && current >= 100);
      return matchesQuery && matchesInsight;
    });
    const average = filtered.length
      ? filtered.reduce((sum, stock) => sum + sortValue(stock, sort.key), 0) / filtered.length
      : 0;
    return filtered.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (sort.mode === "average") return Math.abs(av - average) - Math.abs(bv - average);
      return sort.mode === "desc" ? bv - av : av - bv;
    });
  }, [insight, period, query, sort]);

  const cycleSort = (key: SortKey) => setSort((current) => ({
    key,
    mode: current.key !== key ? "desc" : current.mode === "desc" ? "asc" : current.mode === "asc" ? "average" : "desc",
  }));

  const toggleWatch = (ticker: string) =>
    setWatch((current) => current.includes(ticker)
      ? current.filter((item) => item !== ticker)
      : [...current, ticker]);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b border-border/70 px-4 py-3 sm:px-5 lg:flex-row lg:items-end">
          <div>
            <h2 className="text-base font-semibold sm:text-lg">거래대금 급증 종목</h2>
            <p className="text-[11px] text-muted-foreground">
              선택 기간 평균 대비 거래대금 증가율 · {rows.length}건 · 현재 {SORT_LABEL[sort.key]} {sort.mode === "desc" ? "높은 순" : sort.mode === "asc" ? "낮은 순" : "평균 근접 순"}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-1 lg:ml-5">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">비교 기준</span>
            <div role="tablist" className="inline-flex h-9 overflow-x-auto rounded-lg border border-border bg-surface p-0.5">
              {PERIODS.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  aria-selected={period === item.id}
                  onClick={() => { setPeriod(item.id); setSort({ key: item.id, mode: "desc" }); }}
                  className={cn(
                    "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium",
                    period === item.id ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-secondary",
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
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto border-b border-border/70 px-4 py-2.5 sm:px-5 no-scrollbar" aria-label="해석형 필터">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">빠른 해석</span>
          {INSIGHT_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setInsight(item.id)}
              aria-pressed={insight === item.id}
              className={cn(
                "shrink-0 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
                insight === item.id ? "border-brand bg-brand text-brand-foreground" : "border-border bg-surface text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="max-h-[680px] overflow-auto">
            <table className="min-w-[1240px] w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">종목</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">섹터·산업</th>
                  <SortableTh label="가격" sortKey="price" sort={sort} onSort={cycleSort} />
                  <SortableTh label="등락" sortKey="change" sort={sort} onSort={cycleSort} />
                  <SortableTh label="거래대금" sortKey="volume" sort={sort} onSort={cycleSort} />
                  {PERIODS.map((item) => (
                    <SortableTh key={item.id} label={`${item.id.toUpperCase()} 대비`} sortKey={item.id} sort={sort} onSort={cycleSort} active={period === item.id} />
                  ))}
                  <SortableTh label="시총" sortKey="marketCap" sort={sort} onSort={cycleSort} />
                  <SortableTh label="신호" sortKey="signal" sort={sort} onSort={cycleSort} align="left" />
                  <th className="whitespace-nowrap py-2.5 pr-4 text-right font-medium">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {rows.map((stock) => (
                  <tr key={stock.ticker} className="transition-colors hover:bg-secondary/50">
                    <td className="whitespace-nowrap py-2.5 pl-4 pr-3">
                      <div className="flex flex-col leading-tight">
                        <span className="font-mono text-[13px] font-semibold tabular">{stock.ticker}</span>
                        <span className="text-[11px] text-muted-foreground">{stock.name}</span>
                      </div>
                    </td>
                    <td className="py-2.5 pr-3 text-xs">
                      <div>{stock.sector}</div>
                      <div className="text-[11px] text-muted-foreground">{stock.industry || "산업 미수집"}</div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">${fmtPrice(stock.price)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right"><DeltaText value={stock.change} /></td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">{fmtMoney(stock.volume)}</td>
                    {PERIODS.map((item) => {
                      const value = stock.volumeVs?.[item.id] ?? 0;
                      return (
                        <td key={item.id} className={cn("whitespace-nowrap py-2.5 pr-3 text-right font-medium tabular", period === item.id && "bg-brand/[0.04]", value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted-foreground")}>
                          <span title={Math.abs(value) >= 200 ? "평균 거래대금이 작거나 일시적 거래가 집중되면 변화율이 크게 확대될 수 있습니다." : undefined}>
                            {fmtPct(value)}{Math.abs(value) >= 200 && <sup className="ml-0.5 text-[8px] text-warning">주의</sup>}
                          </span>
                        </td>
                      );
                    })}
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular text-muted-foreground">{fmtMcap(stock.marketCap)}</td>
                    <td className="whitespace-nowrap py-2.5 pr-3"><SignalBadge signal={stock.signal} size="xs" /></td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <IconAction label="가격 차트" href={`https://finance.yahoo.com/quote/${stock.ticker}/chart/`} external icon={<LineChart className="h-3.5 w-3.5" />} />
                        <IconAction label="내부자 거래" href={`/insider/?ticker=${encodeURIComponent(stock.ticker)}`} active={stock.hasInsider} icon={<Users className="h-3.5 w-3.5" />} />
                        <IconAction label="IPO 정보" href={`/ipo-lockup/?ticker=${encodeURIComponent(stock.ticker)}`} active={stock.isIpo} icon={<Rocket className="h-3.5 w-3.5" />} />
                        <IconAction label="관련 뉴스" href={`https://finance.yahoo.com/quote/${stock.ticker}/news/`} external active icon={<Newspaper className="h-3.5 w-3.5" />} />
                        <IconAction
                          label={watch.includes(stock.ticker) ? "관심 종목 제거" : "관심 종목 추가"}
                          onClick={() => toggleWatch(stock.ticker)}
                          active={watch.includes(stock.ticker)}
                          icon={<Star className={cn("h-3.5 w-3.5", watch.includes(stock.ticker) && "fill-current")} />}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={12} className="py-12 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function SortableTh({ label, sortKey, sort, onSort, active, align = "right" }: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; mode: SortMode };
  onSort: (key: SortKey) => void;
  active?: boolean;
  align?: "left" | "right";
}) {
  const selected = sort.key === sortKey;
  const indicator = !selected ? "" : sort.mode === "desc" ? "↓" : sort.mode === "asc" ? "↑" : "≈";
  const description = !selected ? "정렬" : sort.mode === "desc" ? "높은 순" : sort.mode === "asc" ? "낮은 순" : "평균 근접 순";
  return (
    <th className={cn("whitespace-nowrap py-2.5 pr-3 font-medium", align === "right" ? "text-right" : "text-left", active && "text-foreground")}>
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

function IconAction({ label, icon, active, onClick, href, external }: {
  label: string; icon: React.ReactNode; active?: boolean; onClick?: () => void; href?: string; external?: boolean;
}) {
  const className = cn(
    "relative grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active && "text-brand",
  );
  const content = <>{icon}{active && <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />}</>;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {href ? (
          <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} aria-label={label} className={className}>{content}</a>
        ) : (
          <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className={className}>{content}</button>
        )}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );
}
