import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Search, Star } from "lucide-react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { SaveStockButton } from "@/components/save-stock-button";
import { SignalBadge, DeltaText } from "@/components/signal-badge";
import { Card, CardContent } from "@/components/ui/card";
import { DataSourcesStatus } from "@/components/data-source-state";
import { fmtMoney, fmtPct, fmtQuote } from "@/lib/format";
import { LIVE_STOCKS, type StockRow } from "@/lib/mock-data";
import { useDataSources } from "@/lib/data-runtime";
import { loadStockDirectory, type DirectoryStock } from "@/lib/stock-directory";
import { useWatchlist, type WatchlistItem } from "@/lib/user-library";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "관심종목 | BVT Money Flow" },
      {
        name: "description",
        content: "이 브라우저에 저장한 관심종목을 한곳에서 확인합니다.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: WatchlistPage,
});

export type WatchlistRow = {
  item: WatchlistItem;
  stock?: StockRow;
  directory?: DirectoryStock;
};

export function WatchlistView({
  rows,
  notice,
}: {
  rows: WatchlistRow[];
  notice?: string | null;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  if (rows.length === 0) {
    return (
      <>
        {notice && (
          <p role="status" className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
            {notice}
          </p>
        )}
        <section
          aria-labelledby="watchlist-empty-title"
          className="rounded-xl border border-dashed border-border bg-surface px-5 py-14 text-center"
        >
          <Star className="mx-auto h-9 w-9 text-muted-foreground" aria-hidden />
          <h2
            id="watchlist-empty-title"
            tabIndex={-1}
            className="mt-4 text-lg font-semibold outline-none"
          >
            아직 저장한 관심종목이 없습니다
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            검색, 종목 상세 또는 스캐너의 별표 버튼으로 종목을 추가할 수 있습니다.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <a
              href="/scanner/"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-brand-foreground"
            >
              <Search className="h-4 w-4" aria-hidden /> 종목 스캐너 열기
            </a>
          </div>
        </section>
      </>
    );
  }

  return (
    <section aria-labelledby="watchlist-results-title">
      <h2
        id="watchlist-results-title"
        ref={headingRef}
        tabIndex={-1}
        className="mb-3 text-sm font-semibold outline-none"
      >
        저장된 종목 {rows.length}개
      </h2>
      {notice && (
        <p role="status" className="mb-3 rounded-md border border-warning/30 bg-warning/5 p-3 text-xs">
          {notice}
        </p>
      )}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(({ item, stock, directory }) => {
          const name = stock?.name ?? directory?.name ?? "종목 정보 없음";
          const sector = stock?.sector ?? directory?.sector ?? "분류 정보 없음";
          return (
            <Card key={item.ticker} data-watchlist-row={item.ticker}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <a
                    href={`/stocks/${item.ticker.toLowerCase()}/`}
                    className="min-w-0 hover:text-brand"
                  >
                    <span className="font-mono text-sm font-bold text-brand">
                      {item.ticker}
                    </span>
                    <h3 className="mt-1 truncate font-semibold">{name}</h3>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {sector}
                      {(stock?.industry ?? directory?.industry)
                        ? ` · ${stock?.industry ?? directory?.industry}`
                        : ""}
                    </p>
                  </a>
                  <SaveStockButton
                    ticker={item.ticker}
                    onChanged={(watched) => {
                      if (!watched)
                        requestAnimationFrame(() => {
                          const target =
                            headingRef.current ??
                            document.getElementById("watchlist-empty-title");
                          target?.focus();
                        });
                    }}
                  />
                </div>
                {stock ? (
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-surface-2 p-3 text-xs">
                    <Metric label="가격" value={fmtQuote(stock.price)} />
                    <Metric label="등락" value={<DeltaText value={stock.change} />} />
                    <Metric label="거래대금" value={fmtMoney(stock.volume)} />
                    <Metric
                      label="20D 대비"
                      value={fmtPct(stock.volumeVs?.["20d"] ?? 0)}
                    />
                    <div className="col-span-2 flex items-center justify-between border-t border-border/60 pt-2">
                      <span className="text-muted-foreground">현재 신호</span>
                      <SignalBadge signal={stock.signal} size="xs" />
                    </div>
                  </div>
                ) : (
                  <p className="mt-4 rounded-md bg-surface-2 p-3 text-xs leading-5 text-muted-foreground">
                    {directory
                      ? "미국 상장 종목으로 확인됐지만 거래대금 분석은 준비 중입니다."
                      : "현재 종목 정보를 불러올 수 없습니다. 저장 목록에서는 언제든 제거할 수 있습니다."}
                  </p>
                )}
                <p className="mt-3 text-[11px] text-muted-foreground">
                  추가일 {new Date(item.addedAt).toLocaleDateString("ko-KR")}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular">{value}</div>
    </div>
  );
}

function WatchlistPage() {
  const watchlist = useWatchlist();
  const sourceStates = useDataSources(["market"]);
  const [directory, setDirectory] = useState<DirectoryStock[]>([]);
  const liveByTicker = useMemo(
    () => new Map(LIVE_STOCKS.map((stock) => [stock.ticker, stock])),
    [sourceStates.market.lastSuccessAt],
  );
  const directoryByTicker = useMemo(
    () => new Map(directory.map((stock) => [stock.ticker, stock])),
    [directory],
  );

  useEffect(() => {
    const missing = watchlist.items.some((item) => !liveByTicker.has(item.ticker));
    if (!missing) return;
    const controller = new AbortController();
    void loadStockDirectory(controller.signal).then((rows) => {
      if (!controller.signal.aborted) setDirectory(rows);
    });
    return () => controller.abort();
  }, [liveByTicker, watchlist.items]);

  const rows = useMemo<WatchlistRow[]>(
    () =>
      [...watchlist.items]
        .sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt))
        .map((item) => ({
          item,
          stock: liveByTicker.get(item.ticker),
          directory: directoryByTicker.get(item.ticker),
        })),
    [directoryByTicker, liveByTicker, watchlist.items],
  );

  return (
    <PageShell>
      <PageHeading
        title="관심종목"
        description="이 브라우저에 저장한 미국 종목을 한곳에서 확인합니다."
      />
      <DataSourcesStatus states={[sourceStates.market]} className="mb-4" />
      <WatchlistView rows={rows} notice={watchlist.notice} />
    </PageShell>
  );
}
