import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..", "..");
const outputFile = resolve(
  import.meta.dirname,
  "..",
  "dist",
  "data-status.json",
);
const sourceFiles = {
  market: "data.json",
  history: "history.json",
  insider: "insider/data/insider.json",
  lockup: "ipo-lockup/data/lockup.json",
  earnings: "earnings.json",
  economic: "economic_events.json",
  news: "news.json",
  weekly: "weekly_summary.json",
  stockDirectory: "stock_directory.json",
  replayManifest: "replay_data/manifest.json",
};

function observedHoliday(year, month, day) {
  const date = new Date(Date.UTC(year, month, day));
  if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
function nthWeekday(year, month, weekday, nth) {
  const date = new Date(Date.UTC(year, month, 1));
  date.setUTCDate(1 + ((7 + weekday - date.getUTCDay()) % 7) + (nth - 1) * 7);
  return date.toISOString().slice(0, 10);
}
function lastWeekday(year, month, weekday) {
  const date = new Date(Date.UTC(year, month + 1, 0));
  date.setUTCDate(date.getUTCDate() - ((7 + date.getUTCDay() - weekday) % 7));
  return date.toISOString().slice(0, 10);
}
function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(
    Date.UTC(
      year,
      Math.floor((h + l - 7 * m + 114) / 31) - 1,
      ((h + l - 7 * m + 114) % 31) + 1,
    ),
  );
}
function isUsTradingDay(date) {
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) return false;
  const year = date.getUTCFullYear();
  const goodFriday = easterSunday(year);
  goodFriday.setUTCDate(goodFriday.getUTCDate() - 2);
  return !new Set([
    observedHoliday(year, 0, 1),
    nthWeekday(year, 0, 1, 3),
    nthWeekday(year, 1, 1, 3),
    goodFriday.toISOString().slice(0, 10),
    lastWeekday(year, 4, 1),
    observedHoliday(year, 5, 19),
    observedHoliday(year, 6, 4),
    nthWeekday(year, 8, 1, 1),
    nthWeekday(year, 10, 4, 4),
    observedHoliday(year, 11, 25),
  ]).has(date.toISOString().slice(0, 10));
}
function completedTradingDaysBehind(marketDate, current = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(marketDate ?? ""))) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(current);
  const part = (type) => parts.find((item) => item.type === type)?.value ?? "";
  const latest = new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00Z`,
  );
  const moveBack = () => {
    do latest.setUTCDate(latest.getUTCDate() - 1);
    while (!isUsTradingDay(latest));
  };
  if (!isUsTradingDay(latest) || Number(part("hour")) < 17) moveBack();
  let count = 0;
  for (const cursor = new Date(`${marketDate}T00:00:00Z`); cursor < latest;) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (isUsTradingDay(cursor)) count += 1;
  }
  return count;
}

const errors = [];
const sources = {};
const jsonBySource = {};
const now = Date.now();
const generousSources = new Set(["economic", "weekly", "stockDirectory"]);
for (const [id, relativePath] of Object.entries(sourceFiles)) {
  try {
    const raw = await readFile(resolve(projectRoot, relativePath), "utf8");
    const data = JSON.parse(raw);
    jsonBySource[id] = data;
    const updatedAt =
      data.updated ??
      data.market_date ??
      data.generatedAt ??
      data.updated_at ??
      data.meta?.updated ??
      data.meta?.generatedAt ??
      data.meta?.validatedAt ??
      null;
    const timestamp = updatedAt ? Date.parse(updatedAt) : Number.NaN;
    const maxAgeMs = (generousSources.has(id) ? 8 * 24 : 72) * 60 * 60 * 1000;
    const freshness = !Number.isFinite(timestamp)
      ? "unknown"
      : now - timestamp > maxAgeMs
        ? "delayed"
        : "normal";
    sources[id] = {
      path: relativePath,
      updatedAt,
      freshness,
      sha256: createHash("sha256").update(raw).digest("hex"),
    };
  } catch (error) {
    errors.push(
      `${relativePath}: ${error instanceof Error ? error.name : "read error"}`,
    );
  }
}

const market = jsonBySource.market;
const history = jsonBySource.history;
const replay = jsonBySource.replayManifest;
if (!/^\d{4}-\d{2}-\d{2}$/.test(String(market?.market_date ?? "")))
  errors.push("data.json: invalid market_date");
if (!Array.isArray(market?.stocks) || market.stocks.length === 0)
  errors.push("data.json: stocks is empty");
if (Number(market?.count) !== market?.stocks?.length)
  errors.push("data.json: count does not match stocks length");
const tickers = (market?.stocks ?? []).map((row) => row?.t);
if (tickers.some((ticker) => !/^[A-Z0-9.-]{1,16}$/.test(String(ticker ?? ""))))
  errors.push("data.json: invalid ticker");
if (new Set(tickers).size !== tickers.length)
  errors.push("data.json: duplicate ticker");
for (const row of market?.stocks ?? []) {
  if (![row.c, row.pc, row.dv, row.mc].every(Number.isFinite)) {
    errors.push(`data.json: non-finite market value for ${row.t ?? "unknown"}`);
    break;
  }
  const references = [row.dvp, row.a5, row.a20, row.a60];
  if (references.some((value) => value != null && !Number.isFinite(value))) {
    errors.push(`data.json: invalid reference value for ${row.t ?? "unknown"}`);
    break;
  }
  if (
    [
      row.c,
      row.dv,
      row.mc,
      ...references.filter((value) => value != null),
    ].some((value) => value < 0)
  ) {
    errors.push(`data.json: negative market value for ${row.t ?? "unknown"}`);
    break;
  }
}
const validOrderedDates = (dates) =>
  Array.isArray(dates) &&
  dates.length > 0 &&
  dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(String(date))) &&
  new Set(dates).size === dates.length &&
  dates.every((date, index) => index === 0 || dates[index - 1] < date);
if (!validOrderedDates(history?.dates))
  errors.push("history.json: dates must be unique and ascending");
if (!validOrderedDates(replay?.dates))
  errors.push("replay manifest: dates must be unique and ascending");
for (const group of [
  "sector",
  "industry",
  "universe",
  "custom",
  "cap",
  "stocks",
]) {
  for (const [name, values] of Object.entries(history?.[group] ?? {})) {
    if (
      !Array.isArray(values) ||
      values.length !== history.dates.length ||
      values.some((value) => !Number.isFinite(value))
    ) {
      errors.push(`history.json: invalid ${group} series ${name}`);
      break;
    }
  }
}
if (history?.dates?.at(-1) !== market?.market_date)
  errors.push("history.json: last date differs from market_date");
if (replay?.last_date !== market?.market_date)
  errors.push("replay manifest: last_date differs from market_date");
if (Number(replay?.snapshot_count) !== replay?.dates?.length)
  errors.push("replay manifest: snapshot count mismatch");
const marketLag = completedTradingDaysBehind(market?.market_date);
if (sources.market && marketLag !== null) {
  sources.market.tradingDaysBehind = marketLag;
  sources.market.freshness = marketLag > 0 ? "delayed" : "normal";
}
if (sources.replayManifest && marketLag !== null) {
  sources.replayManifest.tradingDaysBehind = marketLag;
  sources.replayManifest.freshness =
    marketLag > 0 ? "delayed" : sources.replayManifest.freshness;
}

const status = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  status: errors.length ? "invalid" : "ok",
  freshness: Object.values(sources).some(
    (source) => source.freshness === "delayed",
  )
    ? "delayed"
    : Object.values(sources).some((source) => source.freshness === "unknown")
      ? "unknown"
      : "normal",
  delayedSources: Object.entries(sources)
    .filter(([, source]) => source.freshness === "delayed")
    .map(([id]) => id),
  unknownFreshnessSources: Object.entries(sources)
    .filter(([, source]) => source.freshness === "unknown")
    .map(([id]) => id),
  marketDate: market?.market_date ?? null,
  lastGood: {
    marketDate: market?.market_date ?? null,
    marketSha256: sources.market?.sha256 ?? null,
    replayLastDate: replay?.last_date ?? null,
  },
  sources,
  checks: {
    sourceCount: Object.keys(sources).length,
    stockCount: market?.stocks?.length ?? 0,
    historyLastDate: history?.dates?.at(-1) ?? null,
    replaySnapshotCount: replay?.dates?.length ?? 0,
  },
};
await mkdir(dirname(outputFile), { recursive: true });
await writeFile(outputFile, `${JSON.stringify(status, null, 2)}\n`, "utf8");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  JSON.stringify({
    dataStatus: status.status,
    freshness: status.freshness,
    delayedSources: status.delayedSources,
    marketDate: status.marketDate,
    sources: status.checks.sourceCount,
  }),
);
