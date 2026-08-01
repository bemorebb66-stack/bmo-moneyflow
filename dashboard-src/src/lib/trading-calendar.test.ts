import { describe, expect, it } from "vitest";
import { isTradingDate, previousTradingDate, TRADING_CALENDAR_VERSION } from "./trading-calendar";

describe("XNYS calendar contract", () => {
  it("handles weekends, published holidays and exceptional closures", () => {
    expect(TRADING_CALENDAR_VERSION).toBe("XNYS-regular/2026.2");
    expect(isTradingDate("2026-07-03")).toBe(false);
    expect(isTradingDate("2025-01-09")).toBe(false);
    expect(isTradingDate("2026-07-06")).toBe(true);
    expect(isTradingDate("2027-12-31")).toBe(true);
    expect(previousTradingDate("2026-07-06")).toBe("2026-07-02");
  });
});
