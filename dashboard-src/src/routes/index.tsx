import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHeading } from "@/components/page-shell";
import { RotationSummary } from "@/components/rotation-summary";
import {
  FilterBar,
  type Category,
  type Period,
} from "@/components/filter-bar";
import { ComparisonChart, type Metric, type Range } from "@/components/comparison-chart";
import { SectorTable } from "@/components/sector-table";
import { ReadingGuide } from "@/components/reading-guide";
import { LIVE_COMPANIES_BY_ID, LIVE_MARKET_DATA, SECTORS, type Sector } from "@/lib/mock-data";

const INITIAL_GROUPS = ["technology", "communication", "financial"];
const CATEGORY_LABELS: Record<Category, string> = {
  sector: "대분류 섹터", industry: "세부 산업", universe: "시장 유니버스",
  custom: "커스텀 그룹", mcap: "시가총액",
};
const PERIOD_LABELS: Record<Period, string> = {
  "1d": "전일", "5d": "최근 5일", "20d": "최근 20일", "60d": "최근 60일",
};
const LEGACY_SECTOR_IDS: Record<string, string> = {
  Technology: "technology", "Communication Services": "communication",
  "Financial Services": "financial", "Consumer Cyclical": "consumer-discretionary",
  Healthcare: "healthcare", Industrials: "industrials", Energy: "energy",
  "Consumer Defensive": "consumer-staples", Utilities: "utilities",
  "Real Estate": "real-estate", "Basic Materials": "materials",
};

function readUrlState() {
  const defaults = {
    category: "sector" as Category, period: "1d" as Period,
    metric: "index" as Metric, range: "60d" as Range, groups: [] as string[],
  };
  if (typeof window === "undefined") return defaults;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const mode = params.get("m") as Category | null;
  const period = params.get("p") as Period | null;
  const metric = params.get("mt");
  const range = params.get("r");
  if (["sector", "industry", "universe", "custom", "mcap"].includes(mode ?? "")) defaults.category = mode!;
  if (["1d", "5d", "20d", "60d"].includes(period ?? "")) defaults.period = period!;
  if (metric === "share" || metric === "change") defaults.metric = metric;
  if (range === "5" || range === "20" || range === "60") defaults.range = `${range}d` as Range;
  defaults.groups = (params.get("g") ?? "").split("|").filter(Boolean);
  return defaults;
}

function initialSelection(groups: string[], rows: Sector[]) {
  const resolved = groups.map((id) => LEGACY_SECTOR_IDS[id] ?? id).filter((id) =>
    rows.some((row) => row.id === id) || Boolean(LIVE_COMPANIES_BY_ID[id]),
  );
  return (resolved.length ? resolved : rows.slice(0, 3).map((row) => row.id)).slice(0, 8);
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "미국 주식 시장 흐름 · BMO Money Flow" },
      {
        name: "description",
        content:
          "거래대금과 시장 점유율로 미국 주식 섹터 자금 로테이션을 추적합니다. 장 마감 기준으로 유입·이탈 신호와 비교 차트를 한눈에.",
      },
      { property: "og:title", content: "미국 주식 시장 흐름 대시보드" },
      {
        property: "og:description",
        content: "장 마감 기준 자금 유입·이탈 신호와 섹터 로테이션 데이터 대시보드",
      },
    ],
  }),
  component: MarketFlowPage,
});

function MarketFlowPage() {
  const [initial] = useState(readUrlState);
  const [category, setCategory] = useState<Category>(initial.category);
  const [period, setPeriod] = useState<Period>(initial.period);
  const [metric, setMetric] = useState<Metric>(initial.metric);
  const [range, setRange] = useState<Range>(initial.range);
  const [query, setQuery] = useState("");
  const rows = LIVE_MARKET_DATA[category]?.[period]?.length
    ? LIVE_MARKET_DATA[category][period]
    : SECTORS;
  const [selected, setSelected] = useState<string[]>(() =>
    initialSelection(initial.groups.length ? initial.groups : INITIAL_GROUPS, rows),
  );

  useEffect(() => {
    const syncFromHash = () => {
      const next = readUrlState();
      const nextRows = LIVE_MARKET_DATA[next.category]?.[next.period]?.length
        ? LIVE_MARKET_DATA[next.category][next.period]
        : SECTORS;
      setCategory(next.category);
      setPeriod(next.period);
      setMetric(next.metric);
      setRange(next.range);
      setSelected(initialSelection(next.groups, nextRows));
    };
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    setSelected((current) => {
      const valid = current.filter((id) => rows.some((row) => row.id === id) || Boolean(LIVE_COMPANIES_BY_ID[id]));
      return valid.length ? valid : rows.slice(0, 3).map((row) => row.id);
    });
  }, [category, period, rows]);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set("m", category);
    params.set("p", period);
    params.set("mt", metric === "index" ? "idx" : metric);
    params.set("r", range.replace("d", ""));
    if (selected.length) params.set("g", selected.join("|"));
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}#${params}`);
  }, [category, period, metric, range, selected]);

  const changeCategory = (next: Category) => {
    setCategory(next);
    setQuery("");
    const nextRows = LIVE_MARKET_DATA[next]?.[period] ?? [];
    setSelected(nextRows.slice(0, 3).map((row) => row.id));
  };

  const toggleCompare = (id: string) =>
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= 8
          ? cur
          : [...cur, id],
    );

  return (
    <PageShell>
      <PageHeading
        title="시장 흐름"
        description="거래대금·시장 점유율 변화로 오늘의 미국 시장 자금 로테이션을 한눈에 확인하세요."
      />
      <div className="space-y-5">
        <RotationSummary rows={rows} categoryLabel={CATEGORY_LABELS[category]} periodLabel={PERIOD_LABELS[period]} />
        <FilterBar
          category={category}
          onCategory={changeCategory}
          period={period}
          onPeriod={setPeriod}
          query={query}
          onQuery={setQuery}
        />
        <p className="-mt-2 text-xs text-muted-foreground" aria-live="polite">
          현재 조건 · {CATEGORY_LABELS[category]} · {PERIOD_LABELS[period]} 기준 · {rows.length}개 그룹
        </p>
        <div className="grid gap-5">
          <ComparisonChart
            rows={rows}
            selected={selected}
            onSelected={setSelected}
            metric={metric}
            onMetric={setMetric}
            range={range}
            onRange={setRange}
          />
          <SectorTable
            data={rows}
            selectedIds={selected}
            onToggleCompare={toggleCompare}
            onAddCompany={toggleCompare}
            query={query}
            categoryLabel={CATEGORY_LABELS[category]}
            periodLabel={PERIOD_LABELS[period]}
          />
        </div>
        <ReadingGuide />
      </div>
    </PageShell>
  );
}
