export const TRADING_CALENDAR_VERSION = "XNYS-regular/2026.2";

const EXCEPTIONAL_CLOSURES = new Set([
  "2001-09-11", "2001-09-12", "2001-09-13", "2001-09-14",
  "2004-06-11", "2007-01-02", "2012-10-29", "2012-10-30",
  "2018-12-05", "2025-01-09",
]);

const iso = (value: Date) => value.toISOString().slice(0, 10);

function observed(year: number, month: number, day: number) {
  const value = new Date(Date.UTC(year, month - 1, day, 12));
  if (value.getUTCDay() === 6) value.setUTCDate(value.getUTCDate() - 1);
  if (value.getUTCDay() === 0) value.setUTCDate(value.getUTCDate() + 1);
  return iso(value);
}

function newYearHoliday(year: number) {
  const value = new Date(Date.UTC(year, 0, 1, 12));
  if (value.getUTCDay() === 6) return null;
  if (value.getUTCDay() === 0) value.setUTCDate(value.getUTCDate() + 1);
  return iso(value);
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number) {
  const value = new Date(Date.UTC(year, month - 1, 1, 12));
  value.setUTCDate(1 + ((weekday - value.getUTCDay() + 7) % 7) + 7 * (occurrence - 1));
  return iso(value);
}

function lastWeekday(year: number, month: number, weekday: number) {
  const value = new Date(Date.UTC(year, month, 0, 12));
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() - weekday + 7) % 7));
  return iso(value);
}

function easterSunday(year: number) {
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
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function fullHolidays(year: number) {
  const easter = easterSunday(year);
  easter.setUTCDate(easter.getUTCDate() - 2);
  const newYear = newYearHoliday(year);
  return new Set([
    ...(newYear ? [newYear] : []),
    nthWeekday(year, 1, 1, 3),
    nthWeekday(year, 2, 1, 3),
    iso(easter),
    lastWeekday(year, 5, 1),
    ...(year >= 2022 ? [observed(year, 6, 19)] : []),
    observed(year, 7, 4),
    nthWeekday(year, 9, 1, 1),
    nthWeekday(year, 11, 4, 4),
    observed(year, 12, 25),
  ]);
}

export function isTradingDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || iso(parsed) !== date) return false;
  const weekday = parsed.getUTCDay();
  return weekday !== 0 && weekday !== 6 && !fullHolidays(parsed.getUTCFullYear()).has(date) && !EXCEPTIONAL_CLOSURES.has(date);
}

export function previousTradingDate(date: string) {
  const cursor = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(cursor.getTime())) throw new Error("유효한 ISO 날짜가 필요합니다.");
  do cursor.setUTCDate(cursor.getUTCDate() - 1); while (!isTradingDate(iso(cursor)));
  return iso(cursor);
}
