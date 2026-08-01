import { describe, expect, it } from "vitest";
import { normalizeInsiderPayload } from "./hydrate-live-data";


describe("normalizeInsiderPayload", () => {
  it("keeps only fully validated and arithmetically consistent trades in totals", () => {
    const result = normalizeInsiderPayload({
      trades: [
        {
          ticker: "GOOD",
          company: "Good Inc.",
          filer: "Valid Insider",
          role: "CEO",
          txType: "매수",
          shares: 100,
          price: 10,
          value: 1000,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
          qualityStatus: "accepted",
          accession: "0000000001-26-000001",
        },
        {
          ticker: "BAD",
          company: "Bad Inc.",
          filer: "Pending Insider",
          role: "Director",
          txType: "매도",
          shares: 100,
          price: 10,
          value: 1_000_000,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
          qualityStatus: "accepted",
          accession: "0000000002-26-000001",
        },
      ],
      pendingTrades: [
        {
          ticker: "WAIT",
          company: "Wait Inc.",
          filer: "Waiting Insider",
          role: "Officer",
          txType: "매수",
          shares: 50,
          price: 20,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
          qualityStatus: "pending",
          accession: "0000000003-26-000001",
          validationReasons: [{ code: "MARKET_PRICE_EXTREME" }],
        },
      ],
    });

    expect(result.accepted.map((row) => row.ticker)).toEqual(["GOOD"]);
    expect(result.accepted[0].amount).toBe(0.001);
    expect(result.pending.map((row) => row.ticker)).toEqual(["BAD", "WAIT"]);
    expect(result.pending.every((row) => row.amount === 0)).toBe(true);
    expect(result.pending[0].validationReasons).toContain(
      "SHARES_PRICE_VALUE_MISMATCH",
    );
    expect(result.pending[1].validationReasons).toContain(
      "MARKET_PRICE_EXTREME",
    );
  });

  it("treats legacy unvalidated rows as pending", () => {
    const result = normalizeInsiderPayload({
      trades: [
        {
          ticker: "LEGACY",
          company: "Legacy Inc.",
          filer: "Legacy Insider",
          txType: "매수",
          shares: 10,
          price: 5,
          value: 50,
          txDate: "2026-07-01",
          filedDate: "2026-07-02",
        },
      ],
    });

    expect(result.accepted).toHaveLength(0);
    expect(result.pending).toHaveLength(1);
    expect(result.pending[0].validationReasons).toContain(
      "VALIDATION_NOT_CONFIRMED",
    );
  });
});
