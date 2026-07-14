import { useState } from "react";
import { Menu, Moon, Sun, TrendingUp } from "lucide-react";
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

const NAV = [
  { label: "시장 흐름", to: "/" },
  { label: "종목 스캐너", to: "/scanner" },
  { label: "내부자 거래", to: "/insider" },
  { label: "IPO 락업", to: "/ipo-lockup" },
  { label: "오늘의 요약", to: "/today" },
] as const;

interface Props {
  asOf: string;
  updatedAt: string;
  universeCount: number;
  status: DataStatus;
}

export function SiteHeader({ asOf, updatedAt, universeCount, status }: Props) {
  const { theme, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string) =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 lg:px-6">
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand text-brand-foreground">
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-sm font-semibold">BVT Money Flow</div>
            <div className="truncate text-[10px] font-medium text-muted-foreground">by BMO Value Talks</div>
          </div>
        </Link>

        <nav className="ml-6 hidden items-center gap-1 md:flex">
          {NAV.map((n) => {
            const active = isActive(n.to);
            return (
              <Link
                key={n.to}
                to={n.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
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
          <StatusStrip asOf={asOf} updatedAt={updatedAt} universeCount={universeCount} status={status} />

          <Button
            variant="ghost"
            size="sm"
            onClick={toggle}
            aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
            aria-pressed={theme === "dark"}
            className="hidden gap-1.5 sm:inline-flex"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="text-xs">{theme === "dark" ? "라이트" : "다크"}</span>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="메뉴 열기"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm">
              <SheetHeader>
                <SheetTitle>메뉴</SheetTitle>
              </SheetHeader>
              <div className="mt-6 flex flex-col gap-1">
                {NAV.map((n) => {
                  const active = isActive(n.to);
                  return (
                    <Link
                      key={n.to}
                      to={n.to}
                      onClick={() => setOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "rounded-md px-3 py-2.5 text-sm font-medium",
                        active
                          ? "bg-secondary text-foreground"
                          : "text-muted-foreground hover:bg-secondary/60",
                      )}
                    >
                      {n.label}
                    </Link>
                  );
                })}
              </div>
              <div className="mt-6 border-t border-border pt-4">
                <Button
                  variant="outline"
                  onClick={toggle}
                  className="w-full justify-start gap-2"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                  {theme === "dark" ? "라이트 모드" : "다크 모드"}
                </Button>
                <div className="mt-4 space-y-1.5 text-xs text-muted-foreground tabular">
                  <div>기준일 · {asOf}</div>
                  <div>갱신 · {updatedAt}</div>
                  <div>추적 종목 · {universeCount.toLocaleString("ko-KR")}개</div>
                  <div>데이터 상태 · {status === "normal" ? "정상" : status === "stale" ? "이전 데이터" : status === "partial" ? "일부 지연" : status === "failed" ? "업데이트 실패" : "확인 중"}</div>
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
  updatedAt,
  universeCount,
  status,
}: {
  asOf: string;
  updatedAt: string;
  universeCount: number;
  status: DataStatus;
}) {
  return (
    <div className="hidden items-center gap-3 rounded-md border border-border/70 bg-surface px-3 py-1.5 text-[11px] leading-tight text-muted-foreground tabular lg:flex">
      <span className={cn("inline-flex items-center gap-1.5 font-medium", status === "normal" ? "text-success" : status === "failed" ? "text-danger" : "text-warning")}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {status === "normal" ? "데이터 정상" : status === "stale" ? "이전 데이터" : status === "partial" ? "일부 지연" : status === "failed" ? "업데이트 실패" : "확인 중"}
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span>
        기준일 <span className="text-foreground">{asOf}</span>
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span>
        갱신 <span className="text-foreground">{updatedAt}</span>
      </span>
      <span className="h-3 w-px bg-border" aria-hidden />
      <span>
        종목 <span className="text-foreground">{universeCount.toLocaleString("ko-KR")}</span>
      </span>
    </div>
  );
}
