import { Fragment, useMemo, useState } from "react";
import { ArrowUpDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { SignalBadge, DeltaText } from "./signal-badge";
import { cn } from "@/lib/utils";
import type { Sector } from "@/lib/mock-data";
import { fmtBp, fmtMoney, fmtPct } from "@/lib/format";

type SortKey = "volume" | "volumeChange" | "priceChange" | "shareDelta";

interface Props {
  data: Sector[];
  selectedIds: string[];
  onToggleCompare: (id: string) => void;
  query: string;
  categoryLabel: string;
  periodLabel: string;
}

export function SectorTable({ data, selectedIds, onToggleCompare, query, categoryLabel, periodLabel }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("volume");
  const [dir, setDir] = useState<"desc" | "asc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? data.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.leaders.some((t) => t.toLowerCase().includes(q)),
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
            <h2 className="text-base font-semibold sm:text-lg">{categoryLabel} 목록</h2>
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
                <Th onClick={() => toggleSort("volume")} active={sortKey === "volume"}>
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
                    {isOpen && <ExpandedRow sector={s} periodLabel={periodLabel} />}
                  </Fragment>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
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
                      점유율 {s.share.toFixed(1)}% · 리더 {s.leaders.slice(0, 2).join(", ")}
                    </div>
                  </div>
                  <label className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
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
                    tone={s.shareDelta > 0 ? "success" : s.shareDelta < 0 ? "danger" : "muted"}
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

function ExpandedRow({ sector, periodLabel }: { sector: Sector; periodLabel: string }) {
  return (
    <tr className="bg-surface-2/40">
      <td colSpan={6} className="px-4 py-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              리더 종목
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sector.leaders.map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-border bg-background px-1.5 py-0.5 font-mono text-[11px] tabular"
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              해석
            </div>
            <p className="mt-1 text-xs leading-relaxed text-foreground/80">
              {describe(sector)}
            </p>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {periodLabel} 대비 강도
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  sector.volumeChange > 0 ? "bg-success" : "bg-danger",
                )}
                style={{
                  width: `${Math.min(100, Math.abs(sector.volumeChange) * 3)}%`,
                }}
              />
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground tabular">
              {periodLabel} 기준 거래대금 {fmtPct(sector.volumeChange)}
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
}

function describe(s: Sector) {
  if (s.signal === "inflow")
    return `${s.name} 그룹의 거래 비중이 확대됐고 가격도 함께 상승해 매수 강도가 확인됩니다.`;
  if (s.signal === "outflow")
    return `거래대금 증가와 함께 가격이 하락 중이라 매도 출회 신호가 뚜렷합니다.`;
  if (s.signal === "attention-loss")
    return `거래대금이 평균을 크게 하회해 시장의 관심이 이탈하는 구간입니다.`;
  return `자금 흐름이 균형 상태이며 방향성이 뚜렷하지 않습니다.`;
}
