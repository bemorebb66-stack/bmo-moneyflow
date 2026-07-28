import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  History,
  Info,
  Search,
} from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LOCKUP_META, LOCKUP_ROWS, type LockupRow } from "@/lib/mock-data";
import { fmtMcap } from "@/lib/format";

export const Route = createFileRoute("/ipo-lockup")({
  head: () => ({
    meta: [
      { title: "미국 IPO 락업 해제 일정·과거 이력 | BVT Money Flow" },
      {
        name: "description",
        content:
          "미국 상장기업의 IPO 락업 해제 예정 일정과 과거 이력을 SEC 공시 근거와 함께 확인하세요.",
      },
      {
        property: "og:title",
        content: "미국 IPO 락업 해제 일정·과거 이력",
      },
      {
        property: "og:description",
        content: "예정 일정과 과거 이력을 구분하고 SEC 근거 문서를 함께 제공합니다.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://www.bvtmoneyflow.xyz/ipo-lockup/" },
    ],
  }),
  component: LockupPage,
});

type ViewFilter = "upcoming" | "past" | "all";
type WindowFilter = "all" | "14" | "30" | "90";

function LockupPage() {
  const [view, setView] = useState<ViewFilter>("upcoming");
  const [win, setWin] = useState<WindowFilter>("all");
  const [query, setQuery] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("ticker") ?? ""),
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LOCKUP_ROWS.filter((row) => {
      if (view === "upcoming" && row.daysLeft < 0) return false;
      if (view === "past" && row.daysLeft >= 0) return false;
      if (
        view !== "past" &&
        win !== "all" &&
        (row.daysLeft < 0 || row.daysLeft > Number(win))
      )
        return false;
      return (
        !q ||
        row.ticker.toLowerCase().includes(q) ||
        row.company.toLowerCase().includes(q)
      );
    }).sort((a, b) =>
      view === "past"
        ? b.unlockDate.localeCompare(a.unlockDate)
        : a.unlockDate.localeCompare(b.unlockDate),
    );
  }, [query, view, win]);

  const upcoming = LOCKUP_ROWS.filter((row) => row.daysLeft >= 0);
  const past = LOCKUP_ROWS.filter((row) => row.daysLeft < 0);
  const within14 = upcoming.filter((row) => row.daysLeft <= 14).length;
  const within30 = upcoming.filter((row) => row.daysLeft <= 30).length;
  const reviewNeeded = LOCKUP_ROWS.filter(
    (row) => row.dataState === "review-needed",
  ).length;

  return (
    <PageShell>
      <PageHeading
        title="IPO 락업"
        description="락업 해제 예정 일정과 과거 이력을 SEC 공시 근거와 함께 확인하세요."
      />

      <div className="space-y-4 sm:space-y-5">
        <div
          role="status"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-[11px] text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5 font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            상장·날짜 검증 완료
          </span>
          <span>
            유효 일정{" "}
            <strong className="text-foreground">
              {LOCKUP_META.activeCount || LOCKUP_ROWS.length}건
            </strong>
          </span>
          <span>
            검토 제외{" "}
            <strong className="text-foreground">
              {LOCKUP_META.excludedCount}건
            </strong>
          </span>
          <span>
            최종 검증{" "}
            <strong className="text-foreground">
              {formatVerifiedAt(LOCKUP_META.validatedAt)}
            </strong>
          </span>
          <span className="ml-auto">출처 · SEC EDGAR 424B4</span>
        </div>

        <div className="flex items-start gap-3 rounded-lg border border-info/25 bg-info/5 px-4 py-3 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <p className="leading-5">
            <strong className="text-foreground">날짜 상태를 확인하세요.</strong>{" "}
            투자설명서의 락업 기간으로 계산한 날짜는 <b>추정</b>으로 표시합니다.
            조기 해제 조건, 실적 발표일, 거래소 휴장일에 따라 실제 매도 가능일이
            달라질 수 있으며, 투자 판단 전 SEC 원문 확인이 필요합니다.
          </p>
        </div>

        <section
          aria-label="IPO 락업 요약"
          className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
        >
          <SummaryCard label="14일 이내 예정" value={`${within14}건`} />
          <SummaryCard label="30일 이내 예정" value={`${within30}건`} />
          <SummaryCard
            label="상장·일정 검증"
            value={`${LOCKUP_ROWS.length - reviewNeeded}건`}
          />
          <SummaryCard label="과거 이력" value={`${past.length}건`} />
        </section>

        <div className="sticky top-14 z-30 -mx-4 space-y-3 border-y border-border/70 bg-background/95 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-xl lg:border">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <Segmented
              label="구분"
              value={view}
              onChange={(value) => setView(value as ViewFilter)}
              options={[
                { id: "upcoming", label: "예정 일정" },
                { id: "past", label: "과거 이력" },
                { id: "all", label: "전체" },
              ]}
            />
            {view !== "past" && (
              <Segmented
                label="기간"
                value={win}
                onChange={(value) => setWin(value as WindowFilter)}
                options={[
                  { id: "all", label: "전체" },
                  { id: "14", label: "14일" },
                  { id: "30", label: "30일" },
                  { id: "90", label: "90일" },
                ]}
              />
            )}
            <div className="relative lg:ml-auto lg:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="티커·기업명 검색"
                className="h-10 pl-9"
              />
            </div>
          </div>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
              <div>
                <h2 className="text-base font-semibold sm:text-lg">
                  {view === "past"
                    ? "과거 락업 해제 이력"
                    : view === "all"
                      ? "전체 락업 일정"
                      : "다가오는 락업 해제"}
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  {rows.length}건 ·{" "}
                  {view === "past" ? "최근 해제일 순" : "가까운 예정일 순"}
                </p>
              </div>
              {view === "past" ? (
                <History className="h-5 w-5 text-muted-foreground" />
              ) : (
                <CalendarClock className="h-5 w-5 text-brand" />
              )}
            </div>

            <div className="divide-y divide-border/70 lg:hidden">
              {rows.map((row) => (
                <LockupCard key={`${row.ticker}-${row.unlockDate}`} row={row} />
              ))}
              {rows.length === 0 && <EmptyState />}
            </div>

            <div className="hidden overflow-x-auto lg:block">
              <LockupTable rows={rows} />
            </div>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function LockupCard({ row }: { row: LockupRow }) {
  return (
    <article className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/stock/?ticker=${encodeURIComponent(row.ticker)}`}
              className="font-mono text-sm font-semibold hover:text-brand"
            >
              {row.ticker}
            </a>
            <VerificationBadge state={row.dataState} />
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {row.company}
          </p>
        </div>
        <DdayBadge days={row.daysLeft} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Metric label="IPO일" value={row.ipoDate || "미수집"} />
        <Metric label="락업 해제일" value={row.unlockDate || "미수집"} />
        <Metric
          label="락업 기간"
          value={row.lockupDays ? `${row.lockupDays}일` : "미수집"}
        />
        <Metric
          label="시가총액"
          value={row.marketCap > 0 ? fmtMcap(row.marketCap) : "미수집"}
        />
      </dl>

      <SourceBlock row={row} />
    </article>
  );
}

function LockupTable({ rows }: { rows: LockupRow[] }) {
  return (
    <table className="w-full min-w-[1040px] text-sm">
      <thead className="bg-surface-2/60 text-[11px] text-muted-foreground">
        <tr>
          <TableHead>종목</TableHead>
          <TableHead>IPO일</TableHead>
          <TableHead>락업 해제일</TableHead>
          <TableHead>남은 기간</TableHead>
          <TableHead>락업 기간</TableHead>
          <TableHead>공모가</TableHead>
          <TableHead>시가총액</TableHead>
          <TableHead>검증 상태·근거</TableHead>
        </tr>
      </thead>
      <tbody className="divide-y divide-border/70">
        {rows.map((row) => (
          <tr
            key={`${row.ticker}-${row.unlockDate}`}
            className="hover:bg-secondary/40"
          >
            <td className="px-4 py-3">
              <a
                href={`/stock/?ticker=${encodeURIComponent(row.ticker)}`}
                className="font-mono text-[13px] font-semibold hover:text-brand"
              >
                {row.ticker}
              </a>
              <div className="max-w-56 truncate text-[11px] text-muted-foreground">
                {row.company}
              </div>
            </td>
            <td className="px-4 py-3 tabular">{row.ipoDate || "미수집"}</td>
            <td className="px-4 py-3 font-medium tabular">
              {row.unlockDate || "미수집"}
            </td>
            <td className="px-4 py-3">
              <DdayBadge days={row.daysLeft} />
            </td>
            <td className="px-4 py-3 tabular">
              {row.lockupDays ? `${row.lockupDays}일` : "미수집"}
            </td>
            <td className="px-4 py-3 tabular">
              {row.ipoPrice ? `$${row.ipoPrice.toFixed(2)}` : "미수집"}
            </td>
            <td className="px-4 py-3 tabular">
              {row.marketCap > 0 ? fmtMcap(row.marketCap) : "미수집"}
            </td>
            <td className="max-w-80 px-4 py-3">
              <SourceBlock row={row} compact />
            </td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr>
            <td colSpan={8}>
              <EmptyState />
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function SourceBlock({
  row,
  compact = false,
}: {
  row: LockupRow;
  compact?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <VerificationBadge state={row.dataState} />
        {row.sourceUrl && (
          <a
            href={row.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] font-medium text-brand hover:underline"
          >
            {row.sourceLabel || "SEC 근거 문서"}
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
      {!compact && (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {row.verificationNote || "근거 문서와 세부 조건을 추가 확인 중입니다."}
        </p>
      )}
      {!compact && row.validatedAt && (
        <p className="text-[10px] text-muted-foreground">
          최종 검증 {formatVerifiedAt(row.validatedAt)}
        </p>
      )}
    </div>
  );
}

function VerificationBadge({
  state = "uncollected",
}: {
  state?: LockupRow["dataState"];
}) {
  const meta =
    state === "confirmed"
      ? {
          label: "공시 확인",
          icon: CheckCircle2,
          cls: "border-success/25 bg-success/10 text-success",
        }
      : state === "estimated"
        ? {
            label: "상장 확인·일정 추정",
            icon: FileSearch,
            cls: "border-info/25 bg-info/10 text-info",
          }
        : state === "review-needed"
          ? {
              label: "추가 검토 필요",
              icon: FileSearch,
              cls: "border-danger/25 bg-danger/10 text-danger",
            }
        : {
            label: "추가 확인 필요",
            icon: FileSearch,
            cls: "border-border bg-muted text-muted-foreground",
          };
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        meta.cls,
      )}
    >
      <Icon className="h-3 w-3" />
      {meta.label}
    </span>
  );
}

function DdayBadge({ days }: { days: number }) {
  const tone =
    days < 0
      ? "border-border bg-muted text-muted-foreground"
      : days <= 7
        ? "border-danger/25 bg-danger/10 text-danger"
        : days <= 30
          ? "border-info/25 bg-info/10 text-info"
          : "border-border bg-muted text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-1 font-mono text-[11px] font-semibold tabular",
        tone,
      )}
    >
      {days < 0 ? `D+${Math.abs(days)}` : days === 0 ? "D-DAY" : `D-${days}`}
    </span>
  );
}

function Segmented({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-medium text-muted-foreground">
        {label}
      </div>
      <div className="inline-flex rounded-lg border border-border bg-surface p-0.5">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={cn(
              "h-8 rounded-md px-3 text-xs font-medium",
              value === option.id
                ? "bg-brand text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3 sm:p-4">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className="mt-1 text-xl font-semibold tabular">{value}</div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular">{value}</dd>
    </div>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-2.5 text-left font-medium">
      {children}
    </th>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-12 text-center">
      <FileSearch className="mx-auto h-6 w-6 text-muted-foreground" />
      <p className="mt-2 text-sm text-muted-foreground">
        조건에 맞는 락업 일정이 없습니다.
      </p>
    </div>
  );
}

function formatVerifiedAt(value: string) {
  if (!value) return "확인 중";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}
