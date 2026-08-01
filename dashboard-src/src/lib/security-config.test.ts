import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..", "..");

describe("security and privacy configuration", () => {
  it("defines required edge headers without prematurely enabling HSTS", async () => {
    const headers = await readFile(resolve(root, "public", "_headers"), "utf8");
    for (const value of [
      "Content-Security-Policy:",
      "frame-ancestors 'none'",
      "X-Content-Type-Options: nosniff",
      "Referrer-Policy: same-origin",
      "Permissions-Policy:",
      "Cache-Control: public, max-age=31536000, immutable",
    ]) {
      expect(headers).toContain(value);
    }
    expect(headers).not.toMatch(/Strict-Transport-Security\s*:/i);
    expect(headers).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("provides GitHub Pages-compatible browser policy fallbacks", async () => {
    const html = await readFile(resolve(root, "index.html"), "utf8");
    expect(html).toContain('name="referrer" content="same-origin"');
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain("object-src 'none'");
    expect(html).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  });

  it("keeps the privacy policy aligned with disabled, minimized telemetry", async () => {
    const policy = await readFile(
      resolve(root, "src", "routes", "privacy-policy.tsx"),
      "utf8",
    );
    for (const statement of [
      "기본적으로 꺼져 있습니다",
      "검색어",
      "이메일",
      "업로드 파일명·내용",
      "오류 메시지·스택",
      "Global Privacy Control",
      "Do Not Track",
    ]) {
      expect(policy).toContain(statement);
    }
    const env = await readFile(resolve(root, ".env.example"), "utf8");
    expect(env).toContain("VITE_TELEMETRY_ENABLED=false");
    expect(env).toContain("VITE_TELEMETRY_ENDPOINT=");
  });
});
