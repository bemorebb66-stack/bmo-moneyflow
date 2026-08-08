import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ROUTE_DATA_SOURCES,
  assessSourceHealth,
  assertValidDataSourcePayload,
  fetchJsonWithPolicy,
  getDataSourceState,
  getSourceUpdatedAt,
  loadDataSourceOnce,
  normalizeDataSourcePayload,
  resetDataRuntimeForTests,
  retryDataSource,
  seedLastGoodForTests,
  sourceRecordCount,
} from "./data-runtime";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  resetDataRuntimeForTests();
});

describe("fetchJsonWithPolicy", () => {
  it("retries retryable server failures and returns the later success", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({}, 502))
      .mockResolvedValueOnce(response({ ok: true }));

    const request = fetchJsonWithPolicy<{ ok: boolean }>("/test.json", {
      retries: 2,
      timeoutMs: 10_000,
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(3_000);

    await expect(request).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-retryable 404 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({}, 404));

    await expect(
      fetchJsonWithPolicy("/missing.json", {
        retries: 2,
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      detail: { kind: "http", status: 404, retryable: false },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("classifies and aborts a timed-out request", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });

    const request = fetchJsonWithPolicy("/slow.json", {
      retries: 0,
      timeoutMs: 50,
      fetchImpl: fetchImpl as typeof fetch,
    });
    const assertion = expect(request).rejects.toMatchObject({
      detail: { kind: "timeout", retryable: true },
    });
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
  });

  it("cancels an obsolete request without retrying", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });

    const request = fetchJsonWithPolicy("/cancel.json", {
      signal: controller.signal,
      retries: 2,
      fetchImpl: fetchImpl as typeof fetch,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({
      detail: { kind: "aborted", retryable: false },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("cancels immediately while waiting to retry", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchImpl = vi.fn().mockRejectedValue(new Error("offline"));
    const request = fetchJsonWithPolicy("/cancel-retry.json", {
      signal: controller.signal,
      retries: 2,
      fetchImpl,
    });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();

    await expect(request).rejects.toMatchObject({
      detail: { kind: "aborted", retryable: false },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe("route source boundaries", () => {
  it("reads nested update timestamps and reports missing timestamps as unknown", () => {
    expect(getSourceUpdatedAt({ meta: { updated: "2026-08-01T00:00:00Z" } })).toBe("2026-08-01T00:00:00Z");
    expect(getSourceUpdatedAt({})).toBeUndefined();
    expect(assessSourceHealth("stockDirectory", {}, undefined)).toBe("unknown");
  });
  it("marks an old economic calendar as delayed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-08T12:00:00Z"));

    expect(
      assessSourceHealth("economic", {}, "2026-07-18T00:00:00Z"),
    ).toBe("delayed");
    expect(
      assessSourceHealth("economic", {}, "2026-08-07T00:00:00Z"),
    ).toBe("normal");
  });
  it("keeps static and replay entry routes free of market requests", () => {
    expect(ROUTE_DATA_SOURCES.static).toEqual([]);
    expect(ROUTE_DATA_SOURCES.replay).toEqual([]);
  });

  it("defines only the required sources for the focused routes", () => {
    expect(ROUTE_DATA_SOURCES.scanner).toEqual(["market"]);
    expect(ROUTE_DATA_SOURCES.home).toEqual(["market", "history"]);
    expect(ROUTE_DATA_SOURCES.today).not.toContain("news");
    expect(ROUTE_DATA_SOURCES.stock).not.toContain("economic");
  });

  it("counts current market companies by canonical ticker", () => {
    const base = {
      n: "Company",
      sec: "Technology",
      c: 10,
      pc: 1,
      dv: 100,
      dvp: 90,
      a5: 90,
      a20: 90,
      a60: 90,
      mc: 1_000,
    };
    expect(
      sourceRecordCount("market", {
        stocks: [{ ...base, t: " be " }, { ...base, t: "BE" }],
      }),
    ).toBe(1);
  });

  it("serves the last good record when a refresh fails", async () => {
    const cached = { weeks: [{ weekId: "2026-W30" }] };
    seedLastGoodForTests("weekly", cached, 1_700_000_000_000);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("offline")),
    );

    const state = await loadDataSourceOnce<typeof cached>("weekly");

    expect(state.data).toEqual(cached);
    expect(getDataSourceState("weekly").health).toBe("delayed");
    expect(getDataSourceState("weekly").phase).toBe("error");
  });

  it("keeps a successful source usable when another source fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string | URL | Request) => {
        const url = String(input);
        return Promise.resolve(
          url.includes("weekly_summary")
            ? response({ weeks: [{ weekId: "2026-W30" }] })
            : response({}, 404),
        );
      }),
    );

    await Promise.all([
      loadDataSourceOnce("weekly"),
      loadDataSourceOnce("replayManifest"),
    ]);

    expect(getDataSourceState("weekly").phase).toBe("success");
    expect(getDataSourceState("weekly").data).toEqual({
      weeks: [{ weekId: "2026-W30" }],
    });
    expect(getDataSourceState("replayManifest").phase).toBe("error");
    expect(getDataSourceState("replayManifest").data).toBeUndefined();
  });

  it("rejects malformed critical payloads instead of replacing last-good data", async () => {
    const cached = {
      market_date: "2026-07-29",
      stocks: [{ ticker: "AAPL" }],
    };
    seedLastGoodForTests("market", cached);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ stocks: [] })));

    const state = await loadDataSourceOnce<typeof cached>("market");

    expect(state.data).toEqual(cached);
    expect(state.phase).toBe("error");
    expect(state.health).toBe("delayed");
    expect(state.error?.kind).toBe("parse");
  });

  it("keeps the latest forced retry result when an older response arrives late", async () => {
    let resolveFirst!: (value: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchImpl = vi
      .fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValueOnce(response({ weeks: [{ weekId: "new" }] }));
    vi.stubGlobal("fetch", fetchImpl);

    const older = retryDataSource("weekly");
    const newer = retryDataSource("weekly");
    await newer;
    resolveFirst(response({ weeks: [{ weekId: "old" }] }));
    await older;

    expect(getDataSourceState("weekly").data).toEqual({
      weeks: [{ weekId: "new" }],
    });
    expect(getDataSourceState("weekly").phase).toBe("success");
  });

  it("validates all source payload shapes without requiring optional feeds to be non-empty", () => {
    expect(() =>
      assertValidDataSourcePayload("insider", {
        trades: [],
        pendingTrades: [],
      }),
    ).not.toThrow();
    expect(() =>
      assertValidDataSourcePayload("history", { dates: [] }),
    ).toThrow(/데이터 구조/);
  });

  it("keeps the current validated operating insider structure intact", async () => {
    const operatingPayload = JSON.parse(
      readFileSync(
        new URL("../../../insider/data/insider.json", import.meta.url),
        "utf8",
      ),
    );
    const qualityReport = JSON.parse(
      readFileSync(
        new URL("../../../insider/data/insider-quality.json", import.meta.url),
        "utf8",
      ),
    );
    expect(operatingPayload.trades.length).toBeGreaterThan(0);
    expect(operatingPayload).toHaveProperty("pendingTrades");
    expect(operatingPayload.trades).toHaveLength(qualityReport.acceptedCount);
    expect(operatingPayload.pendingTrades).toHaveLength(
      qualityReport.pendingCount,
    );
    expect(
      operatingPayload.trades.every(
        (row: { qualityStatus?: string }) => row.qualityStatus === "accepted",
      ),
    ).toBe(true);
    expect(
      operatingPayload.pendingTrades.every(
        (row: { qualityStatus?: string }) => row.qualityStatus === "pending",
      ),
    ).toBe(true);

    const normalized = normalizeDataSourcePayload("insider", operatingPayload);
    expect(normalized).toEqual(operatingPayload);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(operatingPayload)));
    const state = await loadDataSourceOnce<{
      trades: unknown[];
      pendingTrades: unknown[];
    }>("insider");
    expect(state.phase).toBe("success");
    expect(state.data?.trades).toHaveLength(operatingPayload.trades.length);
    expect(state.data?.pendingTrades).toHaveLength(
      operatingPayload.pendingTrades.length,
    );
  });
});
