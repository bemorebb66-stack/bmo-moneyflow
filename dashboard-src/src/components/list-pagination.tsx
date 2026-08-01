import { ChevronLeft, ChevronRight } from "lucide-react";
import { pageWindow } from "@/lib/list-state";
import { cn } from "@/lib/utils";

export function ListPagination({
  page,
  pageCount,
  total,
  start,
  end,
  label,
  onPageChange,
  className,
}: {
  page: number;
  pageCount: number;
  total: number;
  start: number;
  end: number;
  label: string;
  onPageChange: (page: number) => void;
  className?: string;
}) {
  if (total === 0) return null;
  const pages = pageWindow(page, pageCount);
  const move = (next: number) => {
    if (next === page || next < 1 || next > pageCount) return;
    onPageChange(next);
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground" aria-live="polite">
        총 {total.toLocaleString("ko-KR")}건 중 {start + 1}~
        {end.toLocaleString("ko-KR")}번 · {page}/{pageCount}페이지
      </p>
      <nav aria-label={`${label} 페이지 이동`}>
        <ul className="flex items-center gap-1">
          <li>
            <PageButton
              label="이전 페이지"
              disabled={page === 1}
              onClick={() => move(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only sm:not-sr-only">이전</span>
            </PageButton>
          </li>
          {pages[0] > 1 && (
            <>
              <li>
                <PageButton label="1페이지" onClick={() => move(1)}>
                  1
                </PageButton>
              </li>
              {pages[0] > 2 && (
                <li aria-hidden className="px-1 text-muted-foreground">
                  …
                </li>
              )}
            </>
          )}
          {pages.map((number) => (
            <li key={number}>
              <PageButton
                label={`${number}페이지`}
                current={number === page}
                onClick={() => move(number)}
              >
                {number}
              </PageButton>
            </li>
          ))}
          {pages.at(-1)! < pageCount && (
            <>
              {pages.at(-1)! < pageCount - 1 && (
                <li aria-hidden className="px-1 text-muted-foreground">
                  …
                </li>
              )}
              <li>
                <PageButton
                  label={`${pageCount}페이지`}
                  onClick={() => move(pageCount)}
                >
                  {pageCount}
                </PageButton>
              </li>
            </>
          )}
          <li>
            <PageButton
              label="다음 페이지"
              disabled={page === pageCount}
              onClick={() => move(page + 1)}
            >
              <span className="sr-only sm:not-sr-only">다음</span>
              <ChevronRight className="h-4 w-4" />
            </PageButton>
          </li>
        </ul>
      </nav>
    </div>
  );
}

function PageButton({
  label,
  current,
  disabled,
  onClick,
  children,
}: {
  label: string;
  current?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-current={current ? "page" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-md border px-2 text-xs font-semibold transition-colors",
        current
          ? "border-brand bg-brand text-brand-foreground"
          : "border-border bg-surface hover:bg-secondary",
        disabled && "cursor-not-allowed opacity-45",
      )}
    >
      {children}
    </button>
  );
}
