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

export function SurgeTable() {
  const [period, setPeriod] = useState<MarketPeriod>("20d");
  const [query, setQuery] = useState("");
  const [watch, setWatch] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("bmoWatch") || "[]"); } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem("bmoWatch", JSON.stringify(watch));
  }, [watch]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SURGE_STOCKS.filter((stock) =>
      !q || stock.ticker.toLowerCase().includes(q) || stock.name.toLowerCase().includes(q) ||
      stock.sector.toLowerCase().includes(q) || stock.industry?.toLowerCase().includes(q),
    ).sort((a, b) => (b.volumeVs?.[period] ?? 0) - (a.volumeVs?.[period] ?? 0));
  }, [period, query]);

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
              선택 기간 평균 대비 거래대금 증가율 순 · {rows.length}건
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
                  onClick={() => setPeriod(item.id)}
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

        <TooltipProvider delayDuration={150}>
          <div className="max-h-[680px] overflow-auto">
            <table className="min-w-[1240px] w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2/90 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">종목</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">섹터·산업</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">가격</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">등락</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">거래대금</th>
                  {PERIODS.map((item) => (
                    <th key={item.id} className={cn("whitespace-nowrap py-2.5 pr-3 text-right font-medium", period === item.id && "text-foreground")}>
                      {item.id.toUpperCase()} 대비
                    </th>
                  ))}
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">시총</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">신호</th>
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
                          {fmtPct(value)}
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
