import { Fragment, useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { SignalBadge, DeltaText } from "./signal-badge";
import { cn } from "@/lib/utils";
import { LIVE_GROUP_COMPANIES, type Sector } from "@/lib/mock-data";
import { fmtBp, fmtMcap, fmtMoney, fmtPct, fmtPrice } from "@/lib/format";
import { MetricInfo } from "./metric-info";

type SortKey = "volume" | "volumeChange" | "priceChange" | "shareDelta";

interface Props {
  data: Sector[];
  selectedIds: string[];
  onToggleCompare: (id: string) => void;
  onAddCompany: (id: string) => void;
  query: string;
  categoryLabel: string;
  periodLabel: string;
}

export function SectorTable({
  data,
  selectedIds,
  onToggleCompare,
  onAddCompany,
  query,
  categoryLabel,
  periodLabel,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (LIVE_GROUP_COMPANIES[s.id] ?? []).some(
              (company) =>
                company.ticker.toLowerCase().includes(q) ||
                company.name.toLowerCase().includes(q),
            ),
        )
      : data;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return dir === "desc" ? bv - av : av - bv;
    });
  }, [data, sortKey, dir, query]);

  const toggleSort = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setDir("desc");
    }
  };

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
              SECTOR MAP
            </div>
            <div className="flex items-center gap-1">
              <h2 className="text-base font-semibold sm:text-lg">
                {categoryLabel} 목록
              </h2>
              <MetricInfo label="거래대금 점유율이란?">
                선택한 섹터·산업·종목의 거래대금이 전체 분석 대상 거래대금에서
                차지하는 비중입니다. 점유율 변화는 실제 순매수액이 아니라 시장
                관심의 확대·축소를 보여줍니다.
              </MetricInfo>
            </div>
            <p className="text-[11px] text-muted-foreground">
              거래대금·변화율·점유율 변화·신호별 정렬 · {rows.length}개 그룹
            </p>
          </div>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2/60 text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-8 py-2.5 pl-4"></th>
                <th className="py-2.5 text-left font-medium">섹터</th>
                <Th
                  onClick={() => toggleSort("volume")}
                  active={sortKey === "volume"}
                >
                  거래대금
                </Th>
                <Th
                  onClick={() => toggleSort("priceChange")}
                  active={sortKey === "priceChange"}
                >
                  가격 변화
                </Th>
                <Th
                  onClick={() => toggleSort("shareDelta")}
                  active={sortKey === "shareDelta"}
                >
                  점유율 변화
                </Th>
                <th className="py-2.5 pr-4 text-left font-medium">신호</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((s) => {
                const isSel = selectedIds.includes(s.id);
                const isOpen = expanded === s.id;
                return (
                  <Fragment key={s.id}>
                    <tr
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-secondary/50",
                        isOpen && "bg-secondary/40",
                      )}
                      onClick={() =>
                        setExpanded((cur) => (cur === s.id ? null : s.id))
                      }
                    >
                      <td className="py-2.5 pl-4">
                        <label
                          className="grid h-6 w-6 cursor-pointer place-items-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="checkbox"
                            aria-label={`${s.name} 차트 비교에 추가`}
                            checked={isSel}
                            onChange={() => onToggleCompare(s.id)}
                            className="h-3.5 w-3.5 rounded border-border accent-brand"
                          />
                        </label>
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <ChevronRight
                            className={cn(
                              "h-4 w-4 text-muted-foreground transition-transform",
                              isOpen && "rotate-90",
                            )}
                          />
                          <div>
                            <div className="font-medium">{s.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              점유율 {s.share.toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="tabular">{fmtMoney(s.volume)}</div>
                        <div className="text-[11px] text-muted-foreground tabular">
                          {periodLabel} 대비 {fmtPct(s.volumeChange, 1)}
                        </div>
                      </td>
                      <td className="py-2.5 text-right">
                        <DeltaText value={s.priceChange} />
                      </td>
                      <td className="py-2.5 text-right tabular">
                        <span
                          className={cn(
                            "font-medium",
                            s.shareDelta > 0
                              ? "text-success"
                              : s.shareDelta < 0
                                ? "text-danger"
                                : "text-muted-foreground",
                          )}
                        >
                          {fmtBp(s.shareDelta)}
                        </span>
                      </td>
                      <td className="py-2.5 pr-4">
                        <SignalBadge signal={s.signal} />
                      </td>
                    </tr>
                    {isOpen && (
                      <ExpandedRow
                        sector={s}
                        periodLabel={periodLabel}
                        selectedIds={selectedIds}
                        onAddCompany={onAddCompany}
                      />
                    )}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-10 text-center text-sm text-muted-foreground"
                  >
                    검색 결과가 없습니다. 다른 키워드를 시도해 보세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <div className="divide-y divide-border/70 md:hidden">
          {rows.map((s) => {
            const isSel = selectedIds.includes(s.id);
            return (
              <div key={s.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.name}</span>
                      <SignalBadge signal={s.signal} size="xs" />
                    </div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground tabular">
                      점유율 {s.share.toFixed(1)}% · 리더{" "}
                      {s.leaders.slice(0, 2).join(", ")}
                    </div>
                  </div>
                  <label className="flex min-h-10 shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => onToggleCompare(s.id)}
                      className="h-4 w-4 rounded border-border accent-brand"
                    />
                    비교
                  </label>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
                  <MobileStat label="거래대금" value={fmtMoney(s.volume)} />
                  <MobileStat
                    label="점유율 Δ"
                    value={fmtBp(s.shareDelta)}
                    tone={
                      s.shareDelta > 0
                        ? "success"
                        : s.shareDelta < 0
                          ? "danger"
                          : "muted"
                    }
                  />
                  <MobileStat
                    label="거래대금 Δ"
                    value={fmtPct(s.volumeChange)}
                    tone={s.volumeChange > 0 ? "success" : "danger"}
                  />
                  <MobileStat
                    label="가격 변화"
                    value={fmtPct(s.priceChange)}
                    tone={s.priceChange > 0 ? "success" : "danger"}
                  />
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="p-10 text-center text-sm text-muted-foreground">
              검색 결과가 없습니다.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <th className="py-2.5 text-right font-medium">
      <button
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 py-0.5 hover:text-foreground",
          active && "text-foreground",
        )}
      >
        {children}
        <ArrowUpDown className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

function MobileStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger" | "muted";
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "font-semibold tabular",
          tone === "success" && "text-success",
          tone === "danger" && "text-danger",
          tone === "muted" && "text-muted-foreground",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function ExpandedRow({
  sector,
  periodLabel,
  selectedIds,
  onAddCompany,
}: {
  sector: Sector;
  periodLabel: string;
  selectedIds: string[];
  onAddCompany: (id: string) => void;
}) {
  const companies = LIVE_GROUP_COMPANIES[sector.id] ?? [];
  return (
    <tr className="bg-surface-2/40">
      <td colSpan={6} className="px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold">
              {sector.name} 소속 기업 · {companies.length}개
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {describe(sector)} 기업별 버튼을 눌러 위 차트에 추가할 수
              있습니다.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {periodLabel} 거래대금 변화 {fmtPct(sector.volumeChange)}
          </span>
        </div>
        <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-border/70 bg-background">
          <table className="min-w-[1050px] w-full text-xs">
            <thead className="sticky top-0 z-10 bg-surface-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">기업</th>
                <th className="px-3 py-2 text-left font-medium">산업</th>
                <th className="px-3 py-2 text-right font-medium">가격</th>
                <th className="px-3 py-2 text-right font-medium">등락</th>
                <th className="px-3 py-2 text-right font-medium">거래대금</th>
                <th className="px-3 py-2 text-right font-medium">1D</th>
                <th className="px-3 py-2 text-right font-medium">5D</th>
                <th className="px-3 py-2 text-right font-medium">20D</th>
                <th className="px-3 py-2 text-right font-medium">60D</th>
                <th className="px-3 py-2 text-right font-medium">시총</th>
                <th className="px-3 py-2 text-right font-medium">비교</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {companies.map((company) => {
                const selected = selectedIds.includes(company.id);
                return (
                  <tr key={company.id} className="hover:bg-secondary/40">
                    <td className="px-3 py-2">
                      <a
                        href={`/stock/?ticker=${encodeURIComponent(company.ticker)}`}
                        className="hover:text-brand"
                      >
                        <span className="font-mono font-semibold">
                          {company.ticker}
                        </span>
                        <span className="ml-2 text-muted-foreground">
                          {company.name}
                        </span>
                      </a>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {company.industry || "미수집"}
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      ${fmtPrice(company.price)}
                    </td>
                    <td
                      className={cn(
                        "px-3 py-2 text-right font-medium tabular",
                        company.change > 0
                          ? "text-success"
                          : company.change < 0
                            ? "text-danger"
                            : "text-muted-foreground",
                      )}
                    >
                      {fmtPct(company.change)}
                    </td>
                    <td className="px-3 py-2 text-right tabular">
                      {fmtMoney(company.volume)}
                    </td>
                    {(["1d", "5d", "20d", "60d"] as const).map((period) => {
                      const value = company.volumeVs?.[period] ?? 0;
                      return (
                        <td
                          key={period}
                          className={cn(
                            "px-3 py-2 text-right font-medium tabular",
                            value > 0
                              ? "text-success"
                              : value < 0
                                ? "text-danger"
                                : "text-muted-foreground",
                          )}
                        >
                          {fmtPct(value)}
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right tabular text-muted-foreground">
                      {fmtMcap(company.marketCap)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => onAddCompany(company.id)}
                        aria-pressed={selected}
                        className={cn(
                          "rounded-md border px-2 py-1 text-[11px] font-medium",
                          selected
                            ? "border-brand/30 bg-brand/10 text-brand"
                            : "border-border hover:bg-secondary",
                        )}
                      >
                        {selected ? "비교 중" : "차트 추가"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

function describe(s: Sector) {
  const domain = GROUP_DESCRIPTIONS[s.name];
  const prefix = domain ? `${domain} ` : "";
  if (s.signal === "inflow")
    return `${prefix}${s.name} 그룹의 거래 비중이 확대됐고 가격도 함께 상승했습니다. 실제 순매수액을 뜻하지는 않습니다.`;
  if (s.signal === "outflow")
    return `${prefix}거래대금 증가와 함께 가격이 하락했습니다. 실제 순매도액을 뜻하지는 않습니다.`;
  if (s.signal === "attention-loss")
    return `${prefix}거래대금이 평균을 크게 하회해 시장의 거래 관심이 감소한 구간입니다.`;
  return `${prefix}거래대금과 가격 방향이 중립적이며 뚜렷한 변화가 없습니다.`;
}

const GROUP_DESCRIPTIONS: Record<string, string> = {
  테크놀로지: "반도체·소프트웨어·IT 하드웨어 기업이 모인 대분류입니다.",
  "커뮤니케이션 서비스": "광고·콘텐츠·통신 플랫폼 기업이 모인 대분류입니다.",
  금융: "은행·보험·결제·자산운용 기업이 모인 대분류입니다.",
  "임의 소비재": "자동차·유통·여가처럼 경기와 소비 심리에 민감한 기업군입니다.",
  헬스케어: "제약·바이오·의료기기·건강보험 기업이 모인 대분류입니다.",
  산업재: "항공우주·운송·기계·건설 관련 기업이 모인 대분류입니다.",
  에너지: "석유·가스와 에너지 인프라 기업이 모인 대분류입니다.",
  "필수 소비재": "식품·생활용품처럼 경기 변동에 비교적 둔감한 기업군입니다.",
  유틸리티: "전력·가스·수도 등 필수 인프라를 운영하는 기업군입니다.",
  부동산: "산업·주거·리테일·데이터센터 리츠가 모인 대분류입니다.",
  소재: "화학·철강·구리·산업 소재를 공급하는 기업군입니다.",
};
