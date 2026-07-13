import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHeading } from "@/components/page-shell";
import { SurgeTable } from "@/components/surge-table";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "종목 스캐너 · BMO Money Flow" },
      {
        name: "description",
        content: "전일·5일·20일·60일 기준으로 거래대금이 크게 늘어난 미국 주식을 스캔합니다.",
      },
      { property: "og:title", content: "종목 스캐너" },
      {
        property: "og:description",
        content: "장 마감 기준 거래대금이 급증한 미국 주식을 기간별로 비교",
      },
    ],
  }),
  component: ScannerPage,
});

function ScannerPage() {
  return (
    <PageShell>
      <PageHeading
        title="종목 스캐너"
        description="전일·5일·20일·60일 평균 대비 거래대금 변화와 종목별 후속 정보를 확인하세요."
      />
      <SurgeTable />
    </PageShell>
  );
}
