import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-border/70 bg-surface-2/50">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl leading-relaxed">
            <span className="font-semibold text-foreground">투자 유의</span> · 본 서비스는 정보
            제공을 목적으로 하며 투자 자문 또는 투자 권유가 아닙니다. 데이터는 지연되거나 오류가
            포함될 수 있으며, 투자 결정의 최종 책임은 이용자에게 있습니다.
          </div>
          <div className="space-y-1 tabular sm:text-right">
            <div>시장 데이터 · Yahoo Finance 장마감 일봉</div>
            <div className="flex gap-3 sm:justify-end">
              <Link to="/methodology" className="hover:text-foreground hover:underline">출처·산식</Link>
              <Link to="/disclaimer" className="hover:text-foreground hover:underline">면책·데이터 한계</Link>
            </div>
            <div>© 2026 BVT Money Flow</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
