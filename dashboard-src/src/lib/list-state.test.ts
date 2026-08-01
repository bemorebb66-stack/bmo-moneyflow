import { describe, expect, it } from "vitest";
import {
  clampPage,
  pageForResizedPage,
  pageSlice,
  pageWindow,
  parsePageSize,
  parsePositiveInt,
} from "./list-state";

describe("list pagination state", () => {
  it("normalizes invalid URL values", () => {
    expect(parsePositiveInt("-2", 1)).toBe(1);
    expect(parsePositiveInt("2abc", 1)).toBe(1);
    expect(parsePositiveInt("1.5", 1)).toBe(1);
    expect(parsePositiveInt("999999999999999999999", 1)).toBe(1);
    expect(parsePositiveInt("3", 1)).toBe(3);
    expect(parsePageSize("100")).toBe(25);
    expect(parsePageSize("50")).toBe(50);
  });

  it("clamps a stale last page after data shrinks", () => {
    expect(clampPage(9, 51, 25)).toBe(3);
    expect(clampPage(4, 0, 25)).toBe(1);
  });

  it("paginates after filtering and sorting", () => {
    const result = pageSlice([1, 2, 3, 4, 5], 2, 2);
    expect(result.rows).toEqual([3, 4]);
    expect(result).toMatchObject({ page: 2, pageCount: 3, start: 2, end: 4 });
  });

  it("keeps the first visible item when page size changes", () => {
    expect(pageForResizedPage(3, 25, 50)).toBe(2);
    expect(pageForResizedPage(2, 50, 25)).toBe(3);
  });

  it("keeps the page control window bounded", () => {
    expect(pageWindow(10, 30)).toEqual([8, 9, 10, 11, 12]);
    expect(pageWindow(1, 2)).toEqual([1, 2]);
  });
});
