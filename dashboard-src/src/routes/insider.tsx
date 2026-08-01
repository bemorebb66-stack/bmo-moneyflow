import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Search,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  ExternalLink,
} from "lucide-react";
import { PageShell, PageHeading } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MetricInfo } from "@/components/metric-info";
import { cn } from "@/lib/utils";
import {
  INSIDER_PENDING_ROWS,
  INSIDER_ROWS,
  generateInsiderTrend,
  type InsiderRow,
} from "@/lib/mock-data";
import { fmtMoney } from "@/lib/format";
import { ListPagination } from "@/components/list-pagination";
import { useResponsiveListLayout } from "@/hooks/use-responsive-list-layout";
import { useUrlSearchState } from "@/hooks/use-url-search-state";
import {
  PAGE_SIZE_OPTIONS,
  pageForResizedPage,
  pageSlice,
  parsePageSize,
  parsePositiveInt,
} from "@/lib/list-state";
import {
  DataPageFallback,
  DataSourcesStatus,
} from "@/components/data-source-state";
import {
  ROUTE_DATA_SOURCES,
  hasUsableSourceData,
  useDataSources,
} from "@/lib/data-runtime";

export const Route = createFileRoute("/insider")({
  head: () => ({
    meta: [
      { title: "미국 주식 내부자 매수·매도 조회 | BVT Money Flow" },
      {
        name: "description",
        content:
          "미국 상장기업 임원과 주요 주주의 내부자 매수·매도 내역을 거래일과 SEC 보고일 기준으로 확인하세요.",
      },
      { property: "og:title", content: "미국 주식 내부자 거래" },
      {
        property: "og:description",
        content: "임원 매수·매도, 클러스터 거래, 최신 공시를 한 화면에서",
      },
    ],
    links: [
      { rel: "canonical", href: "https://www.bvtmoneyflow.xyz/insider/" },
    ],
  }),
  component: InsiderPage,
});

type FilterType = "all" | "buy" | "sell";
type Range = "7d" | "30d" | "90d";

