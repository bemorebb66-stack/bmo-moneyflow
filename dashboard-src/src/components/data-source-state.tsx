import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeading, PageShell } from "./page-shell";
import { Button } from "./ui/button";
import { Skeleton } from "./ui/skeleton";
import {
  retryDataSource,
  sourceRecordCount,
  type DataSourceId,
  type DataSourceState,
} from "@/lib/data-runtime";
import { cn } from "@/lib/utils";

const LABELS: Record<DataSourceId, string> = {
  market: "시장",
  history: "과거 흐름",
  insider: "내부자 거래",
  lockup: "IPO 락업",
  lockupReactions: "락업 반응",
  earnings: "실적",
  economic: "경제 일정",
  news: "뉴스",
  weekly: "주간 요약",
  stockDirectory: "종목 목록",
  replayManifest: "Replay 범위",
};

function formatTime(value?: number) {
  if (!value) return "";
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(value) + " KST"
  );
}

function formatSourceTime(value?: string) {
  if (!value) return "";
  const timestamp = Date.parse(
    value.includes(" UTC") ? value.replace(" UTC", "Z") : value,
  );
  if (!Number.isFinite(timestamp)) return value;
  return (
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(timestamp) + " KST"
  );
}

export function DataSourcesStatus({
  states,
  className,
}: {
  states: DataSourceState[];
  className?: string;
}) {
  if (!states.length) return null;
  return (
    <div
      className={cn(
        "no-scrollbar flex flex-nowrap gap-2 overflow-x-auto rounded-lg border border-border/70 bg-surface px-3 py-2 sm:flex-wrap",
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {states.map((state) => {
        const count = sourceRecordCount(state.id, state.data);
        const loading =
          state.phase === "idle" ||
          state.phase === "loading" ||
          state.phase === "refreshing";
        const empty = state.phase === "success" && count === 0;
        const failed = state.phase === "error" && !state.data;
        const delayed = state.health === "delayed" && Boolean(state.data);
        const Icon = failed
          ? AlertTriangle
          : loading || delayed
            ? Clock3
            : CheckCircle2;
        const label = failed
          ? "오류"
          : empty
            ? "빈 데이터"
            : delayed
              ? "마지막 정상 데이터"
              : loading
                ? state.data
                  ? "갱신 중"
                  : "로딩"
                : "정상";
        return (
          <span
            key={state.id}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium sm:min-h-9",
              failed
                ? "border-danger/25 bg-danger/5 text-danger"
                : empty || delayed
                  ? "border-warning/25 bg-warning/5 text-warning"
                  : "border-border bg-background text-muted-foreground",
            )}
            title={state.error?.message}
          >
            <Icon className="h-3.5 w-3.5" />
            <strong className="text-foreground">{LABELS[state.id]}</strong>
            {label}
            {state.lastSuccessAt && (delayed || state.fromCache) && (
              <span>· {formatTime(state.lastSuccessAt)}</span>
            )}
            {!loading && state.sourceUpdatedAt && (
              <span>· 갱신 {formatSourceTime(state.sourceUpdatedAt)}</span>
            )}
            {state.phase === "error" && (
              <button
                type="button"
                onClick={() => void retryDataSource(state.id)}
                className="ml-0.5 rounded p-0.5 hover:bg-background"
                aria-label={`${LABELS[state.id]} 다시 시도`}
              >
                <RefreshCw className="h-3 w-3" />
              </button>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function DataPageFallback({
  title,
  description,
  state,
}: {
  title: string;
  description: string;
  state: DataSourceState;
}) {
  const loading =
    state.phase === "idle" ||
    state.phase === "loading" ||
    state.phase === "refreshing";
  const empty =
    state.phase === "success" && sourceRecordCount(state.id, state.data) === 0;

  return (
    <PageShell>
      <PageHeading
        title={title}
        description={description}
        showDataStatus={false}
      />
      <DataSourcesStatus states={[state]} className="mb-4" />
      {loading ? (
        <div className="space-y-4" aria-busy="true" aria-label="데이터 로딩 중">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : (
        <div
          className={cn(
            "rounded-xl border px-5 py-12 text-center",
            empty ? "border-border bg-surface" : "border-danger/25 bg-danger/5",
          )}
        >
          <AlertTriangle
            className={cn(
              "mx-auto h-6 w-6",
              empty ? "text-muted-foreground" : "text-danger",
            )}
          />
          <h2 className="mt-3 text-base font-semibold">
            {empty
              ? "표시할 데이터가 없습니다"
              : "이 데이터를 불러오지 못했습니다"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {empty
              ? "데이터 생성이 완료되면 이 영역에 표시됩니다."
              : state.error?.message ||
                "다른 페이지와 메뉴는 계속 사용할 수 있습니다."}
          </p>
          {!empty && (
            <Button
              className="mt-4"
              onClick={() => void retryDataSource(state.id)}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              다시 시도
            </Button>
          )}
        </div>
      )}
    </PageShell>
  );
}

export function DataSectionState({
  state,
  children,
  empty,
  minHeight = "h-28",
}: {
  state: DataSourceState;
  children: ReactNode;
  empty?: boolean;
  minHeight?: string;
}) {
  const loading =
    !state.data &&
    (state.phase === "idle" ||
      state.phase === "loading" ||
      state.phase === "refreshing");
  if (loading) {
    return (
      <div
        className={cn("space-y-2", minHeight)}
        aria-busy="true"
        aria-label="데이터 로딩 중"
        role="status"
      >
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (!state.data && state.phase === "error") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-lg border border-danger/25 bg-danger/5 px-4 text-center",
          minHeight,
        )}
      >
        <p className="text-xs font-medium text-danger">
          {state.error?.message || "데이터를 불러오지 못했습니다."}
        </p>
        <button
          type="button"
          onClick={() => void retryDataSource(state.id)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          다시 시도
        </button>
      </div>
    );
  }
  if (empty) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg border border-dashed text-center text-xs text-muted-foreground",
          minHeight,
        )}
      >
        표시할 데이터가 없습니다.
      </div>
    );
  }
  return <>{children}</>;
}
