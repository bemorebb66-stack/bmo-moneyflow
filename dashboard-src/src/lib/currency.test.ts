import { afterEach, describe, expect, it } from "vitest";
import { configureCurrency } from "./currency";
import { fmtMcap, fmtMoney, fmtQuote } from "./format";

afterEach(() => configureCurrency("USD", 0));

describe("currency display formatting", () => {
  it("keeps the existing USD units", () => {
    configureCurrency("USD", 1415);
    expect(fmtQuote(100)).toBe("$100.00");
    expect(fmtMoney(1500)).toBe("$1.50B");
    expect(fmtMcap(200)).toBe("$200B");
  });

  it("converts prices, trading value, and market cap with one rate", () => {
    configureCurrency("KRW", 1400);
    expect(fmtQuote(100)).toBe("140,000원");
    expect(fmtMoney(100)).toBe("1,400억원");
    expect(fmtMcap(1)).toBe("1.4조원");
  });
});