function InsiderPage() {
  const sourceStates = useDataSources(ROUTE_DATA_SOURCES.insider);
  const listLayout = useResponsiveListLayout();
  const { params: urlParams, update: updateUrl } = useUrlSearchState();
  const [range, setRange] = useState<Range>(() => {
    if (typeof window === "undefined") return "30d";
    const value = new URLSearchParams(window.location.search).get("range");
    return ["7d", "30d", "90d"].includes(value ?? "")
      ? (value as Range)
      : "30d";
  });
  const [type, setType] = useState<FilterType>(() => {
    if (typeof window === "undefined") return "all";
    const value = new URLSearchParams(window.location.search).get("type");
    return ["all", "buy", "sell"].includes(value ?? "")
      ? (value as FilterType)
      : "all";
  });
  const [query, setQuery] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("q") ??
        new URLSearchParams(window.location.search).get("ticker") ??
        ""),
  );
  const pageSize = parsePageSize(urlParams.get("size"));
  const requestedPage = parsePositiveInt(urlParams.get("page"), 1);
  const syncingFromHistory = useRef(false);
  const filterSignature = `${range}|${type}|${query}`;
  const previousFilterSignature = useRef(filterSignature);
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const normalizedQuery = query.trim().toUpperCase();
  const secSearchUrl = normalizedQuery
    ? `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(normalizedQuery)}&category=custom&forms=4`
    : "https://www.sec.gov/edgar/search/#/category=custom&forms=4";
  const latestFiling = useMemo(
    () =>
      [...INSIDER_ROWS].sort((a, b) =>
        b.filedDate.localeCompare(a.filedDate),
      )[0]?.filedDate ?? "",
    [sourceStates.insider.lastSuccessAt],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return INSIDER_ROWS.filter(
      (r) =>
        (type === "all" || r.type === type) &&
        (!latestFiling ||
          (new Date(latestFiling).getTime() - new Date(r.filedDate).getTime()) /
            86400000 <=
            days) &&
        (!q ||
          r.ticker.toLowerCase().includes(q) ||
          r.company.toLowerCase().includes(q) ||
          r.insider.toLowerCase().includes(q)),
    );
  }, [type, query, days, latestFiling]);
  const paged = pageSlice(rows, requestedPage, pageSize);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("ticker");
    query.trim()
      ? url.searchParams.set("q", query.trim())
      : url.searchParams.delete("q");
    range !== "30d"
      ? url.searchParams.set("range", range)
      : url.searchParams.delete("range");
    type !== "all"
      ? url.searchParams.set("type", type)
      : url.searchParams.delete("type");
    const filtersChanged = previousFilterSignature.current !== filterSignature;
    previousFilterSignature.current = filterSignature;
    if (filtersChanged && !syncingFromHistory.current) {
      url.searchParams.delete("page");
    }
    syncingFromHistory.current = false;
    window.history.replaceState({}, "", url);
    window.dispatchEvent(new Event("bvt:url-search-change"));
  }, [filterSignature, query, range, type]);

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      const nextRange = params.get("range");
      const nextType = params.get("type");
      syncingFromHistory.current = true;
      setQuery(params.get("q") ?? params.get("ticker") ?? "");
      setRange(
        ["7d", "30d", "90d"].includes(nextRange ?? "")
          ? (nextRange as Range)
          : "30d",
      );
      setType(
        ["all", "buy", "sell"].includes(nextType ?? "")
          ? (nextType as FilterType)
          : "all",
      );
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  useEffect(() => {
    if (!sourceStates.insider.lastSuccessAt) return;
    if (requestedPage === paged.page) return;
    updateUrl((params) => {
      paged.page === 1
        ? params.delete("page")
        : params.set("page", String(paged.page));
    });
  }, [
    paged.page,
    requestedPage,
    sourceStates.insider.lastSuccessAt,
    updateUrl,
  ]);

  const changePage = (page: number) => {
    updateUrl(
      (params) => {
        page === 1 ? params.delete("page") : params.set("page", String(page));
      },
      { replace: false },
    );
    requestAnimationFrame(() =>
      document.getElementById("insider-detail-results")?.focus(),
    );
  };

  const changePageSize = (nextSize: number) => {
    const nextPage = pageForResizedPage(paged.page, pageSize, nextSize);
    updateUrl((params) => {
      nextSize === 25
        ? params.delete("size")
        : params.set("size", String(nextSize));
      nextPage === 1
        ? params.delete("page")
        : params.set("page", String(nextPage));
    });
  };

  const trend = useMemo(
    () => generateInsiderTrend(days),
    [days, sourceStates.insider.lastSuccessAt],
  );

  const buyTotal = INSIDER_ROWS.filter((r) => r.type === "buy").reduce(
    (s, r) => s + r.amount,
    0,
  );
  const sellTotal = INSIDER_ROWS.filter((r) => r.type === "sell").reduce(
    (s, r) => s + r.amount,
    0,
  );
  const clusterCount = new Set(
    INSIDER_ROWS.filter((r) => r.cluster).map((r) => r.ticker),
  ).size;

  if (!hasUsableSourceData(sourceStates.insider)) {
    return (
      <DataPageFallback
        title="내부자 거래"
        description="미국 상장기업 내부자의 매수·매도 공시와 클러스터 거래 신호를 추적합니다."
        state={sourceStates.insider}
      />
    );
  }

  return (
    <PageShell>
      <PageHeading
        title="내부자 거래"
        description="미국 상장기업 임원·이사회의 매수·매도 공시와 클러스터 거래 신호를 추적합니다."
      />
      <DataSourcesStatus
        states={[sourceStates.insider, sourceStates.market]}
        className="mb-4"
      />

      <div className="space-y-4 sm:space-y-5">
        <aside className="rounded-lg border border-info/25 bg-info/5 px-4 py-3 text-xs leading-5 text-muted-foreground">
          <strong className="text-foreground">공시 포함 기준</strong>
          <span className="ml-2">
            전체 SEC Form 4 발행사를 대상으로 완료된 공개시장 매수(P)·매도(S)만
            표시합니다. 주식 보상, 세금 원천징수(F)와 Form 144 매도 예정 통지는
            포함하지 않습니다.
          </span>
        </aside>

        {INSIDER_PENDING_ROWS.length > 0 && (
          <aside className="rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-warning">
                검증 대기 {INSIDER_PENDING_ROWS.length}건
              </strong>
              <span className="text-[11px] text-muted-foreground">
                합계·차트·클러스터 계산에서 제외
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-2">
              {INSIDER_PENDING_ROWS.slice(0, 6).map((row) => (
                <li
                  key={insiderRowKey(row)}
                  className="rounded-md border border-warning/20 bg-background px-2.5 py-1.5 text-xs"
                >
                  <strong className="font-mono">{row.ticker}</strong>
                  <span className="ml-1.5 text-muted-foreground">
                    {row.tradeDate || row.filedDate} ·{" "}
                    {pendingReasonLabel(row.validationReasons?.[0])}
                  </span>
                </li>
              ))}
            </ul>
          </aside>
        )}

        <section
          aria-label="내부자 거래 요약"
          className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
        >
          <SummaryCard
            label="유효 공시"
            value={`${INSIDER_ROWS.length}건`}
            hint={
              INSIDER_PENDING_ROWS.length
                ? `검증 대기 ${INSIDER_PENDING_ROWS.length}건 제외`
                : "가격·금액 검증 통과"
            }
          />
          <SummaryCard
            label="매수 합계"
            value={fmtMoney(buyTotal)}
            hint={`${INSIDER_ROWS.filter((r) => r.type === "buy").length}건 · 총액`}
            tone="success"
          />
          <SummaryCard
            label="매도 합계"
            value={fmtMoney(sellTotal)}
            hint={`${INSIDER_ROWS.filter((r) => r.type === "sell").length}건 · 총액`}
            tone="danger"
          />
          <SummaryCard
            label="클러스터 거래"
            value={`${clusterCount}종목`}
            hint="다수 임원 동시 매매"
            tone="info"
          />
        </section>

        <div className="sticky top-14 z-30 -mx-4 flex flex-col gap-3 border-y border-border/70 bg-background/90 px-4 py-3 backdrop-blur lg:mx-0 lg:flex-row lg:items-end lg:gap-4 lg:rounded-xl lg:border">
          <SegBlock
            label="기간"
            value={range}
            onChange={(v) => setRange(v as Range)}
            options={[
              { id: "7d", label: "7일" },
              { id: "30d", label: "30일" },
              { id: "90d", label: "90일" },
            ]}
          />
          <SegBlock
            label="거래 유형"
            value={type}
            onChange={(v) => setType(v as FilterType)}
            options={[
              { id: "all", label: "전체" },
              { id: "buy", label: "매수" },
              { id: "sell", label: "매도" },
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
              placeholder="티커·기업·내부자 검색"
              aria-label="검색"
              className="h-11 pl-9 lg:h-9"
            />
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <Card className="order-2 mt-1">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-1">
                    <h2 className="text-base font-semibold sm:text-lg">
                      내부자 거래 추이
                    </h2>
                    <MetricInfo label="내부자 거래 기준">
                      미국 SEC Form 4 공시를 거래일 기준으로 합산합니다.
                      공시일은 실제 거래일보다 늦을 수 있으며, 매수·매도 금액은
                      공개 공시의 거래 가격과 수량을 기준으로 계산합니다.
                    </MetricInfo>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    최근 {days}일 · 백만 달러
                  </p>
                </div>
              </div>
              <div
                className="mt-4 h-[300px] w-full sm:h-[340px]"
                role="img"
                aria-label="최근 내부자 거래의 일별 매수와 매도 금액 막대 차트. 아래 거래 목록에서 같은 데이터를 확인할 수 있습니다."
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={trend}
                    margin={{ top: 8, right: 12, bottom: 4, left: -4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      opacity={0.5}
                    />
                    <XAxis
                      dataKey="date"
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      stroke="var(--color-muted-foreground)"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={(v: number) => `$${v.toFixed(0)}M`}
                    />
                    <Tooltip
                      cursor={{ fill: "var(--color-muted)", opacity: 0.4 }}
                      contentStyle={{
                        backgroundColor: "var(--color-popover)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <ReferenceLine y={0} stroke="var(--color-border)" />
                    <Bar
                      dataKey="buy"
                      name="매수"
                      fill="var(--color-success)"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="sell"
                      name="매도"
                      fill="var(--color-danger)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="order-1">
            <CardContent className="p-0">
              <div className="border-b border-border/70 px-4 py-3 sm:px-5">
                <h2 className="text-base font-semibold sm:text-lg">
                  최신 공시
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  거래일 기준 최근 순
                </p>
              </div>
              <ul className="divide-y divide-border/70">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={i} className="flex items-start gap-3 p-4">
                    <div
                      className={cn(
                        "mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-md",
                        r.type === "buy"
                          ? "bg-success/10 text-success"
                          : "bg-danger/10 text-danger",
                      )}
                    >
                      {r.type === "buy" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownRight className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <a
                          href={`/stock/?ticker=${encodeURIComponent(r.ticker)}`}
                          className="font-mono text-[13px] font-semibold tabular hover:text-brand"
                        >
                          {r.ticker}
                        </a>
                        <span className="truncate text-xs text-muted-foreground">
                          {r.company}
                        </span>
                        {r.cluster && (
                          <span className="ml-1 inline-flex items-center gap-1 rounded-md border border-info/25 bg-info/10 px-1.5 py-0.5 text-[10px] font-medium text-info">
                            <Users className="h-2.5 w-2.5" />
                            클러스터
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs">
                        {r.insider}{" "}
                        <span className="text-muted-foreground">
                          ({r.role})
                        </span>{" "}
                        · {r.type === "buy" ? "매수" : "매도"}{" "}
                        {fmtMoney(r.amount)}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground tabular">
                        거래일 {r.tradeDate} · 공시일 {r.filedDate}
                      </div>
                    </div>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="flex flex-col items-center gap-3 p-10 text-center text-sm text-muted-foreground">
                    <span>
                      선택한 기간과 조건에 맞는 공개시장 매수·매도 공시가
                      없습니다.
                    </span>
                    <a
                      href={secSearchUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-brand hover:bg-secondary"
                    >
                      {normalizedQuery || "전체 종목"} SEC Form 4 원문 확인
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        </div>

        {listLayout === "desktop" ? (
          <InsiderDetailTable
            rows={paged.rows}
            total={rows.length}
            start={paged.start}
            secSearchUrl={secSearchUrl}
            query={normalizedQuery}
          />
        ) : (
          <InsiderDetailCards
            rows={paged.rows}
            total={rows.length}
            start={paged.start}
            secSearchUrl={secSearchUrl}
            query={normalizedQuery}
          />
        )}
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-end px-4 py-2 sm:px-5">
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                페이지당
                <select
                  value={pageSize}
                  onChange={(event) =>
                    changePageSize(Number(event.target.value))
                  }
                  className="h-9 rounded-md border border-border bg-background px-2 text-foreground"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}건
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <ListPagination
              page={paged.page}
              pageCount={paged.pageCount}
              total={rows.length}
              start={paged.start}
              end={paged.end}
              label="내부자 거래 상세"
              onPageChange={changePage}
            />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function pendingReasonLabel(code?: string) {
  const labels: Record<string, string> = {
    SEC_FOOTNOTE_PRICE_CONFLICT: "SEC 각주 가격 불일치",
    MARKET_PRICE_EXTREME: "시장가격 대비 이상치",
    MARKET_PRICE_REVIEW: "시장가격 재확인",
    SHARES_PRICE_VALUE_MISMATCH: "수량·가격·금액 불일치",
    AMENDMENT_TRANSACTION_NOT_FOUND: "수정 신고 연결 확인",
    AMENDMENT_TRANSACTION_AMBIGUOUS: "수정 신고 중복 확인",
    VALIDATION_NOT_CONFIRMED: "검증 정보 없음",
    SOURCE_REFETCH_FAILED: "SEC 원문 확인 지연",
  };
  return labels[code || ""] || "원문 재확인";
}

function insiderRowKey(row: InsiderRow) {
  return [
    row.accession,
    row.ticker,
    row.insider,
    row.tradeDate,
    row.filedDate,
    row.type,
    row.shares,
    row.price ?? "",
    row.amount,
  ].join("|");
}

function InsiderDetailTable({
  rows,
  total,
  start,
  secSearchUrl,
  query,
}: {
  rows: InsiderRow[];
  total: number;
  start: number;
  secSearchUrl: string;
  query: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border/70 px-4 py-3 sm:px-5">
          <h2
            id="insider-detail-results"
            tabIndex={-1}
            className="text-base font-semibold outline-none sm:text-lg"
          >
            상세 데이터
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {total}건 · 종목·거래유형·시간 조건 적용
          </p>
        </div>
        <div className="overflow-auto">
          <table className="min-w-[1000px] w-full text-sm">
            <caption className="sr-only">
              내부자 거래 {total}건 중 {start + 1}~{start + rows.length}번
            </caption>
            <thead className="sticky top-0 bg-surface-2/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="whitespace-nowrap py-2.5 pl-4 pr-3 text-left font-medium">
                  종목
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">
                  내부자
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">
                  직책
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">
                  거래 유형
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">
                  주식 수
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-right font-medium">
                  거래 금액
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">
                  거래일
                </th>
                <th className="whitespace-nowrap py-2.5 pr-3 text-left font-medium">
                  공시일
                </th>
                <th className="whitespace-nowrap py-2.5 pr-4 text-left font-medium">
                  신호
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((r) => (
                <tr key={insiderRowKey(r)} className="hover:bg-secondary/40">
                  <td className="whitespace-nowrap py-2.5 pl-4 pr-3">
                    <div className="flex flex-col leading-tight">
                      <a
                        href={`/stock/?ticker=${encodeURIComponent(r.ticker)}`}
                        className="font-mono text-[13px] font-semibold tabular hover:text-brand"
                      >
                        {r.ticker}
                      </a>
                      <span className="text-[11px] text-muted-foreground">
                        {r.company}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3">{r.insider}</td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground">
                    {r.role}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium",
                        r.type === "buy"
                          ? "border-success/25 bg-success/10 text-success"
                          : "border-danger/25 bg-danger/10 text-danger",
                      )}
                    >
                      {r.type === "buy" ? "매수" : "매도"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                    {r.shares.toLocaleString("en-US")}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular">
                    {fmtMoney(r.amount)}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground tabular">
                    {r.tradeDate}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-3 text-muted-foreground tabular">
                    {r.filedDate}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4">
                    <span
                      className={cn(
                        "inline-flex rounded-md border px-1.5 py-0.5 text-xs font-medium",
                        r.type === "buy"
                          ? "border-success/25 bg-success/10 text-success"
                          : "border-danger/25 bg-danger/10 text-danger",
                      )}
                    >
                      {r.type === "buy" ? "매수 공시" : "매도 공시"}
                    </span>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-3">
                      <span>조건에 맞는 데이터가 없습니다.</span>
                      <a
                        href={secSearchUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-brand hover:bg-secondary"
                      >
                        {query || "전체 종목"} SEC Form 4 원문 확인
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
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

function InsiderDetailCards({
  rows,
  total,
  start,
  secSearchUrl,
  query,
}: {
  rows: InsiderRow[];
  total: number;
  start: number;
  secSearchUrl: string;
  query: string;
}) {
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border/70 px-4 py-3">
          <h2
            id="insider-detail-results"
            tabIndex={-1}
            className="text-base font-semibold outline-none"
          >
            상세 데이터
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {total}건 · 종목·거래유형·시간 조건 적용
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-sm text-muted-foreground">
            <span>조건에 맞는 데이터가 없습니다.</span>
            <a
              href={secSearchUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-brand hover:bg-secondary"
            >
              {query || "전체 종목"} SEC Form 4 원문 확인
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        ) : (
          <ol start={start + 1} className="divide-y divide-border/70">
            {rows.map((row) => (
              <li key={insiderRowKey(row)} className="px-4 py-4">
                <article>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <a
                        href={`/stock/?ticker=${encodeURIComponent(row.ticker)}`}
                        className="font-mono text-sm font-bold hover:text-brand"
                      >
                        {row.ticker}
                      </a>
                      <p className="truncate text-xs text-muted-foreground">
                        {row.company}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs font-semibold",
                        row.type === "buy"
                          ? "border-success/25 bg-success/10 text-success"
                          : "border-danger/25 bg-danger/10 text-danger",
                      )}
                    >
                      {row.type === "buy" ? "매수" : "매도"}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border/70 bg-surface-2/45 p-3 text-xs">
                    <div>
                      <dt className="text-muted-foreground">내부자·직책</dt>
                      <dd className="mt-0.5 font-medium">
                        {row.insider} · {row.role}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-muted-foreground">거래 금액</dt>
                      <dd className="mt-0.5 font-semibold tabular">
                        {fmtMoney(row.amount)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">주식 수</dt>
                      <dd className="mt-0.5 tabular">
                        {row.shares.toLocaleString("en-US")}
                      </dd>
                    </div>
                    <div className="text-right">
                      <dt className="text-muted-foreground">거래일·공시일</dt>
                      <dd className="mt-0.5 tabular">
                        {row.tradeDate} · {row.filedDate}
                      </dd>
                    </div>
                  </dl>
                </article>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
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
      <CardContent className="p-3 sm:p-4">
        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div
          className={cn(
            "mt-1 text-lg font-semibold tabular sm:mt-1.5 sm:text-xl",
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
        className="inline-flex h-11 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 lg:h-9"
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
                "min-h-10 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors lg:min-h-0",
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
