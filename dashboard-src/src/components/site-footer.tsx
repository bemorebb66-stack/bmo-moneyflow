import { Link } from "@tanstack/react-router";
import { Bookmark, Bug, MessageSquare } from "lucide-react";

export function SiteFooter() {
  const currentPage = typeof window === "undefined"
    ? "/"
    : `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const pageParam = encodeURIComponent(currentPage);
  return (
    <footer className="mt-10 border-t border-border/70 bg-surface-2/50">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
        <div className="mb-5 flex flex-col gap-3 rounded-lg border border-brand/15 bg-brand/[0.045] px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Bookmark className="h-4 w-4 text-brand" />
            매일 미국장 마감 후 업데이트됩니다. 즐겨찾기에 추가해두세요.
          </div>
          <Link to="/today" className="text-xs font-semibold text-brand hover:underline">오늘의 시장 브리핑 보기 →</Link>
        </div>
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl leading-relaxed">
            <span className="font-semibold text-foreground">투자 유의</span> · 본 서비스는 정보
            제공을 목적으로 하며 투자 자문 또는 투자 권유가 아닙니다. 데이터는 지연되거나 오류가
            포함될 수 있으며, 투자 결정의 최종 책임은 이용자에게 있습니다.
          </div>
          <div className="space-y-1 tabular sm:text-right">
            <div>시장 데이터 · Yahoo Finance 장마감 일봉</div>
            <div className="flex gap-3 sm:justify-end">
              <Link to="/methodology" className="hover:text-foreground hover:underline">데이터 기준</Link>
              <Link to="/disclaimer" className="hover:text-foreground hover:underline">면책·데이터 한계</Link>
              <Link to="/privacy-policy" className="hover:text-foreground hover:underline">개인정보처리방침</Link>
            </div>
            <div className="flex flex-wrap gap-3 sm:justify-end">
              <a href={`/feedback/?type=data&page=${pageParam}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline"><Bug className="h-3.5 w-3.5" />데이터 오류 신고</a>
              <a href={`/feedback/?type=contact&page=${pageParam}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline"><MessageSquare className="h-3.5 w-3.5" />서비스 문의</a>
            </div>
            <div>© 2026 BVT Money Flow</div>
          </div>
        </div>
      </div>
    </footer>
  );
}
