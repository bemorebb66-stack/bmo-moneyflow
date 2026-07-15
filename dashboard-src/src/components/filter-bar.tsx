import { useEffect, useRef } from "react";
import { ChevronRight, Search, X } from "lucide-react";
import { Input } from "./ui/input";
import { cn } from "@/lib/utils";

export type Category = "sector" | "industry" | "universe" | "custom" | "mcap";
export type Period = "1d" | "5d" | "20d" | "60d";

const CATEGORIES: { id: Category; label: string }[] = [
  { id: "sector", label: "대분류 섹터" },
  { id: "industry", label: "세부 산업" },
  { id: "custom", label: "커스텀 그룹" },
  { id: "mcap", label: "시가총액" },
  { id: "universe", label: "편입 지수" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "1d", label: "전일" },
  { id: "5d", label: "5일" },
  { id: "20d", label: "20일" },
  { id: "60d", label: "60일" },
];

interface Props {
  category: Category;
  onCategory: (c: Category) => void;
  period: Period;
  onPeriod: (p: Period) => void;
  query: string;
  onQuery: (q: string) => void;
}

export function FilterBar({
  category,
  onCategory,
  period,
  onPeriod,
  query,
  onQuery,
}: Props) {
  return (
    <div className="sticky top-14 z-30 -mx-4 border-y border-border/70 bg-background/90 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/70 lg:mx-0 lg:rounded-xl lg:border">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
        <FilterGroup label="분류">
          <Segmented
            value={category}
            onValueChange={(v) => onCategory(v as Category)}
            options={CATEGORIES}
          />
        </FilterGroup>

        <div className="hidden h-8 w-px bg-border lg:block" aria-hidden />

        <FilterGroup label="비교 기간">
          <Segmented
            value={period}
            onValueChange={(v) => onPeriod(v as Period)}
            options={PERIODS}
          />
        </FilterGroup>

        <div className="relative lg:ml-auto lg:w-72">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="티커·기업명 검색 (예: NVDA, 테슬라)"
            aria-label="티커 또는 기업명 검색"
            className="h-11 pl-9 pr-11 lg:h-9 lg:pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="검색어 지우기"
              className="absolute right-1 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground lg:right-2 lg:h-6 lg:w-6"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="relative min-w-0">
        {children}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex w-9 items-center justify-end bg-gradient-to-l from-background via-background/85 to-transparent pr-0.5 lg:hidden" aria-hidden>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  onValueChange,
  options,
}: {
  value: T;
  onValueChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = scrollerRef.current?.querySelector<HTMLElement>("[aria-selected='true']");
    selected?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [value]);

  return (
    <div ref={scrollerRef} className="no-scrollbar overflow-x-auto pr-7 lg:pr-0">
      <div role="tablist" className="inline-flex h-11 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5 lg:h-9">
        {options.map((opt) => {
          const active = opt.id === value;
          return (
            <button
              key={opt.id}
              role="tab"
              aria-selected={active}
              onClick={() => onValueChange(opt.id)}
              className={cn(
                "min-h-10 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors lg:min-h-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
                active
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
