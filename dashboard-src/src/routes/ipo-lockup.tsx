import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, CalendarClock, Rocket, Info } from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LOCKUP_ROWS, type LockupRow, type Importance } from "@/lib/mock-data";
import { fmtMoney, fmtMcap } from "@/lib/format";

export const Route = createFileRoute("/ipo-lockup")({
  head: () => ({
    meta: [
      { title: "미국 IPO 락업 해제 일정 | BVT Money Flow" },
      {
        name: "description",
        content: "IPO 락업 해제 일정과 임박 이벤트, 예상 유통 가치까지 한눈에.",
      },
      { property: "og:title", content: "IPO 락업 해제 일정" },
      {
        property: "og:description",
        content: "IPO 이후 락업 해제 캘린더와 임박 이벤트를 추적",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/ipo-lockup/" }],
  }),
  component: LockupPage,
});

type WindowFilter = "all" | "14" | "30" | "90";
type MCapFilter = "all" | "small" | "mid" | "large";
type SizeFilter = "all" | "small" | "big";

function LockupPage() {
  const [win, setWin] = useState<WindowFilter>("all");
  const [mcap, setMcap] = useState<MCapFilter>("all");
  const [size, setSize] = useState<SizeFilter>("all");
  const [query, setQuery] = useState(() =>
    typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("ticker") ?? "",
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LOCKUP_ROWS.filter((r) => {
      if (win !== "all" && (r.daysLeft < 0 || r.daysLeft > Number(win))) return false;
      if (mcap !== "all" && r.marketCap <= 0) return false;
      if (mcap === "small" && r.marketCap >= 10) return false;
      if (mcap === "mid" && (r.marketCap < 10 || r.marketCap >= 50)) return false;
      if (mcap === "large" && r.marketCap < 50) return false;
      if (r.estValue > 0 && size === "small" && r.estValue >= 3000) return false;
      if (r.estValue > 0 && size === "big" && r.estValue < 3000) return false;
      if (
        q &&
        !r.ticker.toLowerCase().includes(q) &&
        !r.company.toLowerCase().includes(q)
      )
        return false;
      return true;
    }).sort((a, b) => a.ticker === "SPCX" ? -1 : b.ticker === "SPCX" ? 1 : a.daysLeft - b.daysLeft);
  }, [win, mcap, size, query]);

  const within14 = LOCKUP_ROWS.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 14).length;
  const within30 = LOCKUP_ROWS.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 30).length;
  const lockupDurations = LOCKUP_ROWS.flatMap((r) => r.lockupDays ? [r.lockupDays] : []);
  const avgLockup = lockupDurations.length ? Math.round(lockupDurations.reduce((sum, days) => sum + days, 0) / lockupDurations.length) : 0;
  const bigEvents = LOCKUP_ROWS.filter((r) => r.daysLeft >= 0 && r.importance === "high").length;
  const spacex = LOCKUP_ROWS.find((r) => r.ticker === "SPCX");

  return (
    <PageShell>
      <PageHeading
        title="IPO 락업"
        description="IPO 이후 락업 해제 일정과 임박 이벤트, 예상 유통 가치까지 살펴보세요."
      />

      <div className="space-y-5">
        <section
          aria-label="IPO 락업 요약"
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <SummaryCard label="14일 내 해제" value={`${within14}건`} hint="임박 이벤트" tone="danger" />
          <SummaryCard label="30일 내 해제" value={`${within30}건`} hint="한 달 내 예정" tone="info" />
          <SummaryCard label="평균 락업 기간" value={`${avgLockup}일`} hint="추적 종목 기준" />
          <SummaryCard label="대형 이벤트" value={`${bigEvents}건`} hint="중요도 상위" tone="danger" />
        </section>

        {spacex && (
          <Card className="border-brand/30 bg-brand/[0.04]">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                <Rocket className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-brand">주요 추적 이벤트</span>
                  <ImportanceBadge importance="high" />
                </div>
                <h2 className="mt-1 text-lg font-semibold">스페이스X <span className="font-mono text-sm text-muted-foreground">SPCX</span></h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  시장 관심도가 높은 우주항공 IPO · 락업 해제 {spacex.unlockDate} · D-{spacex.daysLeft}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:text-right">
                <div><span className="text-muted-foreground">관련 섹터</span><div className="font-medium">{spacex.sector}</div></div>
                <div><span className="text-muted-foreground">시가총액</span><div className="font-medium">비상장·미수집</div></div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-surface px-3 py-2.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p><strong className="text-foreground">중요도 기준</strong> · 상: 14일 이내 또는 시장 주목 이벤트(SpaceX) · 중: 15~30일 · 하: 31일 이후. 해제 물량·가치가 수집되면 규모도 함께 반영합니다.</p>
        </div>

        <div className="sticky top-14 z-30 -mx-4 flex flex-col gap-3 border-y border-border/70 bg-background/90 px-4 py-3 backdrop-blur lg:mx-0 lg:flex-row lg:items-end lg:gap-4 lg:rounded-xl lg:border">
          <SegBlock
            label="기간"
            value={win}
            onChange={(v) => setWin(v as WindowFilter)}
            options={[
              { id: "all", label: "전체" },
              { id: "14", label: "14일" },
              { id: "30", label: "30일" },
              { id: "90", label: "90일" },
            ]}
          />
          <SegBlock
            label="시가총액"
            value={mcap}
            onChange={(v) => setMcap(v as MCapFilter)}
            options={[
              { id: "all", label: "전체" },
              { id: "small", label: "소형" },
              { id: "mid", label: "중형" },
              { id: "large", label: "대형" },
            ]}
          />
          <SegBlock
            label="해제 규모"
            value={size}
            onChange={(v) => setSize(v as SizeFilter)}
            options={[
              { id: "all", label: "전체" },
              { id: "small", label: "소규모" },
              { id: "big", label: "대규모" },
            ]}
          />
          <div className="relative lg:ml-auto lg:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="티커·기업 검색"
              className="h-9 pl-9"
            />
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Card>
            <CardContent className="p-4 sm:p-5">
              <div>
                <h2 className="text-base font-semibold sm:text-lg">
                  락업 해제 타임라인
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  D-day 기준 · 막대 길이는 예상 유통 가치 비중
                </p>
              </div>
              <ul className="mt-4 space-y-3">
                {rows.length === 0 && (
                  <li className="py-10 text-center text-sm text-muted-foreground">
                    조건에 맞는 이벤트가 없습니다.
                  </li>
                )}
                {rows.map((r) => {
                  const maxVal = Math.max(1, ...LOCKUP_ROWS.map((x) => x.estValue));
                  const width = Math.max(6, (r.estValue / maxVal) * 100);
                  return (
                    <li key={r.ticker} className="grid grid-cols-[80px_1fr] items-center gap-3">
                      <DdayBadge days={r.daysLeft} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="font-mono text-[13px] font-semibold tabular">
                            {r.ticker}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">
                            {r.company}
                          </span>
                          <ImportanceBadge importance={r.importance} />
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              r.importance === "high"
                                ? "bg-danger"
                                : r.importance === "medium"
                                  ? "bg-info"
                                  : "bg-muted-foreground/40",
                            )}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground tabular">
                          {r.sector || "섹터 미수집"} · 해제일 {r.unlockDate} · 예상 가치 {r.estValue > 0 ? fmtMoney(r.estValue) : "미수집"}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="border-b border-border/70 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold sm:text-lg">임박 이벤트</h2>
                <p className="text-[11px] text-muted-foreground">14일 내 해제 예정</p>
              </div>
              <ul className="divide-y divide-border/70">
                {LOCKUP_ROWS.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 14).map((r) => (
                  <li key={r.ticker} className="flex items-start gap-3 p-4">
                    <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md bg-danger/10 text-danger">
                      <CalendarClock className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[13px] font-semibold tabular">
                          {r.ticker}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.company}
                        </span>
                        <ImportanceBadge importance={r.importance} />
                      </div>
                      <div className="mt-0.5 text-xs">
                        D-{r.daysLeft} · 해제 물량 {r.unlockShares > 0 ? `${r.unlockShares}M` : "미수집"} · {r.estValue > 0 ? fmtMoney(r.estValue) : "가치 미수집"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground tabular">
                        해제일 {r.unlockDate}
                      </div>
                    </div>
                  </li>
                ))}
                {LOCKUP_ROWS.filter((r) => r.daysLeft >= 0 && r.daysLeft <= 14).length === 0 && (
                  <li className="p-10 text-center text-sm text-muted-foreground">
                    임박 이벤트가 없습니다.
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        <LockupDetailTable rows={rows} />
      </div>
    </PageShell>
  );
}

function LockupDetailTable({ rows }: { rows: LockupRow[] }) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-base font-semibold sm:text-lg">상세 데이터</h2>
          <p className="text-[11px] text-muted-foreground">
            {rows.length}건 · D-day 오름차순
          </p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[1120px] w-full text-sm">
            <thead className="sticky top-0 bg-surface-2/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">종목</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">섹터·산업</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">IPO일</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">해제일</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">남은 일수</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">해제 주식</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">추정 가치</th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">시총</th>
                <th className="whitespace-nowrap py-2.5 pr-4 text-left font-medium">중요도</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((r) => (
                <tr key={r.ticker} className="hover:bg-secondary/40">
                  <td className="whitespace-nowrap py-2.5 pl-4 pr-3">
                    <div className="flex flex-col leading-tight">
                      <span className="font-mono text-[13px] font-semibold tabular">
                        {r.ticker}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {r.company}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-xs">
                    <div>{r.sector || "미수집"}</div>
                    <div className="text-[11px] text-muted-foreground">{r.industry || "산업 미수집"}</div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground tabular">
                    {r.ipoDate}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 tabular">{r.unlockDate}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    <DdayBadge days={r.daysLeft} size="xs" />
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                    {r.unlockShares > 0 ? `${r.unlockShares}M` : "미수집"}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                    {r.estValue > 0 ? fmtMoney(r.estValue) : "미수집"}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular text-muted-foreground">
                    {r.marketCap > 0 ? fmtMcap(r.marketCap) : "미수집"}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <ImportanceBadge importance={r.importance} />
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    조건에 맞는 데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DdayBadge({ days, size = "sm" }: { days: number; size?: "xs" | "sm" }) {
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
        "inline-flex items-center justify-center rounded-md border font-mono font-semibold tabular",
        tone,
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs",
      )}
    >
      {days < 0 ? "해제" : `D-${days}`}
    </span>
  );
}

function ImportanceBadge({ importance }: { importance: Importance }) {
  const meta =
    importance === "high"
      ? { label: "중요도 상", cls: "border-danger/25 bg-danger/10 text-danger" }
      : importance === "medium"
        ? { label: "중요도 중", cls: "border-info/25 bg-info/10 text-info" }
        : { label: "중요도 하", cls: "border-border bg-muted text-muted-foreground" };
  return (
    <span
      title="상: 14일 이내 또는 시장 주목 이벤트 · 중: 15~30일 · 하: 31일 이후"
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
        meta.cls,
      )}
    >
      {meta.label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "success" | "danger" | "info";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1.5 text-xl font-semibold tabular",
            tone === "success" && "text-success",
            tone === "danger" && "text-danger",
            tone === "info" && "text-info",
          )}
        >
          {value}
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

function SegBlock({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div
        role="tablist"
        className="inline-flex h-9 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5"
      >
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(opt.id)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
