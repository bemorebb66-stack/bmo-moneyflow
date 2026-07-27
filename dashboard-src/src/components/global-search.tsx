import { useEffect, useMemo, useState } from "react";
import { Building2, Clock3, Layers3, Search } from "lucide-react";
import { Button } from "./ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "./ui/command";
import { LIVE_MARKET_DATA, LIVE_STOCKS } from "@/lib/mock-data";
import {
  loadStockDirectory,
  type DirectoryStock,
} from "@/lib/stock-directory";

const normalize = (value: string) => value.trim().toLocaleLowerCase("ko-KR");

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [directory, setDirectory] = useState<DirectoryStock[]>([]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open || directory.length > 0) return;
    void loadStockDirectory().then(setDirectory);
  }, [open, directory.length]);

  const companies = useMemo(() => {
    const keyword = normalize(query);
    const sorted = [...LIVE_STOCKS].sort((a, b) => b.volume - a.volume);
    if (!keyword) return sorted.slice(0, 8);
    return sorted
      .filter((stock) =>
        normalize(
          [stock.ticker, stock.name, stock.sector, stock.industry ?? ""].join(
            " ",
          ),
        ).includes(keyword),
      )
      .slice(0, 30);
  }, [query]);

  const directoryCompanies = useMemo(() => {
    const keyword = normalize(query);
    if (!keyword) return [];
    const liveTickers = new Set(LIVE_STOCKS.map((stock) => stock.ticker));
    return directory
      .filter(
        (stock) =>
          !liveTickers.has(stock.ticker) &&
          normalize(
            [
              stock.ticker,
              stock.name,
              stock.sector,
              stock.industry,
            ].join(" "),
          ).includes(keyword),
      )
      .sort((a, b) => {
        const aExact = a.ticker.toLowerCase() === keyword ? 1 : 0;
        const bExact = b.ticker.toLowerCase() === keyword ? 1 : 0;
        return bExact - aExact || b.marketCap - a.marketCap;
      })
      .slice(0, 12);
  }, [directory, query]);

  const groups = useMemo(() => {
    const keyword = normalize(query);
    const rows = [
      ...LIVE_MARKET_DATA.sector["1d"].map((row) => ({
        ...row,
        category: "sector",
      })),
      ...LIVE_MARKET_DATA.industry["1d"].map((row) => ({
        ...row,
        category: "industry",
      })),
    ];
    if (!keyword) return rows.slice(0, 6);
    return rows
      .filter((row) => normalize(row.name).includes(keyword))
      .slice(0, 12);
  }, [query]);

  const goToStock = (ticker: string) => {
    setOpen(false);
    window.location.assign(`/stock/?ticker=${encodeURIComponent(ticker)}`);
  };

  const goToGroup = (category: string, id: string) => {
    setOpen(false);
    const hash = new URLSearchParams({
      m: category,
      p: "1d",
      mt: "idx",
      r: "60",
      g: id,
    });
    window.location.assign(`/#${hash.toString()}`);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 px-2.5 text-muted-foreground xl:min-w-44 xl:justify-start"
        aria-label="종목·섹터 검색"
      >
        <Search className="h-4 w-4" />
        <span className="hidden xl:inline">종목·섹터 검색</span>
        <kbd className="ml-auto hidden rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground xl:inline">
          Ctrl K
        </kbd>
      </Button>

      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
      >
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="티커·영문명·한글명·섹터·산업 검색"
        />
        <CommandList>
          <CommandEmpty>
            검색 결과가 없습니다. 티커를 확인하거나 데이터 요청을 남겨주세요.
          </CommandEmpty>
          {companies.length > 0 && (
            <CommandGroup heading={query ? "종목" : "거래대금 상위 종목"}>
              {companies.map((stock) => (
                <CommandItem
                  key={stock.ticker}
                  value={`${stock.ticker} ${stock.name} ${stock.sector} ${stock.industry ?? ""}`}
                  onSelect={() => goToStock(stock.ticker)}
                  className="gap-3"
                >
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="font-semibold text-foreground">
                        {stock.ticker}
                      </span>
                      <span className="truncate text-sm">{stock.name}</span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {stock.sector}
                      {stock.industry ? ` · ${stock.industry}` : ""}
                    </p>
                  </div>
                  <CommandShortcut>상세</CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {directoryCompanies.length > 0 && (
            <>
              {companies.length > 0 && <CommandSeparator />}
              <CommandGroup heading="미국 상장 종목 · 분석 준비 중">
                {directoryCompanies.map((stock) => (
                  <CommandItem
                    key={`directory:${stock.ticker}`}
                    value={`${stock.ticker} ${stock.name} ${stock.sector} ${stock.industry}`}
                    onSelect={() => goToStock(stock.ticker)}
                    className="gap-3"
                  >
                    <Clock3 className="h-4 w-4 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-foreground">
                          {stock.ticker}
                        </span>
                        <span className="truncate text-sm">{stock.name}</span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {[stock.sector, stock.industry]
                          .filter(Boolean)
                          .join(" · ") || "상장 정보 확인됨"}
                      </p>
                    </div>
                    <CommandShortcut>준비 중</CommandShortcut>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
          {companies.length > 0 && groups.length > 0 && <CommandSeparator />}
          {groups.length > 0 && (
            <CommandGroup heading="섹터·산업">
              {groups.map((row) => (
                <CommandItem
                  key={`${row.category}:${row.id}`}
                  value={`${row.name} ${row.category}`}
                  onSelect={() => goToGroup(row.category, row.id)}
                  className="gap-3"
                >
                  <Layers3 className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{row.name}</span>
                  <CommandShortcut>
                    {row.category === "sector" ? "대분류" : "세부 산업"}
                  </CommandShortcut>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
