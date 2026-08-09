import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronDown } from "lucide-react";
import { MARKET_INDEXES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { GlobalSearch } from "./global-search";
import type { useCurrencyPreference } from "@/lib/currency";

const INDEX_ORDER = ["sp500", "nasdaq", "russell2000", "dow"];

export function MarketIndexPanel({ currency }: { currency: ReturnType<typeof useCurrencyPreference> }) {
  const rows = MARKET_INDEXES.filter((row) => INDEX_ORDER.includes(row.id)).sort(
    (a, b) => INDEX_ORDER.indexOf(a.id) - INDEX_ORDER.indexOf(b.id),
  );
  const asOf = rows[0]?.asOf;

  return (
    <aside className="border-b border-border/70 bg-surface/70" aria-label="검색·환율·주요지수">
      <div className="mx-auto flex min-h-12 max-w-[1400px] items-center gap-2 overflow-visible px-3 py-1.5 sm:px-4 lg:px-6">
        <GlobalSearch />
        <div className="inline-flex h-10 items-center rounded-md border border-border bg-background p-0.5" role="group" aria-label="표시 통화">
          {(["USD", "KRW"] as const).map((unit) => (
            <button key={unit} type="button" onClick={() => currency.setCurrency(unit)} disabled={unit === "KRW" && !currency.exchange} aria-pressed={currency.currency === unit} className={cn("min-h-9 rounded px-3 text-xs font-semibold", currency.currency === unit ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-secondary", unit === "KRW" && !currency.exchange && "opacity-40")}>
              {unit}
            </button>
          ))}
        </div>
        <details className="group relative">
          <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-semibold hover:bg-secondary">
            <BarChart3 className="h-4 w-4 text-brand" />
            주요지수
            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <div className="absolute right-0 top-full z-50 mt-1 w-[280px] rounded-xl border border-border bg-popover p-3 shadow-lg sm:left-0 sm:right-auto">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xs font-semibold">미국 주요 지수</h2>
              <span className="text-[10px] text-muted-foreground">정규장 종가 기준</span>
            </div>

        {rows.length ? (
          <ul className="mt-2 grid grid-cols-2 gap-2">
            {rows.map((row) => {
              const positive = row.change > 0;
              const Icon = positive ? ArrowUpRight : ArrowDownRight;
              return (
                <li key={row.id} className="rounded-lg border border-border/70 bg-background p-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{row.name}</span>
                    <span
                      className={cn(
                        "inline-flex items-center text-xs font-semibold tabular",
                        positive
                          ? "text-success"
                          : row.change < 0
                            ? "text-danger"
                            : "text-muted-foreground",
                      )}
                    >
                      <Icon className="mr-0.5 h-3 w-3" />
                      {positive ? "+" : ""}
                      {row.change.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular">
                    {row.value.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 rounded-md bg-surface-2 px-3 py-3 text-[11px] text-muted-foreground">
            지수 데이터를 확인하고 있습니다.
          </p>
        )}

        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {asOf ? `${asOf} · ` : ""}Yahoo Finance 장마감 일봉
        </p>
          </div>
        </details>
        {currency.exchange && <span className="hidden text-[11px] text-muted-foreground md:inline">1달러 {currency.exchange.rate.toLocaleString("ko-KR")}원 · {currency.exchange.marketDate}</span>}
      </div>
    </aside>
  );
}
