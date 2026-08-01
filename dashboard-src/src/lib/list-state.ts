export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [25, 50] as const;

export function parsePositiveInt(
  value: string | null | undefined,
  fallback: number,
) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parsePageSize(value: string | null | undefined) {
  const parsed = parsePositiveInt(value, DEFAULT_PAGE_SIZE);
  return PAGE_SIZE_OPTIONS.includes(
    parsed as (typeof PAGE_SIZE_OPTIONS)[number],
  )
    ? parsed
    : DEFAULT_PAGE_SIZE;
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function clampPage(page: number, total: number, pageSize: number) {
  return Math.min(Math.max(1, page), pageCount(total, pageSize));
}

export function pageSlice<T>(rows: T[], page: number, pageSize: number) {
  const safePage = clampPage(page, rows.length, pageSize);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount: pageCount(rows.length, pageSize),
    start,
    end: Math.min(start + pageSize, rows.length),
    rows: rows.slice(start, start + pageSize),
  };
}

export function pageWindow(current: number, totalPages: number, width = 5) {
  const count = Math.max(1, Math.min(width, totalPages));
  const half = Math.floor(count / 2);
  let start = Math.max(1, current - half);
  const end = Math.min(totalPages, start + count - 1);
  start = Math.max(1, end - count + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

export function pageForResizedPage(
  currentPage: number,
  currentPageSize: number,
  nextPageSize: number,
) {
  const firstVisibleIndex = (Math.max(1, currentPage) - 1) * currentPageSize;
  return Math.floor(firstVisibleIndex / nextPageSize) + 1;
}
