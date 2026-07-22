import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleHelp, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { DeltaText } from "./signal-badge";
import type { Sector } from "@/lib/mock-data";
import { fmtMoney } from "@/lib/format";
import { ShareMenu } from "./share-menu";

export function RotationSummary({ rows, categoryLabel, periodLabel }: {
  rows: Sector[];
  categoryLabel: string;
  periodLabel: string;
}) {
  const SHARE_EPSILON = 0.5;
  const inflows = [...rows]
    .filter((row) => row.shareDelta > SHARE_EPSILON)
    .sort((a, b) => b.shareDelta - a.shareDelta)
    .slice(0, 3);
  const outflows = [...rows]
    .filter((row) => row.shareDelta < -SHARE_EPSILON)
    .sort((a, b) => a.shareDelta - b.shareDelta)
    .slice(0, 3);
  const totalVol = rows.reduce((s, x) => s + x.volume, 0);
  const advancers = rows.filter((s) => s.priceChange > 0).length;
  const topNames = inflows.slice(0, 2).map((row) => row.name).join("·");
  const bottomNames = outflows.slice(0, 2).map((row) => row.name).join("·");
  const headline = inflows.length && outflows.length
    ? `${topNames}로 관심 이동, ${bottomNames} 비중은 축소`
    : inflows.length
      ? `${topNames}의 거래대금 점유율이 확대`
      : outflows.length
        ? `${bottomNames}의 거래대금 점유율이 축소`
        : "그룹별 거래대금 점유율 변화가 크지 않습니다";
  const description = inflows.length && outflows.length
    ? `${topNames}의 거래 비중이 확대됐고, ${bottomNames}에서는 시장 점유율이 축소됐습니다.`
    : "전일 대비 거래대금 점유율이 유의미하게 변한 그룹만 표시합니다.";

  return (
    <section data-nosnippet aria-label="오늘의 거래대금 로테이션" className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-[1.4fr_1fr_1fr]">
      <Card className="col-span-2 border-brand/20 bg-brand/[0.055] dark:bg-brand/[0.08] lg:col-span-1">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-brand">
            <Sparkles className="h-3.5 w-3.5" />
            MARKET PULSE · {periodLabel} {categoryLabel}
          </div>
          <p className="mt-2 text-base font-semibold leading-snug text-foreground sm:text-lg">
            {headline}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" className="inline-flex min-h-10 items-center gap-1 text-xs font-medium text-brand hover:underline sm:min-h-0">
                    <CircleHelp className="h-3.5 w-3.5" />
                    이게 왜 중요한가요?
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  거래대금 점유율이 커지면 시장 참여자의 관심이 해당 그룹에 더 집중됐다는 뜻입니다. 실제 순매수액이 아니라 관심의 이동을 보여주는 지표입니다.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-2">
              <ShareMenu label="브리핑 공유" />
              <Link
                to="/scanner"
                className="inline-flex min-h-10 items-center gap-1.5 rounded-md border border-brand/25 bg-brand/10 px-3 text-xs font-semibold text-brand transition-colors hover:bg-brand/15 sm:min-h-8"
              >
                {inflows[0]?.name ?? categoryLabel} 관련 종목 보기
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/70 pt-4 text-sm">
            <Metric label="전체 거래대금" value={fmtMoney(totalVol)} tone="brand" />
            <Metric
              label="가격 상승 그룹"
              value={`${advancers} / ${rows.length}`}
              tone="brand"
            />
            <Metric label="가격 상승 비율" value={`${Math.round((advancers / Math.max(1, rows.length)) * 100)}%`} tone="success" />
          </div>
        </CardContent>
      </Card>

      <FlowCard
        tone="success"
        title="점유율 확대"
        icon={<TrendingUp className="h-4 w-4" />}
        rows={inflows}
      />
      <FlowCard
        tone="danger"
        title="점유율 축소"
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
  tone?: "brand" | "success" | "danger";
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={`truncate text-base font-semibold tabular ${
          tone === "brand"
            ? "text-brand"
            : tone === "success"
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
      <CardContent className="p-3 sm:p-5">
        <div
          className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide ${
            tone === "success" ? "text-success" : "text-danger"
          }`}
        >
          {icon}
          {title}
        </div>
        <ul className="mt-2.5 space-y-2.5 sm:mt-3">
          {rows.map((r, index) => (
            <li key={r.id} className={index > 1 ? "hidden items-center justify-between gap-3 sm:flex" : "flex items-center justify-between gap-2"}>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{r.name}</div>
                <div className="truncate text-[11px] text-muted-foreground tabular">
                  {fmtMoney(r.volume)} · 점유율 {r.share.toFixed(1)}%
                </div>
              </div>
              <div className="shrink-0 text-right">
                <DeltaText value={r.shareDelta} suffix=" bp" digits={0} />
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="py-5 text-center text-xs text-muted-foreground">
              해당 방향의 유의미한 변화가 없습니다.
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
