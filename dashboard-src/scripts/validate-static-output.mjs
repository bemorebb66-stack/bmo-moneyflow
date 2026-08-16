import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve(import.meta.dirname, "..", "dist");
const errors = [];
const count = (html, regex) => [...html.matchAll(regex)].length;

async function validatePage(relativePath) {
  const file = resolve(outputRoot, relativePath, "index.html");
  let html;
  try { html = await readFile(file, "utf8"); } catch { errors.push(`${relativePath}: index.html 없음`); return; }
  const expected = `https://www.bvtmoneyflow.xyz/${relativePath.replaceAll("\\", "/")}/`;
  const checks = [
    ["title", /<title(?:\s[^>]*)?>[\s\S]*?<\/title>/gi],
    ["description", /<meta\s+[^>]*name="description"[^>]*>/gi],
    ["canonical", /<link\s+[^>]*rel="canonical"[^>]*>/gi],
    ["og:title", /<meta\s+[^>]*property="og:title"[^>]*>/gi],
    ["og:description", /<meta\s+[^>]*property="og:description"[^>]*>/gi],
    ["og:url", /<meta\s+[^>]*property="og:url"[^>]*>/gi],
    ["og:image", /<meta\s+[^>]*property="og:image"[^>]*>/gi],
    ["H1", /<h1(?:\s[^>]*)?>[\s\S]*?<\/h1>/gi],
  ];
  for (const [label, regex] of checks) if (count(html, regex) !== 1) errors.push(`${relativePath}: ${label} 개수 ${count(html, regex)}`);
  const canonical = html.match(/<link\s+[^>]*rel="canonical"[^>]*href="([^"]+)"[^>]*>/i)?.[1];
  if (canonical !== expected) errors.push(`${relativePath}: canonical 불일치 ${canonical} != ${expected}`);
  if (relativePath.startsWith("stocks/") && html.includes('href="https://www.bvtmoneyflow.xyz/" />')) errors.push(`${relativePath}: 홈페이지 canonical 잔존`);
  const mainText = html.match(/<main[\s\S]*?<\/main>/i)?.[0].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() ?? "";
  if (mainText.length < 250) errors.push(`${relativePath}: 정적 본문이 너무 짧음 (${mainText.length})`);
  for (const block of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { JSON.parse(block[1]); } catch (error) { errors.push(`${relativePath}: JSON-LD 파싱 실패 ${error.message}`); }
  }
}

