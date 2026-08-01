import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const outputRoot = resolve(import.meta.dirname, "..", "dist");
const siteUrl = "https://www.bvtmoneyflow.xyz";
const ogImage = `${siteUrl}/og-bvt-money-flow.png`;
const alwaysInclude = new Set([
  "NVDA", "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "META", "TSLA",
  "AMD", "AVGO", "NFLX", "JPM", "V", "MA", "BRK-B", "LLY", "XOM",
  "UNH", "COST", "WMT", "MU", "INTC", "ORCL", "CRM",
]);

const escapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");
const number = (value, digits = 0) => Number(value ?? 0).toLocaleString("ko-KR", {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
});
const money = (value) => {
  const amount = Number(value ?? 0);
  return amount >= 1e12 ? `$${number(amount / 1e12, 2)}T` : `$${number(amount / 1e9, 1)}B`;
};
const previousValue = (current, changePercent) =>
  Number.isFinite(Number(changePercent)) && Number(changePercent) > -100
    ? Number(current) / (1 + Number(changePercent) / 100)
    : null;
const sectorNames = {
  Technology: "테크놀로지", Industrials: "산업재", "Financial Services": "금융",
  "Consumer Cyclical": "임의 소비재", Healthcare: "헬스케어",
  "Communication Services": "커뮤니케이션 서비스", "Consumer Defensive": "필수 소비재",
  Energy: "에너지", "Basic Materials": "소재", "Real Estate": "부동산", Utilities: "유틸리티",
};
function dailyBriefingCopy(snapshot) {
  const market = snapshot.market ?? {};
  const total = Number(market.total_dollar_volume ?? 0);
  const change = Number.isFinite(Number(market.dollar_volume_change_1d)) ? Number(market.dollar_volume_change_1d) : null;
  const advancing = Number(market.advancing_stocks ?? 0);
  const declining = Number(market.declining_stocks ?? 0);
  const advancingShare = advancing + declining ? advancing / (advancing + declining) * 100 : null;
  const activity = change == null
    ? "전일 비교 자료가 부족했고"
    : change >= 5
      ? `전일 대비 ${Math.abs(change).toFixed(1)}% 증가했고`
      : change <= -5
        ? `전일 대비 ${Math.abs(change).toFixed(1)}% 감소했고`
        : `전일 대비 ${change > 0 ? "+" : ""}${change.toFixed(1)}%로 비슷했고`;
  const breadth = advancingShare == null
    ? "상승·하락 종목 비교 자료는 부족했습니다"
    : advancingShare >= 55
      ? `상승 종목 비중은 ${advancingShare.toFixed(1)}%로 상승 종목이 우세했습니다`
      : advancingShare <= 45
        ? `상승 종목 비중은 ${advancingShare.toFixed(1)}%로 하락 종목이 우세했습니다`
        : `상승 종목 비중은 ${advancingShare.toFixed(1)}%로 혼조였습니다`;
  const marketSentence = `전체 거래대금은 ${money(total)}로 ${activity} ${breadth}.`;
  const rawSectors = Object.entries(snapshot.groups?.sector ?? {});
  const previousTotal = rawSectors.reduce((sum, [, row]) => sum + (previousValue(row.dollar_volume ?? 0, row.dollar_volume_change_1d) ?? 0), 0);
  const sectors = rawSectors.flatMap(([id, row]) => {
    const current = Number(row.dollar_volume ?? 0);
    const previous = previousValue(current, row.dollar_volume_change_1d);
    if (!total || !previousTotal || previous == null) return [];
    return [{ id, name: sectorNames[id] ?? id, share: current / total * 100, changeBp: (current / total - previous / previousTotal) * 10000 }];
  }).sort((a, b) => b.changeBp - a.changeBp || a.id.localeCompare(b.id));
  const expanded = sectors.find((row) => row.changeBp >= 10);
  const contracted = [...sectors].reverse().find((row) => row.changeBp <= -10);
  const sectorSentence = expanded || contracted
    ? `섹터 거래대금 점유율은 ${[
        expanded ? `${expanded.name}가 ${Math.round(expanded.changeBp)}bp 확대` : "",
        contracted ? `${contracted.name}가 ${Math.abs(Math.round(contracted.changeBp))}bp 축소` : "",
      ].filter(Boolean).join("되고 ")}됐습니다.`
    : "전일 대비 10bp 이상 변한 섹터 거래대금 점유율은 없었습니다.";
  return { marketSentence, sectorSentence, sectors, advancingShare };
}
const slugForTicker = (ticker) => String(ticker).trim().toLowerCase();

