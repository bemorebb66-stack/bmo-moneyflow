import { ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
import { MARKET_INDEXES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const INDEX_ORDER = ["sp500", "russell2000", "dow", "nasdaq"];

export function MarketIndexPanel() {
  const rows = [...MARKET_INDEXES].sort(
    (a, b) => INDEX_ORDER.indexOf(a.id) - INDEX_ORDER.indexOf(b.id),
  );
  const asOf = rows[0]?.asOf;

  return (
    <aside className="hidden min-w-0 2xl:block" aria-label="미국 주요 시장지수">
      <div className="sticky top-[76px] border-l border-border/70 pl-5">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-brand" />
          <div>
            <h2 className="text-xs font-semibold">미국 주요 지수</h2>
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
      </div>
    </aside>
  );
}