const stockDirs = await readdir(resolve(outputRoot, "stocks"));
const briefingDirs = (await readdir(resolve(outputRoot, "briefings"))).filter((name) => /^\d{4}-\d{2}-\d{2}$/.test(name));
const weeklyBriefingDirs = await readdir(resolve(outputRoot, "briefings", "weeks"));
for (const slug of stockDirs) await validatePage(`stocks/${slug}`);
for (const date of briefingDirs) await validatePage(`briefings/${date}`);
for (const weekId of weeklyBriefingDirs) await validatePage(`briefings/weeks/${weekId}`);
for (const date of briefingDirs) {
  const html = await readFile(resolve(outputRoot, "briefings", date, "index.html"), "utf8");
  if (!html.includes(`데이터 기준일 ${date}`)) errors.push(`일간 브리핑 기준일 누락: ${date}`);
  for (const required of ["출처:", "투자 추천이 아닙니다"]) if (!html.includes(required)) errors.push(`일간 브리핑 안내 누락: ${date} ${required}`);
}
for (const weekId of weeklyBriefingDirs) {
  const html = await readFile(resolve(outputRoot, "briefings", "weeks", weekId, "index.html"), "utf8");
  if (!html.includes("데이터 기준일")) errors.push(`주간 브리핑 기준일 누락: ${weekId}`);
  for (const required of ["출처:", "투자 추천이 아닙니다"]) if (!html.includes(required)) errors.push(`주간 브리핑 안내 누락: ${weekId} ${required}`);
}
for (const required of ["nvda", "aapl", "msft", "brk-b"]) if (!stockDirs.includes(required)) errors.push(`대표 종목 누락: ${required}`);
const legacy = await readFile(resolve(outputRoot, "stock", "index.html"), "utf8");
if (!legacy.includes('src="/legacy-stock-redirect.js"')) errors.push("legacy stock redirect script missing");
const legacyRedirect = await readFile(resolve(outputRoot, "legacy-stock-redirect.js"), "utf8");
if (!legacyRedirect.includes("static-stock-pages.json") || !legacyRedirect.includes("location.replace")) errors.push("legacy stock redirect logic missing");
const sitemap = await readFile(resolve(outputRoot, "sitemap.xml"), "utf8");
for (const required of ["/stocks/nvda/", `/briefings/${briefingDirs.at(-1)}/`, `/briefings/weeks/${weeklyBriefingDirs.at(-1)}/`]) if (!sitemap.includes(required)) errors.push(`사이트맵 URL 누락: ${required}`);
for (const date of briefingDirs) {
  const snapshot = JSON.parse(await readFile(resolve(outputRoot, "replay_data", "snapshots", `${date}.json`), "utf8"));
  const generatedDate = String(snapshot.generated_at || snapshot.source_updated_at || date).slice(0, 10);
  const expectedLastmod = /^\d{4}-\d{2}-\d{2}$/.test(generatedDate) ? generatedDate : date;
  const entry = `<loc>https://www.bvtmoneyflow.xyz/briefings/${date}/</loc><lastmod>${expectedLastmod}</lastmod>`;
  if (!sitemap.includes(entry)) errors.push(`브리핑 lastmod 불일치: ${date}`);
}
const marketData = JSON.parse(await readFile(resolve(outputRoot, "data.json"), "utf8"));
const latestDataDate = String(marketData.updated ?? "").match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? marketData.market_date;
for (const path of ["/", "/today/", "/insider/", "/stocks/nvda/"]) {
  const entry = `<loc>https://www.bvtmoneyflow.xyz${path}</loc><lastmod>${latestDataDate}</lastmod>`;
  if (!sitemap.includes(entry)) errors.push(`latest data lastmod mismatch: ${path}`);
}
const home = await readFile(resolve(outputRoot, "index.html"), "utf8");
for (const required of [
  "BVT Money Flow",
  "미국 주식의 돈이 어디로 움직였는지 데이터로 읽어드립니다.",
  'rel="canonical" href="https://www.bvtmoneyflow.xyz/"',
  'href="/favicon-symbol.png"',
  'content="https://www.bvtmoneyflow.xyz/og-bvt-money-flow.png"',
]) if (!home.includes(required)) errors.push(`home brand/SEO missing: ${required}`);
if (home.includes("BVT Replay")) errors.push("legacy BVT Replay brand remains on home");
const robots = await readFile(resolve(outputRoot, "robots.txt"), "utf8");
if (robots !== "User-agent: *\nAllow: /\nSitemap: https://www.bvtmoneyflow.xyz/sitemap.xml\n") errors.push("robots.txt mismatch");
for (const slug of stockDirs) {
  const html = await readFile(resolve(outputRoot, "stocks", slug, "index.html"), "utf8");
  for (const match of html.matchAll(/href="(\/stocks\/[^"#?]+\/)"/g)) {
    const target = resolve(outputRoot, match[1].replace(/^\//, ""), "index.html");
    try { if (!(await stat(target)).isFile()) errors.push(`깨진 내부 링크: ${match[1]}`); } catch { errors.push(`깨진 내부 링크: ${match[1]}`); }
  }
}
for (const required of ["data.json", "history.json", "data-status.json", "_headers", "CNAME", ".nojekyll", "replay_data/manifest.json", "favicon-symbol.png", "og-bvt-money-flow.png"]) {
  try { await stat(resolve(outputRoot, required)); } catch { errors.push(`배포 데이터 누락: ${required}`); }
}
const pngDimensions = async (name) => {
  const bytes = await readFile(resolve(outputRoot, name));
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
};
if (String(await pngDimensions("og-bvt-money-flow.png")) !== "1200,630") errors.push("OG image must be 1200x630");
const faviconDimensions = await pngDimensions("favicon-symbol.png");
if (faviconDimensions[0] !== faviconDimensions[1]) errors.push("favicon symbol must be square");
const headers = await readFile(resolve(outputRoot, "_headers"), "utf8");
for (const required of ["Content-Security-Policy", "frame-ancestors 'none'", "X-Content-Type-Options: nosniff", "Referrer-Policy: same-origin", "Permissions-Policy:", "max-age=31536000, immutable"]) {
  if (!headers.includes(required)) errors.push(`security headers missing: ${required}`);
}
if (/Strict-Transport-Security\s*:/i.test(headers)) errors.push("HSTS must remain disabled until every production hostname is verified");
if (/script-src[^;]*'unsafe-inline'/.test(headers)) errors.push("script-src must not allow unsafe-inline scripts");
const dataStatus = JSON.parse(await readFile(resolve(outputRoot, "data-status.json"), "utf8"));
if (dataStatus.status !== "ok") errors.push("data-status.json is not healthy");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify({ validatedStockPages: stockDirs.length, validatedBriefingPages: briefingDirs.length, validatedWeeklyBriefingPages: weeklyBriefingDirs.length, representativeStocks: ["nvda", "aapl", "msft", "brk-b"] }));
