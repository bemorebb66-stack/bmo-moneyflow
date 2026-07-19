import { useEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3 } from "lucide-react";
import { MARKET_INDEXES } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const INDEX_ORDER = ["sp500", "russell2000", "dow", "nasdaq"];

export function MarketIndexPanel() {
  const springRef = useRef<HTMLDivElement>(null);
  const rows = [...MARKET_INDEXES].sort(
    (a, b) => INDEX_ORDER.indexOf(a.id) - INDEX_ORDER.indexOf(b.id),
  );
  const asOf = rows[0]?.asOf;

  useEffect(() => {
    const element = springRef.current;
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return;

    let lastScrollY = window.scrollY;
    let target = 0;
    let position = 0;
    let velocity = 0;
    let frame = 0;
    let settleTimer = 0;

    const animate = () => {
      velocity = (velocity + (target - position) * 0.16) * 0.72;
      position += velocity;
      element.style.transform = `translate3d(0, ${position.toFixed(2)}px, 0)`;

      if (Math.abs(position) > 0.05 || Math.abs(velocity) > 0.05 || target) {
        frame = window.requestAnimationFrame(animate);
      } else {
        position = 0;
        velocity = 0;
        element.style.transform = "translate3d(0, 0, 0)";
        frame = 0;
      }
    };

    const onScroll = () => {
      const delta = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      target = Math.max(-12, Math.min(12, delta * 0.55));
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        target = 0;
        if (!frame) frame = window.requestAnimationFrame(animate);
      }, 70);
      if (!frame) frame = window.requestAnimationFrame(animate);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.clearTimeout(settleTimer);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <aside className="hidden min-w-0 2xl:block" aria-label="미국 주요 시장지수">
      <div className="sticky top-1/2 -translate-y-1/2">
        <div
          ref={springRef}
          className="border-l border-border/70 pl-5 will-change-transform"
        >
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-brand" />
            <div>
              <h2 className="text-xs font-semibold">미국 주요 지수</h2>
              <p className="text-[10px] text-muted-foreground">
                정규장 종가 기준
              </p>
            </div>
          </div>

          {rows.length ? (
            <ul className="mt-3 divide-y divide-border/60">
            {rows.map((row) => {
              const positive = row.change > 0;
              const Icon = positive ? ArrowUpRight : ArrowDownRight;
              return (
                <li key={row.id} className="py-2.5 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium">{row.name}</span>
                    <span
                      className={cn(
                        "inline-flex items-center text-xs font-semibold tabular",
                        positive
                          ? "text-success"
                          : row.change < 0
                            ? "text-danger"
                            : "text-muted-foreground",
                      )}
                    >
                      <Icon className="mr-0.5 h-3 w-3" />
                      {positive ? "+" : ""}
                      {row.change.toFixed(2)}%
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground tabular">
                    {row.value.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                </li>
              );
            })}
            </ul>
          ) : (
            <p className="mt-3 rounded-md bg-surface-2 px-3 py-3 text-[11px] text-muted-foreground">
              지수 데이터를 확인하고 있습니다.
            </p>
          )}

          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            {asOf ? `${asOf} · ` : ""}Yahoo Finance 장마감 일봉
          </p>
        </div>
      </div>
    </aside>
  );
}
