import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { DailyBriefingView } from "@/components/briefing-view";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReplaySnapshot } from "@/lib/briefing";

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

export const Route = createFileRoute("/briefings/$date")({
  head: ({ params }) => {
    const date = validDate(params.date) ? params.date : "시장";
    const url = `https://www.bvtmoneyflow.xyz/briefings/${date}/`;
    const title = `${date} 미국 주식 시장 브리핑 | BVT Money Flow`;
    const description = `${date} 미국 시장의 거래대금, 상승·하락 종목과 섹터 점유율 변화를 실제 장 마감 데이터로 요약합니다.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { property: "og:image", content: "https://www.bvtmoneyflow.xyz/og-bvt-money-flow.png" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: BriefingPage,
});

function BriefingPage() {
  const { date } = Route.useParams();
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; snapshot: ReplaySnapshot; dates: string[] }
    | { phase: "unavailable"; dates: string[] }
    | { phase: "error" }
  >({ phase: "loading" });

  useEffect(() => {
    if (!validDate(date)) {
      setState({ phase: "error" });
      return;
    }
    const controller = new AbortController();
    setState({ phase: "loading" });
    void fetch("/replay_data/manifest.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("manifest");
        return response.json() as Promise<{ dates: string[] }>;
      })
      .then(async (manifest) => {
        if (!manifest.dates.includes(date)) {
          setState({ phase: "unavailable", dates: manifest.dates });
          return;
        }
        const response = await fetch(`/replay_data/snapshots/${date}.json`, { signal: controller.signal });
        if (!response.ok) throw new Error("snapshot");
        const snapshot = await response.json() as ReplaySnapshot;
        if (snapshot.trading_date !== date || !snapshot.market) throw new Error("invalid snapshot");
        setState({ phase: "ready", snapshot, dates: manifest.dates });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: "error" });
      });
    return () => controller.abort();
  }, [date]);

  const nearest = state.phase === "unavailable"
    ? [...state.dates].reverse().find((value) => value < date) ?? state.dates[0]
    : undefined;

  return (
    <PageShell>
      <PageHeading
        title="날짜별 시장 브리핑"
        description="보관된 장 마감 데이터에서 같은 규칙으로 생성한 시장 기록입니다."
        showDataStatus={false}
      />
      {state.phase === "ready" ? (
        <DailyBriefingView snapshot={state.snapshot} dates={state.dates} />
      ) : state.phase === "loading" ? (
        <div aria-busy="true" aria-label="브리핑 데이터 로딩 중" className="space-y-3">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : state.phase === "unavailable" ? (
        <section role="status" className="rounded-xl border border-warning/30 bg-warning/5 p-6 text-center">
          <h2 className="text-lg font-semibold">{date} 브리핑은 보관되어 있지 않습니다</h2>
          <p className="mt-2 text-sm text-muted-foreground">주말·휴장일이거나 현재 보관 범위 밖의 날짜일 수 있습니다.</p>
          {nearest && <a href={`/briefings/${nearest}/`} className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline">가까운 이전 거래일 {nearest} 보기</a>}
        </section>
      ) : (
        <section role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <h2 className="text-lg font-semibold">브리핑을 불러오지 못했습니다</h2>
          <p className="mt-2 text-sm text-muted-foreground">잠시 후 다시 시도하거나 오늘의 시장으로 이동해주세요.</p>
          <a href="/today/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline">오늘의 시장 보기</a>
        </section>
      )}
    </PageShell>
  );
}
