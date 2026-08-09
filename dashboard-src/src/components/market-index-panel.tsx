import { ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
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
    <aside className="hidden min-w-0 2xl:block" aria-label="검색·환율·주요지수">
      <div className="sticky top-[76px] flex flex-col gap-3 border-l border-border/70 pl-5">
        <GlobalSearch />
        <div className="inline-flex h-10 w-full items-center rounded-md border border-border bg-background p-0.5" role="group" aria-label="표시 통화">
          {(["USD", "KRW"] as const).map((unit) => (
            <button key={unit} type="button" onClick={() => currency.setCurrency(unit)} disabled={unit === "KRW" && !currency.exchange} aria-pressed={currency.currency === unit} className={cn("min-h-9 flex-1 rounded px-2 text-xs font-semibold", currency.currency === unit ? "bg-brand text-brand-foreground" : "text-muted-foreground hover:bg-secondary", unit === "KRW" && !currency.exchange && "opacity-40")}>
              {unit}
            </button>
          ))}
        </div>
        <section className="rounded-lg border border-border/70 bg-background p-3" aria-labelledby="market-index-title">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand" />
            <div>
              <h2 id="market-index-title" className="text-xs font-semibold">미국 주요 지수</h2>
              <p className="text-[10px] text-muted-foreground">정규장 종가 기준</p>
            </div>
          </div>

        {rows.length ? (
          <ul className="mt-3 divide-y divide-border/60">
            {rows.map((row) => {
              const positive = row.change > 0;
              const Icon = positive ? ArrowUpRight : ArrowDownRight;
              return (
                <li key={row.id} className="py-2.5 first:pt-0">
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

        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
          {asOf ? `${asOf} · ` : ""}Yahoo Finance 장마감 일봉
        </p>
        </section>
        {currency.exchange && <span className="text-[10px] leading-4 text-muted-foreground">1달러 {currency.exchange.rate.toLocaleString("ko-KR")}원<br />환율 기준일 {currency.exchange.marketDate}</span>}
      </div>
    </aside>
  );
}
