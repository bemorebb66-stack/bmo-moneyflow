import { useState } from "react";
import { Menu, Moon, Sun } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useTheme } from "./theme-provider";
import { Button } from "./ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "./ui/sheet";
import { cn } from "@/lib/utils";
import type { DataStatus } from "@/lib/mock-data";
import { GlobalSearch } from "./global-search";
import { BrandMark } from "./brand-mark";
import { formatKstTimestamp } from "@/lib/date-time";

const NAV = [
  { label: "시장 흐름", to: "/" },
  { label: "종목 스캐너", to: "/scanner" },
  { label: "관심종목", to: "/watchlist" },
  { label: "내부자 거래", to: "/insider" },
  { label: "IPO 락업", to: "/ipo-lockup" },
  { label: "오늘의 요약", to: "/today" },
  { label: "매매 복기", to: "/replay" },
] as const;

interface Props {
  asOf: string;
  updatedAt: string;
  universeCount: number;
  status: DataStatus;
  delayTradingDays: number;
}

export function SiteHeader({
  asOf,
  updatedAt,
  universeCount,
  status,
  delayTradingDays,
}: Props) {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:px-6">
        <Link
          to="/"
          aria-label="BVT Money Flow 홈"
          className="flex shrink-0 items-center gap-1.5 text-brand sm:gap-2"
        >
          <BrandMark className="h-7 w-10 sm:h-8 sm:w-12" />
          <span className="whitespace-nowrap text-sm font-semibold tracking-tight text-foreground">
            <span className="sm:hidden">BVT</span>
            <span className="hidden sm:inline">BVT Money Flow</span>
          </span>
        </Link>

        <nav
          aria-label="주요 메뉴"
          className="ml-3 hidden min-w-0 items-center gap-0.5 min-[1360px]:flex"
        >
          {NAV.map((n) => {
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <GlobalSearch />
          <StatusStrip
            asOf={asOf}
            universeCount={universeCount}
            status={status}
            delayTradingDays={delayTradingDays}
          />

          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={
              theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"
            }
            aria-pressed={theme === "dark"}
            className="hidden h-10 w-10 p-0 min-[1360px]:inline-flex min-[1440px]:w-auto min-[1440px]:px-3"
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            <span className="hidden text-xs min-[1440px]:inline">
              {theme === "dark" ? "라이트" : "다크"}
            </span>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 gap-1 px-2 min-[1360px]:hidden"
                aria-label="메뉴 열기"
              >
                <Menu className="h-5 w-5" />
                <span className="text-xs font-semibold">메뉴</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetHeader>
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <div className="mt-5 border-b border-border pb-5">
                <GlobalSearch
                  variant="menu"
                  onNavigate={() => setOpen(false)}
                />
              </div>
              <nav
                aria-label="모바일 메뉴"
                className="mt-5 flex flex-col gap-1"
              >
                {NAV.map((n) => {
                  const active = isActive(n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "min-h-11 rounded-md border-l-2 border-transparent px-3 py-3 text-sm font-medium",
                        active
                          ? "border-brand bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60",
                      )}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </nav>
              <div className="mt-6 border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={toggle}
                  className="w-full justify-start gap-2"
                >
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                  {theme === "dark" ? "라이트 모드" : "다크 모드"}
                </Button>
                <div className="mt-4 space-y-1.5 text-xs text-muted-foreground tabular">
                  <div>기준일 · {asOf}</div>
                  <div>갱신 · {formatKstTimestamp(updatedAt)}</div>
                  <div>
                    추적 종목 · {universeCount.toLocaleString("ko-KR")}개
                  </div>
                  <div>
                    데이터 상태 ·{" "}
                    {status === "normal"
                      ? "정상"
                      : status === "stale"
                        ? `${delayTradingDays}거래일 지연`
                        : status === "partial"
                          ? "일부 지연"
                          : status === "failed"
                            ? "업데이트 실패"
                            : "확인 중"}
                  </div>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function StatusStrip({
  asOf,
  universeCount,
  status,
  delayTradingDays,
}: {
  asOf: string;
  universeCount: number;
  status: DataStatus;
  delayTradingDays: number;
}) {
  return (
    <div className="hidden items-center gap-2 rounded-md border border-border/70 bg-surface px-2.5 py-2 text-xs leading-tight text-muted-foreground tabular min-[1440px]:flex">
      <span
        className={cn(
          "inline-flex items-center gap-1.5 font-medium",
          status === "normal"
            ? "text-success"
            : status === "failed"
              ? "text-danger"
              : "text-warning",
        )}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {status === "normal"
          ? "데이터 정상"
          : status === "stale"
            ? `데이터 ${delayTradingDays}거래일 지연`
            : status === "partial"
              ? "일부 지연"
              : status === "failed"
                ? "업데이트 실패"
                : "확인 중"}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span>
        기준일 <span className="text-foreground">{asOf}</span>
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span>
        종목{" "}
        <span className="text-foreground">
          {universeCount.toLocaleString("ko-KR")}
        </span>
      </span>
    </div>
  );
}
