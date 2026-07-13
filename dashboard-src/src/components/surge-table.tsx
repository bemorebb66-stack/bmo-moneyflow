import { LineChart, Users, Rocket, Newspaper, Star } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { SignalBadge, DeltaText } from "./signal-badge";
import { SURGE_STOCKS } from "@/lib/mock-data";
import { fmtMcap, fmtMoney, fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";

export function SurgeTable({
  onAddToChart,
}: {
  onAddToChart?: (ticker: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base font-semibold sm:text-lg">거래대금 급증 종목</h2>
            <p className="text-[11px] text-muted-foreground">
              20일 평균 대비 거래대금이 크게 증가한 종목 · {SURGE_STOCKS.length}건
            </p>
          </div>
        </div>

        <TooltipProvider delayDuration={150}>
          <div className="max-h-[560px] overflow-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="sticky top-0 z-10 bg-surface-2/80 text-[11px] uppercase tracking-wide text-muted-foreground backdrop-blur">
                <tr>
                  <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">종목</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">섹터</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">가격</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">변화율</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">거래대금</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">
                    20D 배수
                  </th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">시총</th>
                  <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">신호</th>
                  <th className="whitespace-nowrap py-2.5 pr-4 text-right font-medium">액션</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {SURGE_STOCKS.map((s) => (
                  <tr key={s.ticker} className="transition-colors hover:bg-secondary/50">
                    <td className="whitespace-nowrap py-2.5 pl-4 pr-3">
                      <div className="flex flex-col leading-tight">
                        <span className="font-mono text-[13px] font-semibold tabular">
                          {s.ticker}
                        </span>
                        <span className="text-[11px] text-muted-foreground">{s.name}</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-muted-foreground">
                      {s.sector}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                      ${fmtPrice(s.price)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                      <DeltaText value={s.change} />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                      {fmtMoney(s.volume)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular",
                          s.volumeRatio >= 2
                            ? "bg-brand/10 text-brand"
                            : "bg-secondary text-foreground",
                        )}
                      >
                        ×{s.volumeRatio.toFixed(1)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular text-muted-foreground">
                      {fmtMcap(s.marketCap)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-3">
                      <SignalBadge signal={s.signal} size="xs" />
                    </td>
                    <td className="whitespace-nowrap py-2.5 pr-4 text-right">
                      <div className="inline-flex items-center gap-0.5">
                        <IconAction
                          label="차트 추가"
                          icon={<LineChart className="h-3.5 w-3.5" />}
                          onClick={() => onAddToChart?.(s.ticker)}
                        />
                        <IconAction
                          label="내부자 거래"
                          icon={<Users className="h-3.5 w-3.5" />}
                          active={s.hasInsider}
                        />
                        <IconAction
                          label="IPO 정보"
                          icon={<Rocket className="h-3.5 w-3.5" />}
                          active={s.isIpo}
                        />
                        <IconAction
                          label="관련 뉴스"
                          icon={<Newspaper className="h-3.5 w-3.5" />}
                          active={s.hasNews}
                        />
                        <IconAction
                          label="관심 종목 추가"
                          icon={<Star className="h-3.5 w-3.5" />}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

function IconAction({
  label,
  icon,
  active,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            active && "text-brand",
          )}
        >
          {icon}
          {active && (
            <span
              className="absolute -mr-4 -mt-4 h-1.5 w-1.5 rounded-full bg-brand"
              aria-hidden
            />
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

