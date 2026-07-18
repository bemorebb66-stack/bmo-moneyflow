import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHeading } from "@/components/page-shell";
import { SurgeTable } from "@/components/surge-table";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "미국 주식 거래대금 순위·급증 종목 스캐너 | BVT Money Flow" },
      {
        name: "description",
        content: "미국 주식의 거래대금 순위와 전일·5일·20일·60일 평균 대비 변화를 확인하고, 거래대금 급증 종목을 조건별로 탐색하세요.",
      },
      { property: "og:title", content: "종목 스캐너" },
      {
        property: "og:description",
        content: "장 마감 기준 거래대금이 급증한 미국 주식을 기간별로 비교",
      },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/scanner/" }],
  }),
  component: ScannerPage,
});

function ScannerPage() {
  return (
    <PageShell>
      <PageHeading
        title="미국 주식 거래대금 스캐너"
        description="전일·5일·20일·60일 평균 대비 거래대금 변화와 종목별 후속 정보를 확인하세요."
      />
      <SurgeTable />
    </PageShell>
  );
}
