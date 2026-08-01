import { describe, expect, it } from "vitest";
import {
  createTelemetryConfig,
  normalizeRoute,
  safeErrorDescriptor,
  sanitizeTelemetryPayload,
} from "./telemetry";

describe("privacy-safe telemetry", () => {
  it("is disabled without an explicit switch and endpoint", () => {
    expect(createTelemetryConfig({})).toMatchObject({ enabled: false });
    expect(
      createTelemetryConfig({ VITE_TELEMETRY_ENABLED: "true" }),
    ).toMatchObject({ enabled: false });
  });

  it("removes identifiers, searches, e-mails and file content", () => {
    const payload = sanitizeTelemetryPayload(
      "summary_share_click",
      {
        query: "secret search",
        email: "person@example.com",
        filename: "portfolio.xlsx",
        file_content: "account data",
        ticker: "AAPL",
      },
      "/stocks/AAPL?query=secret#row",
    );
    expect(payload).toEqual({
      event: "summary_share_click",
      route: "/stocks/:ticker",
    });
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("example.com");
    expect(JSON.stringify(payload)).not.toContain("xlsx");
  });

  it("normalizes dynamic and unknown paths", () => {
    expect(normalizeRoute("/briefings/2026-08-01/")).toBe("/briefings/:date");
    expect(normalizeRoute("/briefings/weeks/2026-07-27/")).toBe(
      "/briefings/weeks/:weekId",
    );
    expect(normalizeRoute("/private/person@example.com")).toBe("/other");
  });

  it("keeps only privacy-safe briefing and share dimensions", () => {
    expect(
      sanitizeTelemetryPayload(
        "briefing_view",
        {
          period: "daily",
          briefing_status: "complete",
          date_key: "2026-07-29",
          entry_point: "archive",
          has_watchlist_section: true,
          tickers: ["AAPL"],
        },
        "/briefings/2026-07-29/",
      ),
    ).toEqual({
      event: "briefing_view",
      route: "/briefings/:date",
      period: "daily",
      briefing_status: "complete",
      entry_point: "archive",
      has_watchlist_section: true,
      date_key: "2026-07-29",
    });
    expect(
      sanitizeTelemetryPayload("share", {
        method: "web_share",
        result: "cancel",
        period: "weekly",
        briefing_status: "in_progress",
        date_key: "2026-07-27",
        shared_text: "private",
      }),
    ).toEqual({
      event: "share",
      route: "/",
      method: "web_share",
      period: "weekly",
      result: "cancel",
      briefing_status: "in_progress",
      date_key: "2026-07-27",
    });
  });

  it("never includes an error message in its descriptor", () => {
    const privateError = new Error("person@example.com searched for secret");
    privateError.stack =
      "Error: person@example.com\n    at person@example.com (https://www.bvtmoneyflow.xyz/assets/app.js:12:4)";
    const cleanError = new Error("different");
    cleanError.stack =
      "Error: different\n    at anonymous (https://www.bvtmoneyflow.xyz/assets/app.js:12:4)";
    const descriptor = safeErrorDescriptor(privateError);
    expect(descriptor.error_kind).toBe("Error");
    expect(descriptor).toEqual(safeErrorDescriptor(cleanError));
    expect(JSON.stringify(descriptor)).not.toContain("person@example.com");
    expect(JSON.stringify(descriptor)).not.toContain("secret");
  });

  it("drops unknown events and fields", () => {
    expect(sanitizeTelemetryPayload("search", { query: "x" })).toBeNull();
    expect(
      sanitizeTelemetryPayload("data_load_result", {
        source: "market",
        result: "success",
        response_body: "private",
      }),
    ).toEqual({
      event: "data_load_result",
      route: "/",
      source: "market",
      result: "success",
    });
  });
});
