import { describe, expect, it } from "vitest";
import { formatKstTimestamp, formatMarketDate } from "./date-time";

describe("date-time formatting", () => {
  it("converts a UTC timestamp to an explicitly labelled KST timestamp", () => {
    expect(formatKstTimestamp("2026-07-30 00:34 UTC")).toBe(
      "2026.07.30 09:34 KST",
    );
  });

  it("does not invent a date for missing or invalid input", () => {
    expect(formatKstTimestamp("-")).toBe("확인 중");
    expect(formatKstTimestamp("수집 중")).toBe("수집 중");
  });

  it("labels only valid market dates", () => {
    expect(formatMarketDate("2026-07-30")).toBe("2026.07.30");
    expect(formatMarketDate("-")).toBe("확인 중");
  });
});
