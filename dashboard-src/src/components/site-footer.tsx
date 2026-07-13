export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-border/70 bg-surface-2/50">
      <div className="mx-auto max-w-[1400px] px-4 py-6 lg:px-6">
        <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-2xl leading-relaxed">
            <span className="font-semibold text-foreground">투자 유의</span> · 본 서비스는 정보
            제공을 목적으로 하며 특정 종목·섹터의 매매를 권유하지 않습니다. 표시되는 자금 흐름
            지표는 참고 자료이며, 최종 투자 판단과 책임은 투자자 본인에게 있습니다.
          </div>
          <div className="space-y-1 tabular sm:text-right">
            <div>데이터 출처 · NYSE, NASDAQ 통합 시세 (SIP)</div>
            <div>© 2026 BMO Value Talks · Money Flow</div>
          </div>
        </div>
      </div>
    </footer>
  );
}

