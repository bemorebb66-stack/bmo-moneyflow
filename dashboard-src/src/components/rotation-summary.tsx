import { CircleHelp, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { DeltaText } from "./signal-badge";
import type { Sector } from "@/lib/mock-data";
import { fmtBp, fmtMoney } from "@/lib/format";

export function RotationSummary({ rows, categoryLabel, periodLabel }: {
  rows: Sector[];
  categoryLabel: string;
  periodLabel: string;
}) {
  const inflows = [...rows]
    .sort((a, b) => b.shareDelta - a.shareDelta)
    .slice(0, 3);
  const outflows = [...rows]
    .sort((a, b) => a.shareDelta - b.shareDelta)
    .slice(0, 3);
  const totalVol = rows.reduce((s, x) => s + x.volume, 0);
  const advancers = rows.filter((s) => s.priceChange > 0).length;
  const topNames = inflows.slice(0, 2).map((row) => row.name).join("·");
  const bottomNames = outflows.slice(0, 2).map((row) => row.name).join("·");

  return (
    <section aria-label="오늘의 자금 로테이션" className="grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
      <Card className="border-brand/15 bg-gradient-to-br from-brand/[0.06] to-transparent">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            {periodLabel} {categoryLabel} 자금 로테이션
          </div>
          <p className="mt-2 text-base font-semibold leading-snug text-foreground sm:text-lg">
            오늘은 {topNames}로 거래가 이동하고, {bottomNames}의 관심은 감소했습니다.
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {topNames}의 거래 비중이 확대됐고, {bottomNames}에서는 시장 점유율이 축소됐습니다.
          </p>
          <TooltipProvider delayDuration={100}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                  <CircleHelp className="h-3.5 w-3.5" />
                  이게 왜 중요한가요?
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                거래대금 점유율이 커지면 시장 참여자의 관심이 해당 그룹에 더 집중됐다는 뜻입니다. 실제 순매수액이 아니라 관심의 이동을 보여주는 지표입니다.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/70 pt-4 text-sm">
            <Metric label="전체 거래대금" value={fmtMoney(totalVol)} />
            <Metric
              label="상승 그룹"
              value={`${advancers} / ${rows.length}`}
            />
            <Metric label="상승 비율" value={`${Math.round((advancers / Math.max(1, rows.length)) * 100)}%`} tone="success" />
          </div>
        </CardContent>
      </Card>

      <FlowCard
        tone="success"
        title="유입 상위"
        icon={<TrendingUp className="h-4 w-4" />}
        rows={inflows}
      />
      <FlowCard
        tone="danger"
        title="유출 상위"
        icon={<TrendingDown className="h-4 w-4" />}
        rows={outflows}
      />
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`truncate text-base font-semibold tabular ${
          tone === "success"
            ? "text-success"
            : tone === "danger"
              ? "text-danger"
              : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function FlowCard({
  tone,
  title,
  icon,
  rows,
}: {
  tone: "success" | "danger";
  title: string;
  icon: React.ReactNode;
  rows: Sector[];
}) {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
            tone === "success" ? "text-success" : "text-danger"
          }`}
        >
          {icon}
          {title}
        </div>
        <ul className="mt-3 space-y-2.5">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-[11px] text-muted-foreground tabular">
                  {fmtMoney(r.volume)} · 점유율 {r.share.toFixed(1)}%
                </div>
              </div>
              <div className="shrink-0 text-right">
                <DeltaText value={r.shareDelta} suffix=" bp" digits={0} />
                <div className="text-[11px] text-muted-foreground tabular">
                  {fmtBp(r.shareDelta)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
