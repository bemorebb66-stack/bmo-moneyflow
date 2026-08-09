import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("market tools and watchlist comparison", () => {
  it("keeps search, currency and market indices in the right-side rail", async () => {
    const [shell, header, tools] = await Promise.all([
      readFile(resolve(root, "components/page-shell.tsx"), "utf8"),
      readFile(resolve(root, "components/site-header.tsx"), "utf8"),
      readFile(resolve(root, "components/market-index-panel.tsx"), "utf8"),
    ]);
    expect(shell.indexOf("<SiteHeader")).toBeLessThan(shell.indexOf("<MarketIndexPanel"));
    expect(shell).toContain("2xl:grid-cols-[minmax(0,1fr)_220px]");
    expect(header).not.toContain("<GlobalSearch");
    expect(tools).toContain("<GlobalSearch");
    expect(tools).toContain("sticky top-[76px]");
    expect(tools).toContain("2xl:block");
  });

  it("places watchlist beside index membership and limits chart additions to it", async () => {
    const [filter, home, chart] = await Promise.all([
      readFile(resolve(root, "components/filter-bar.tsx"), "utf8"),
      readFile(resolve(root, "routes/index.tsx"), "utf8"),
      readFile(resolve(root, "components/comparison-chart.tsx"), "utf8"),
    ]);
    expect(filter.indexOf('label: "편입 지수"')).toBeLessThan(filter.indexOf('label: "관심종목"'));
    expect(home).toContain("addableRows={watchlistRows}");
    expect(chart).toContain("rows={addableRows}");
    expect(chart).toContain("+ 관심종목 추가");
  });

  it("connects company and group stars to the interest view", async () => {
    const [table, groupFavorites, home] = await Promise.all([
      readFile(resolve(root, "components/sector-table.tsx"), "utf8"),
      readFile(resolve(root, "lib/group-favorites.ts"), "utf8"),
      readFile(resolve(root, "routes/index.tsx"), "utf8"),
    ]);
    expect(table).toContain("watchedTickers.includes(company.ticker)");
    expect(table).toContain("onToggleWatch(company.ticker)");
    expect(table).toContain("groupFavorites.toggle(s.id)");
    expect(table).toContain("aria-pressed={active}");
    expect(groupFavorites).toContain('STORAGE_KEY = "bvt-favorite-groups"');
    expect(groupFavorites).toContain("window.dispatchEvent(new Event(CHANGE_EVENT))");
    expect(home).toContain("...favoriteGroupRows, ...favoriteStockRows");
  });
});
