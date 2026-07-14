import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, FlaskConical } from "lucide-react";
import { LIVE_META, type DataStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const STATUS: Record<DataStatus, { label: string; className: string }> = {
  loading: { label: "업데이트 확인 중", className: "text-info" },
  normal: { label: "데이터 정상", className: "text-success" },
  stale: { label: "이전 데이터 표시 중", className: "text-warning" },
  partial: { label: "일부 데이터 지연", className: "text-warning" },
  failed: { label: "업데이트 실패", className: "text-danger" },
};

function formatMarketDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replaceAll("-", ".") : "확인 중";
}

function formatUpdatedAt(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC$/);
  if (!match) return value === "-" ? "확인 중" : value;
  const [, year, month, day, hour, minute] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)));
  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}.${part("month")}.${part("day")} ${part("hour")}:${part("minute")} KST`;
}

export function DataStatusBar() {
  const status = STATUS[LIVE_META.status];
  const StatusIcon = LIVE_META.status === "normal" ? CheckCircle2 : AlertTriangle;
  const warning = LIVE_META.status === "stale"
    ? `${formatMarketDate(LIVE_META.asOf)} 기준의 이전 데이터를 표시하고 있습니다.`
    : LIVE_META.status === "partial"
      ? LIVE_META.error || "일부 보조 데이터가 지연되고 있습니다."
    : LIVE_META.status === "failed"
      ? "최신 데이터를 불러오지 못했습니다. 화면의 수치를 투자 판단에 사용하지 마세요."
      : null;

  return (
    <div className={cn(
      "mt-3 rounded-lg border px-3 py-2.5 text-xs sm:text-[11px]",
      warning ? "border-warning/30 bg-warning/[0.07]" : "border-border/70 bg-surface",
    )} role="status" aria-live="polite">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" />
          기준일 <strong className="font-semibold text-foreground">{formatMarketDate(LIVE_META.asOf)} 미국 정규장 종가</strong>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock3 className="h-3.5 w-3.5" />
          최종 업데이트 <strong className="font-semibold text-foreground">{formatUpdatedAt(LIVE_META.updatedAt)}</strong>
        </span>
        <span className={cn("inline-flex items-center gap-1.5 font-semibold", status.className)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {status.label}
        </span>
        <a href="/methodology/" className="ml-auto inline-flex min-h-8 items-center gap-1.5 font-semibold text-brand hover:underline sm:min-h-0">
          <FlaskConical className="h-3.5 w-3.5" />
          출처·산식 보기
        </a>
      </div>
      {warning && <p className="mt-2 border-t border-warning/20 pt-2 font-medium text-warning">{warning}</p>}
    </div>
  );
}
