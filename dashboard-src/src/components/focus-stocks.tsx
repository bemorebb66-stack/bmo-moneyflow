import { ArrowRight, Crosshair } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { MetricInfo } from "./metric-info";
import { SURGE_STOCKS } from "@/lib/mock-data";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

export function FocusStocks() {
  const rows = [...SURGE_STOCKS]
    .sort(
      (a, b) =>
        (b.volumeVs?.["20d"] ?? (b.volumeRatio - 1) * 100) -
        (a.volumeVs?.["20d"] ?? (a.volumeRatio - 1) * 100),
    )
    .slice(0, 5);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/70 px-4 py-3 sm:px-5">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-brand/10 text-brand">
            <Crosshair className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h2 className="text-base font-semibold">
                오늘 거래대금이 집중된 종목
              </h2>
              <MetricInfo label="급증 기준">
                당일 거래대금을 직전 20거래일 평균과 비교합니다. 비율이 높을수록
                평소보다 거래 참여가 크게 늘었다는 뜻이며, 상승 지속을
                보장하지는 않습니다.
              </MetricInfo>
            </div>
            <p className="text-[11px] text-muted-foreground">
              시장 전체에서 섹터를 거쳐 실제 확인할 종목으로 이어집니다.
            </p>
          </div>
          <a
            href="/scanner/"
            className="inline-flex min-h-9 items-center gap-1 text-xs font-semibold text-brand hover:underline"
          >
            전체 보기 <ArrowRight className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="divide-y divide-border/70">
          {rows.map((stock) => {
            const change20d =
              stock.volumeVs?.["20d"] ?? (stock.volumeRatio - 1) * 100;
            const ratio = Math.max(0, 1 + change20d / 100);
            return (
              <a
                key={stock.ticker}
                href={`/stock/?ticker=${encodeURIComponent(stock.ticker)}`}
                className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/50 sm:grid-cols-[minmax(220px,1.4fr)_1fr_1fr_1fr_auto] sm:px-5"
              >
                <div className="min-w-0">
                  <span className="font-mono text-sm font-semibold">
                    {stock.ticker}
                  </span>
                  <span className="ml-2 truncate text-xs text-muted-foreground">
                    {stock.name}
                  </span>
                  <div className="truncate text-[11px] text-muted-foreground sm:hidden">
                    {stock.sector} · {fmtMoney(stock.volume)}
                  </div>
                </div>
                <div className="hidden text-right sm:block">
                  <div className="text-[10px] text-muted-foreground">
                    거래대금
                  </div>
                  <div className="text-sm font-medium tabular">
                    {fmtMoney(stock.volume)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">
                    20일 평균 대비
                  </div>
                  <div className="text-sm font-semibold tabular text-brand">
                    {ratio.toFixed(1)}배
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">주가</div>
                  <div
                    className={cn(
                      "text-sm font-semibold tabular",
                      stock.change > 0
                        ? "text-success"
                        : stock.change < 0
                          ? "text-danger"
                          : "text-muted-foreground",
                    )}
                  >
                    {fmtPct(stock.change)}
                  </div>
                </div>
                <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" />
              </a>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
