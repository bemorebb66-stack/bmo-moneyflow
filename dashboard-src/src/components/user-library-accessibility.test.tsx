import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SaveStockButton } from "./save-stock-button";
import { SavedScannerControls } from "./saved-scanner-controls";
import { WatchlistView } from "@/routes/watchlist";
import { normalizeScannerCriteria } from "@/lib/user-library";

describe("user library accessibility", () => {
  it("renders an explicit and useful watchlist empty state", () => {
    const html = renderToStaticMarkup(<WatchlistView rows={[]} />);
    expect(html).toContain('aria-labelledby="watchlist-empty-title"');
    expect(html).toContain('id="watchlist-empty-title" tabindex="-1"');
    expect(html).toContain("아직 저장한 관심종목이 없습니다");
    expect(html).toContain("종목 스캐너 열기");
  });

  it("gives the shared stock save button a stateful accessible name", () => {
    const html = renderToStaticMarkup(<SaveStockButton ticker="NVDA" />);
    expect(html).toContain('aria-label="NVDA 관심종목 추가"');
    expect(html).toContain('aria-pressed="false"');
    expect(html.startsWith("<button")).toBe(true);
  });

  it("exposes named buttons for saving and loading scanner conditions", () => {
    const html = renderToStaticMarkup(
      <SavedScannerControls
        criteria={normalizeScannerCriteria(null)}
        onApply={() => undefined}
      />,
    );
    expect(html).toContain('role="group"');
    expect(html).toContain("저장된 스캐너 0개");
    expect(html).toContain("현재 조건 저장");
    expect(html).toContain('aria-label="저장된 스캐너 0개"');
  });
});