function stripRouteHead(html) {
  return html
    .replace(/\s*<title[^>]*>[\s\S]*?<\/title>/gi, "")
    .replace(/\s*<meta\s+name="description"[^>]*>/gi, "")
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(/\s*<meta\s+property="og:(?:title|description|url)"[^>]*>/gi, "")
    .replace(/\s*<meta\s+name="twitter:(?:title|description)"[^>]*>/gi, "")
    .replace(/\s*<script\s+type="application\/ld\+json"[^>]*>[\s\S]*?<\/script>/gi, "");
}

function withPage(html, { title, description, canonical, body, schema, redirectScript = "" }) {
  const clean = stripRouteHead(html);
  const jsonLd = JSON.stringify(schema).replaceAll("<", "\\u003c");
  const head = `
    <title data-route-head>${escapeHtml(title)}</title>
    <meta data-route-head name="description" content="${escapeHtml(description)}" />
    <link data-route-head rel="canonical" href="${escapeHtml(canonical)}" />
    <meta data-route-head property="og:title" content="${escapeHtml(title)}" />
    <meta data-route-head property="og:description" content="${escapeHtml(description)}" />
    <meta data-route-head property="og:url" content="${escapeHtml(canonical)}" />
    <meta data-route-head name="twitter:title" content="${escapeHtml(title)}" />
    <meta data-route-head name="twitter:description" content="${escapeHtml(description)}" />
    <script data-route-head type="application/ld+json">${jsonLd}</script>${redirectScript}`;
  return clean
    .replace("</head>", `${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
}

async function write(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, contents, "utf8");
}

const data = JSON.parse(await readFile(resolve(projectRoot, "data.json"), "utf8"));
const baseHtml = await readFile(resolve(outputRoot, "index.html"), "utf8");
const marketDate = data.market_date;
const candidates = data.stocks
  .filter((stock) => Number(stock.mc ?? 0) >= 50_000_000_000 || alwaysInclude.has(stock.t))
  .sort((a, b) => Number(b.mc ?? 0) - Number(a.mc ?? 0))
  .slice(0, 300);
if (!/^\d{4}-\d{2}-\d{2}$/.test(marketDate)) throw new Error(`Invalid market_date: ${marketDate}`);
for (const stock of candidates) {
  if (!/^[A-Z0-9-]{1,12}$/.test(String(stock.t ?? ""))) throw new Error(`Unsafe ticker for static path: ${stock.t}`);
}
const selectedSlugs = candidates.map((stock) => slugForTicker(stock.t));
if (new Set(selectedSlugs).size !== selectedSlugs.length) throw new Error("Duplicate static stock slug");
const selectedTickers = new Set(candidates.map((stock) => stock.t));
const gitLastmod = (path) => {
  try {
    return execFileSync("git", ["log", "-1", "--format=%cs", "--", path], {
      cwd: projectRoot,
      encoding: "utf8",
    }).trim() || null;
  } catch {
    return null;
  }
};

for (const stock of candidates) {
  const ticker = stock.t;
  const slug = slugForTicker(ticker);
  const name = stock.nko || stock.n || ticker;
  const canonical = `${siteUrl}/stocks/${slug}/`;
  const title = `${name}(${ticker}) 주가·거래대금 분석 | BVT Money Flow`;
  const description = `${marketDate} 기준 ${name}(${ticker})의 주가, 거래대금 변화, 시가총액과 ${stock.sec || "미국 주식"} 섹터 흐름을 확인합니다.`;
  const related = data.stocks
    .filter((row) => row.t !== ticker && row.sec === stock.sec && selectedTickers.has(row.t))
    .sort((a, b) => Number(b.dv ?? 0) - Number(a.dv ?? 0))
    .slice(0, 5);
  const body = `
    <main class="mx-auto max-w-4xl px-4 py-10" data-static-page="stock">
      <nav aria-label="경로" class="text-sm"><a href="/">시장 흐름</a> / <a href="/scanner/">종목 스캐너</a> / ${escapeHtml(ticker)}</nav>
      <header class="mt-6"><p class="font-mono text-sm font-bold">${escapeHtml(ticker)}</p><h1 class="mt-2 text-3xl font-bold">${escapeHtml(name)}(${escapeHtml(ticker)}) 주가·거래대금 분석</h1><p class="mt-3 text-base">${escapeHtml(description)}</p></header>
      <section class="mt-8"><h2 class="text-xl font-bold">핵심 지표</h2><dl class="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><div><dt>기준일</dt><dd>${marketDate}</dd></div><div><dt>종가</dt><dd>$${number(stock.c, 2)}</dd></div><div><dt>등락률</dt><dd>${number(stock.pc, 2)}%</dd></div><div><dt>거래대금</dt><dd>${money(stock.dv)}</dd></div><div><dt>20일 평균 대비</dt><dd>${number(stock.a20 ? (stock.dv / stock.a20 - 1) * 100 : 0, 1)}%</dd></div><div><dt>시가총액</dt><dd>${money(stock.mc)}</dd></div></dl></section>
      <section class="mt-8"><h2 class="text-xl font-bold">시장 내 위치</h2><p class="mt-2">${escapeHtml(stock.sec || "미분류")} 섹터의 ${escapeHtml(stock.ind || "산업 미분류")} 산업에 속합니다. 거래대금은 매수와 매도를 함께 포함하므로 가격 방향과 함께 해석해야 합니다.</p></section>
      <section class="mt-8"><h2 class="text-xl font-bold">관련 주요 종목</h2><ul>${related.map((row) => `<li><a href="/stocks/${slugForTicker(row.t)}/">${escapeHtml(row.nko || row.n || row.t)}(${escapeHtml(row.t)})</a></li>`).join("")}</ul></section>
      <p class="mt-8 text-sm">이 페이지는 정보 제공 목적이며 투자 권유가 아닙니다. 최신 대화형 차트와 이벤트 정보는 JavaScript 실행 후 확인할 수 있습니다.</p>
    </main>`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: title, description, url: canonical, inLanguage: "ko-KR", dateModified: marketDate },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "종목", item: `${siteUrl}/scanner/` },
        { "@type": "ListItem", position: 3, name: ticker, item: canonical },
      ] },
    ],
  };
  await write(resolve(outputRoot, "stocks", slug, "index.html"), withPage(baseHtml, { title, description, canonical, body, schema }));
}

const snapshotRoot = resolve(projectRoot, "replay_data", "snapshots");
const snapshotFiles = (await readdir(snapshotRoot)).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort();
const briefingEntries = [];
for (const filename of snapshotFiles) {
  const snapshot = JSON.parse(await readFile(resolve(snapshotRoot, filename), "utf8"));
  const date = filename.replace(".json", "");
  if (snapshot.trading_date !== date) throw new Error(`Snapshot date mismatch: ${filename}`);
  const generatedDate = String(snapshot.generated_at || snapshot.source_updated_at || date).slice(0, 10);
  const lastmod = /^\d{4}-\d{2}-\d{2}$/.test(generatedDate) ? generatedDate : date;
  briefingEntries.push({ date, lastmod });
  const canonical = `${siteUrl}/briefings/${date}/`;
  const title = `${date} 미국 주식 시장 브리핑 | BVT Money Flow`;
  const market = snapshot.market ?? {};
  const briefingCopy = dailyBriefingCopy(snapshot);
  const description = `${date} 미국 시장. ${briefingCopy.marketSentence} ${briefingCopy.sectorSentence}`;
  const body = `
    <main class="mx-auto max-w-3xl px-4 py-10" data-static-page="briefing">
      <nav aria-label="경로"><a href="/">홈</a> / <a href="/today/">오늘의 시장</a> / ${date}</nav>
      <header class="mt-6"><p class="text-sm font-bold">날짜별 시장 기록</p><h1 class="mt-2 text-3xl font-bold">${date} 미국 주식 시장 브리핑</h1><p class="mt-3">데이터 기준일 ${date}</p></header>
      <section class="mt-8"><h2 class="text-xl font-bold">시장 요약</h2><p>${escapeHtml(briefingCopy.marketSentence)}</p><p>${escapeHtml(briefingCopy.sectorSentence)}</p><ul><li>전체 거래대금: ${money(market.total_dollar_volume)}</li><li>상승 종목: ${number(market.advancing_stocks)}개</li><li>하락 종목: ${number(market.declining_stocks)}개</li></ul></section>
      <section class="mt-8"><h2 class="text-xl font-bold">섹터 거래대금 점유율 변화</h2><ol>${[...briefingCopy.sectors.slice(0, 2), ...briefingCopy.sectors.slice(-2)].map((row) => `<li>${escapeHtml(row.name)} · 점유율 ${number(row.share, 1)}% · ${row.changeBp > 0 ? "+" : ""}${number(row.changeBp)}bp</li>`).join("")}</ol></section>
      <p class="mt-8 text-sm">거래대금은 매수와 매도를 함께 포함하며 실제 순매수나 자금 유입을 뜻하지 않습니다. 공개 시장 데이터 요약이며 투자 권유가 아닙니다.</p>
    </main>`;
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article", headline: title, description, image: ogImage, url: canonical, mainEntityOfPage: canonical, datePublished: date, dateModified: lastmod, author: { "@type": "Organization", name: "BVT Money Flow" }, publisher: { "@type": "Organization", name: "BVT Money Flow" } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "홈", item: `${siteUrl}/` },
        { "@type": "ListItem", position: 2, name: "오늘의 시장", item: `${siteUrl}/today/` },
        { "@type": "ListItem", position: 3, name: date, item: canonical },
      ] },
    ],
  };
  await write(resolve(outputRoot, "briefings", date, "index.html"), withPage(baseHtml, { title, description, canonical, body, schema }));
}

const weeklyPayload = JSON.parse(await readFile(resolve(projectRoot, "weekly_summary.json"), "utf8"));
const weeklyEntries = [];
for (const week of weeklyPayload.weeks ?? []) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week.weekId)) throw new Error(`Invalid weekId: ${week.weekId}`);
  const canonical = `${siteUrl}/briefings/weeks/${week.weekId}/`;
  const title = `${week.label} 미국 시장 브리핑 | BVT Money Flow`;
  const gainers = (week.sectorGainers ?? []).filter((row) => Number(row.changeBp) >= 10).slice(0, 2);
  const losers = (week.sectorLosers ?? []).filter((row) => Number(row.changeBp) <= -10).slice(0, 2);
  const breadth = Number.isFinite(Number(week.market?.advancingShare))
    ? `상승 종목 비중은 ${number(week.market.advancingShare, 1)}%였습니다.`
    : "상승·하락 종목 비교 자료는 부족했습니다.";
  const marketSentence = `주간 일평균 거래대금은 ${money(week.market?.averageDollarVolume)}였고, ${breadth}`;
  const gainText = gainers.map((row) => `${row.name} ${number(row.changeBp)}bp`).join(" · ");
  const lossText = losers.map((row) => `${row.name} ${number(Math.abs(row.changeBp))}bp`).join(" · ");
  const sectorSentence = gainers.length && losers.length
    ? `직전 주 마지막 거래일 대비 섹터 점유율은 ${gainText} 확대됐고, ${lossText} 축소됐습니다.`
    : gainers.length
      ? `직전 주 마지막 거래일 대비 섹터 점유율은 ${gainText} 확대됐으며, 10bp 이상 축소된 섹터는 없었습니다.`
      : losers.length
        ? `직전 주 마지막 거래일 대비 10bp 이상 확대된 섹터는 없었고, ${lossText} 축소됐습니다.`
        : "직전 주 마지막 거래일 대비 10bp 이상 확대되거나 축소된 섹터는 없었습니다.";
  const description = `${week.startDate}~${week.endDate} 미국 시장. ${marketSentence} ${sectorSentence}`;
  const body = `<main class="mx-auto max-w-3xl px-4 py-10" data-static-page="weekly-briefing"><nav aria-label="경로"><a href="/">홈</a> / <a href="/today/">오늘의 시장</a> / 주간</nav><header class="mt-6"><p class="text-sm font-bold">주간 시장 기록</p><h1 class="mt-2 text-3xl font-bold">${escapeHtml(week.startDate)} ~ ${escapeHtml(week.endDate)}</h1><p>데이터 기준일 ${escapeHtml(week.endDate)} · ${number(week.tradingDays)}거래일 집계 · ${week.status === "complete" ? "주간 확정" : "진행 중"}</p><p>보관된 장 마감 데이터를 같은 계산 기준으로 비교했습니다.</p></header><section class="mt-8"><h2 class="text-xl font-bold">주간 요약</h2><p>${escapeHtml(marketSentence)}</p><p>${escapeHtml(sectorSentence)}</p></section><p class="mt-8 text-sm">거래대금은 매수와 매도를 함께 포함하며 실제 순매수나 자금 유입을 뜻하지 않습니다. 공개 시장 데이터 요약이며 투자 권유가 아닙니다.</p></main>`;
  const schema = { "@context": "https://schema.org", "@type": "Article", headline: title, description, image: ogImage, url: canonical, mainEntityOfPage: canonical, datePublished: week.endDate, dateModified: week.endDate, author: { "@type": "Organization", name: "BVT Money Flow" }, publisher: { "@type": "Organization", name: "BVT Money Flow" } };
  await write(resolve(outputRoot, "briefings", "weeks", week.weekId, "index.html"), withPage(baseHtml, { title, description, canonical, body, schema }));
  weeklyEntries.push({ weekId: week.weekId, lastmod: week.endDate });
}

await write(resolve(outputRoot, "static-stock-pages.json"), JSON.stringify(candidates.map((stock) => slugForTicker(stock.t))));
const legacyPath = resolve(outputRoot, "stock", "index.html");
const legacy = await readFile(legacyPath, "utf8");
const redirectScript = `\n    <script type="module" src="/legacy-stock-redirect.js"></script>`;
await write(legacyPath, legacy.replace("</head>", `${redirectScript}\n  </head>`));

const staticUrls = ["/", "/scanner/", "/today/", "/replay/", "/insider/", "/ipo-lockup/", "/methodology/", "/disclaimer/", "/privacy-policy/"];
const staticLastmod = {
  "/methodology/": gitLastmod("dashboard-src/src/routes/methodology.tsx"),
  "/disclaimer/": gitLastmod("dashboard-src/src/routes/disclaimer.tsx"),
  "/privacy-policy/": gitLastmod("dashboard-src/src/routes/privacy-policy.tsx"),
};
const urls = [
  ...staticUrls.map((path) => ({ path, lastmod: staticLastmod[path] ?? marketDate })),
  ...candidates.map((stock) => ({ path: `/stocks/${slugForTicker(stock.t)}/`, lastmod: marketDate })),
  ...briefingEntries.map(({ date, lastmod }) => ({ path: `/briefings/${date}/`, lastmod })),
  ...weeklyEntries.map(({ weekId, lastmod }) => ({ path: `/briefings/weeks/${weekId}/`, lastmod })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(({ path, lastmod }) => `  <url><loc>${siteUrl}${path}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`).join("\n")}\n</urlset>\n`;
const robots = `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`;
await write(resolve(outputRoot, "sitemap.xml"), sitemap);
await write(resolve(outputRoot, "robots.txt"), robots);
await write(resolve(projectRoot, "sitemap.xml"), sitemap);
await write(resolve(projectRoot, "robots.txt"), robots);

const publicFiles = [
  "CNAME", ".nojekyll", "data.json", "history.json", "sector_map.json",
  "stock_directory.json", "earnings.json", "news.json", "economic_events.json",
  "weekly_summary.json", "custom_groups.json", "og.png", "og-bvt-money-flow.png",
];
for (const name of publicFiles) {
  await cp(resolve(projectRoot, name), resolve(outputRoot, name), { force: true });
}
for (const name of ["insider/data", "ipo-lockup/data", "replay_data"]) {
  await cp(resolve(projectRoot, name), resolve(outputRoot, name), { recursive: true, force: true });
}

console.log(JSON.stringify({ stockPages: candidates.length, briefingPages: snapshotFiles.length, weeklyBriefingPages: weeklyEntries.length, totalSitemapUrls: urls.length, marketDate }));
