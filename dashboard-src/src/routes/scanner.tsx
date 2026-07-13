import { createFileRoute } from "@tanstack/react-router";
import { PageShell, PageHeading } from "@/components/page-shell";
import { SurgeTable } from "@/components/surge-table";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "종목 스캐너 · BMO Money Flow" },
      {
        name: "description",
        content: "20일 평균 대비 거래대금이 크게 늘어난 미국 주식을 스캔합니다.",
      },
      { property: "og:title", content: "종목 스캐너" },
      {
        property: "og:description",
        content: "거래대금이 급증한 미국 주식을 실시간 필터링",
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
        description="20일 평균 대비 거래대금이 급증한 미국 주식을 살펴보세요."
      />
      <SurgeTable />
    </PageShell>
  );
}

