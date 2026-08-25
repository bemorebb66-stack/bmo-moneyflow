import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");

describe("volume trend product surfaces", () => {
  it("renders raw trading-value bars with 5 and 20 day averages on stock detail", async () => {
    const stock = await readFile(resolve(root, "routes/stock.tsx"), "utf8");
    expect(stock).toContain('useState<"bar" | "line">("bar")');
    expect(stock).toContain('dataKey="ma5"');
    expect(stock).toContain('dataKey="ma20"');
    expect(stock).toContain("ReportedEarningsChart");
    expect(stock).toContain('name="매출"');
    expect(stock).toContain('name="순이익"');
    expect(stock).toContain('name="순이익률"');
  });

  it("exposes momentum and latest 20-day breakout in the scanner", async () => {
    const scanner = await readFile(
      resolve(root, "components/surge-table.tsx"),
      "utf8",
    );
    expect(scanner).toContain('id: "ma20-breakout"');
    expect(scanner).toContain("stock.volumeBreakout20 === true");
    expect(scanner).toContain('sortKey="momentum"');
  });

  it("hydrates unindexed daily trading-value history for calculations", async () => {
    const hydration = await readFile(
      resolve(root, "lib/hydrate-live-data.ts"),
      "utf8",
    );
    expect(hydration).toContain("LIVE_STOCK_VOLUME_SERIES[ticker] = rawSeries");
    expect(hydration).toContain("calculateVolumeMomentum(rawSeries)");
    expect(hydration).toContain("isLatestVolumeBreakout20(rawSeries)");
  });
});
