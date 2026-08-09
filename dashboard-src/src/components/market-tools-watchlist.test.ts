import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("market tools and watchlist comparison", () => {
  it("keeps search, currency and market indices below the site header", async () => {
    const [shell, header, tools] = await Promise.all([
      readFile(resolve(root, "components/page-shell.tsx"), "utf8"),
      readFile(resolve(root, "components/site-header.tsx"), "utf8"),
      readFile(resolve(root, "components/market-index-panel.tsx"), "utf8"),
    ]);
    expect(shell.indexOf("<SiteHeader")).toBeLessThan(shell.indexOf("<MarketIndexPanel"));
    expect(header).not.toContain("<GlobalSearch");
    expect(header).not.toContain('{ label: "관심종목"');
    expect(tools).toContain("<GlobalSearch");
    expect(tools).toContain("주요지수");
    expect(tools).toContain("표시 통화");
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
});
