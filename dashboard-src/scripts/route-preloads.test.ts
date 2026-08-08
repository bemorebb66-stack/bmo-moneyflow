import { describe, expect, it } from "vitest";
import { limitRouteModulePreloads } from "./route-preloads.mjs";

const html = [
  '<link rel="modulepreload" crossorigin href="/assets/page-shell-1.js">',
  '<link rel="modulepreload" crossorigin href="/assets/LineChart-1.js">',
  '<link rel="modulepreload" crossorigin href="/assets/generateCategoricalChart-1.js">',
  '<link rel="modulepreload" crossorigin href="/assets/stocks._ticker-1.js">',
  '<link rel="modulepreload" crossorigin href="/assets/replay-1.js">',
  '<link rel="modulepreload" crossorigin href="/assets/pdf.worker-1.js">',
  '<link rel="modulepreload" crossorigin href="/assets/briefings._date-1.js">',
].join("\n");

describe("limitRouteModulePreloads", () => {
  it("keeps stock charts only on stock pages", () => {
    const stock = limitRouteModulePreloads(html, "/stocks/nvda/");
    const today = limitRouteModulePreloads(html, "/today/");
    expect(stock).toContain("LineChart-1.js");
    expect(stock).toContain("stocks._ticker-1.js");
    expect(today).not.toContain("LineChart-1.js");
    expect(today).not.toContain("stocks._ticker-1.js");
  });

  it("keeps Replay assets only on Replay", () => {
    expect(limitRouteModulePreloads(html, "/replay/")).toContain("replay-1.js");
    expect(limitRouteModulePreloads(html, "/replay/")).toContain("pdf.worker-1.js");
    expect(limitRouteModulePreloads(html, "/insider/")).not.toContain("replay-1.js");
    expect(limitRouteModulePreloads(html, "/insider/")).not.toContain("pdf.worker-1.js");
  });

  it("always preserves shared shell modules", () => {
    expect(limitRouteModulePreloads(html, "/insider/")).toContain("page-shell-1.js");
  });
});
