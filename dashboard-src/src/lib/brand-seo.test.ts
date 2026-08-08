import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardRoot = resolve(import.meta.dirname, "..", "..");
const projectRoot = resolve(dashboardRoot, "..");
const coreMessage = "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다.";

describe("BVT Money Flow brand, briefing, and SEO", () => {
  it("uses one brand and the home core message", async () => {
    const sources = await Promise.all([
      "index.html",
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/routes/replay.tsx",
      "src/routes/privacy-policy.tsx",
      "vite.config.ts",
    ].map((file) => readFile(resolve(dashboardRoot, file), "utf8")));
    expect(sources.join("\n")).not.toContain("BVT Replay");
    expect(sources[0]).toContain(coreMessage);
    expect(sources[2]).toContain(`title="${coreMessage}"`);
    expect(sources.join("\n")).toContain("BVT Money Flow");
  });

  it("keeps the beginner briefing sequence, labels, provenance, and CTA paths", async () => {
    const home = await readFile(resolve(dashboardRoot, "src/routes/index.tsx"), "utf8");
    for (const path of ['to="/today"', 'to="/watchlist"', 'to="/scanner"']) expect(home).toContain(path);

    const weekly = await readFile(resolve(dashboardRoot, "src/components/weekly-market-summary.tsx"), "utf8");
    const headings = [
      "이번 주 한 줄 요약",
      "거래가 집중된 섹터",
      "거래대금 증가 종목",
      "변화의 근거",
      "필요한 경우 내부자·실적·IPO 확인",
      "다음 주 확인할 지표",
      "데이터 한계",
    ];
    const positions = headings.map((heading) => weekly.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const label of ["사실", "데이터 해석", "데이터 안내", "기준일", "출처:", "투자 추천이 아닙니다"]) expect(weekly).toContain(label);
  });

  it("keeps the three-line brand assets and verified SEO generation rules", async () => {
    const favicon = await readFile(resolve(projectRoot, "favicon.svg"), "utf8");
    for (const path of ["M3 6h12c5 0 7 6 2 8H6", "M4 17l10 10 10-15 8 10", "M22 7h22L31 27 20 16"]) expect(favicon).toContain(path);

    const generator = await readFile(resolve(dashboardRoot, "scripts/generate-static-pages.mjs"), "utf8");
    expect(generator).toContain('String(data.updated ?? "").match');
    expect(generator).toContain("Sitemap: ${siteUrl}/sitemap.xml");
    expect(generator).toContain('const siteUrl = "https://www.bvtmoneyflow.xyz"');
  });

  it("does not enable telemetry without a manually configured endpoint", async () => {
    const env = await readFile(resolve(dashboardRoot, ".env.example"), "utf8");
    expect(env).toContain("VITE_TELEMETRY_ENABLED=false");
    expect(env).toMatch(/VITE_TELEMETRY_ENDPOINT=\r?\n/);
  });
});
