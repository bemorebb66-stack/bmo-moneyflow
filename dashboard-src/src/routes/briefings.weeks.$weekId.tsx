import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { WeeklyBriefingView } from "@/components/briefing-view";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Skeleton } from "@/components/ui/skeleton";
import type { WeeklySource } from "@/lib/briefing";

type WeeklyPayload = { weeks: WeeklySource[] };

export const Route = createFileRoute("/briefings/weeks/$weekId")({
  head: ({ params }) => {
    const title = `${params.weekId} 주간 미국 시장 브리핑 | BVT Money Flow`;
    const description = "주간 거래대금, 상승·하락 종목 비중, 주요 지수와 섹터 점유율 변화를 장 마감 데이터로 요약합니다.";
    const url = `https://www.bvtmoneyflow.xyz/briefings/weeks/${params.weekId}/`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: WeeklyBriefingPage,
});

function WeeklyBriefingPage() {
  const { weekId } = Route.useParams();
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; week: WeeklySource; weeks: WeeklySource[]; dates: string[] }
    | { phase: "error" }
  >({ phase: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/weekly_summary.json", { signal: controller.signal }),
      fetch("/replay_data/manifest.json", { signal: controller.signal }),
    ])
      .then(async ([weeklyResponse, manifestResponse]) => {
        if (!weeklyResponse.ok || !manifestResponse.ok) throw new Error("weekly");
        const weekly = await weeklyResponse.json() as WeeklyPayload;
        const manifest = await manifestResponse.json() as { dates: string[] };
        const week = weekly.weeks.find((row) => row.weekId === weekId);
        if (!week) throw new Error("missing week");
        setState({ phase: "ready", week, weeks: weekly.weeks, dates: manifest.dates });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ phase: "error" });
      });
    return () => controller.abort();
  }, [weekId]);
  return (
    <PageShell>
      <PageHeading title="주간 시장 브리핑" description="보관된 장 마감 데이터를 주 단위로 비교합니다." showDataStatus={false} />
      {state.phase === "ready" ? (
        <WeeklyBriefingView
          week={state.week}
          weekIds={[...state.weeks].reverse().map((week) => week.weekId)}
          dates={state.dates}
        />
      ) : state.phase === "loading" ? (
        <div aria-busy="true" aria-label="주간 브리핑 로딩 중" className="space-y-3"><Skeleton className="h-12" /><Skeleton className="h-96" /></div>
      ) : (
        <section role="alert" className="rounded-xl border border-danger/30 bg-danger/5 p-6 text-center">
          <h2 className="font-semibold">이 주간 브리핑을 불러오지 못했습니다</h2>
          <a href="/today/" className="mt-4 inline-flex min-h-11 items-center font-semibold text-brand underline">오늘의 시장 보기</a>
        </section>
      )}
    </PageShell>
  );
}
