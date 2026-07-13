import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHeading } from "@/components/page-shell";
import { RotationSummary } from "@/components/rotation-summary";
import {
  FilterBar,
  type Category,
  type Period,
} from "@/components/filter-bar";
import { ComparisonChart } from "@/components/comparison-chart";
import { SectorTable } from "@/components/sector-table";
import { ReadingGuide } from "@/components/reading-guide";
import { SECTORS } from "@/lib/mock-data";

const INITIAL_GROUPS = ["technology", "communication", "financial"];

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
  const [category, setCategory] = useState<Category>("sector");
  const [period, setPeriod] = useState<Period>("1d");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(INITIAL_GROUPS);

  const toggleCompare = (id: string) =>
    setSelected((cur) =>
      cur.includes(id)
        ? cur.filter((x) => x !== id)
        : cur.length >= 8
          ? cur
          : [...cur, id],
    );

  useMemo(() => SECTORS, []);

  return (
    <PageShell>
      <PageHeading
        title="시장 흐름"
        description="거래대금·시장 점유율 변화로 오늘의 미국 시장 자금 로테이션을 한눈에 확인하세요."
      />
      <div className="space-y-5">
        <RotationSummary />
        <FilterBar
          category={category}
          onCategory={setCategory}
          period={period}
          onPeriod={setPeriod}
          query={query}
          onQuery={setQuery}
        />
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <ComparisonChart selected={selected} onSelected={setSelected} />
          <SectorTable
            selectedIds={selected}
            onToggleCompare={toggleCompare}
            query={query}
          />
        </div>
        <ReadingGuide />
      </div>
    </PageShell>
  );
}

