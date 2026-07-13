import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { X } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { generateSeries, type Sector } from "@/lib/mock-data";

export type Metric = "index" | "share" | "change";
export type Range = "5d" | "20d" | "60d";
type YScale = "auto" | "full";

const RANGE_DAYS: Record<Range, number> = { "5d": 5, "20d": 20, "60d": 60 };
const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--color-chart-6)",
  "var(--color-chart-7)",
  "var(--color-chart-8)",
];

const PRESETS: { label: string; ids: string[] }[] = [
  { label: "성장 3인방", ids: ["technology", "communication", "consumer-discretionary"] },
  { label: "방어주", ids: ["healthcare", "consumer-staples", "utilities"] },
  { label: "경기민감", ids: ["financial", "industrials", "materials", "energy"] },
];

interface Props {
  rows: Sector[];
  selected: string[];
  onSelected: (ids: string[]) => void;
  metric: Metric;
  onMetric: (metric: Metric) => void;
  range: Range;
  onRange: (range: Range) => void;
}

export function ComparisonChart({ rows, selected, onSelected, metric, onMetric, range, onRange }: Props) {
  const [yScale, setYScale] = useState<YScale>("auto");
  const rowMap = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  const data = useMemo(() => {
    const days = RANGE_DAYS[range];
    const seriesList = selected.map((id) => generateSeries(id, days));
    const len = seriesList[0]?.length ?? 0;
    return Array.from({ length: len }, (_, i) => {
      const row: Record<string, string | number> = {
        date: seriesList[0]?.[i]?.date ?? "",
      };
      selected.forEach((id, idx) => {
        const raw = seriesList[idx][i].value;
        if (metric === "share") {
          row[id] = Number(
            ((raw / 100) * (rowMap.get(id)?.share ?? 5)).toFixed(2),
          );
        } else if (metric === "change") {
          const base = seriesList[idx][0].value || 1;
          row[id] = Number((((raw - base) / base) * 100).toFixed(2));
        } else {
          row[id] = raw;
        }
      });
      return row;
    });
  }, [selected, range, metric, rowMap]);

  const removeSel = (id: string) => onSelected(selected.filter((s) => s !== id));
  const applyPreset = (ids: string[]) =>
    onSelected(Array.from(new Set(ids)).slice(0, 8));

  const canAdd = selected.length < 8;

  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <div className="min-w-0">
            <h2 className="text-base font-semibold sm:text-lg">그룹 비교 차트</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              지수화·시장 점유율·변화율 기준으로 선택 그룹의 상대 흐름을 비교합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ChartSeg
              label="지표"
              value={metric}
              onChange={(v) => onMetric(v as Metric)}
              options={[
                { id: "index", label: "지수화" },
                { id: "share", label: "시장 점유율" },
                { id: "change", label: "변화율" },
              ]}
            />
            <ChartSeg
              label="범위"
              value={range}
              onChange={(v) => onRange(v as Range)}
              options={[
                { id: "5d", label: "5D" },
                { id: "20d", label: "20D" },
                { id: "60d", label: "60D" },
              ]}
            />
            <ChartSeg
              label="Y축"
              value={yScale}
              onChange={(v) => setYScale(v as YScale)}
              options={[
                { id: "auto", label: "최근 구간 확대" },
                { id: "full", label: "전체 범위" },
              ]}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {selected.map((id, idx) => {
            const s = rowMap.get(id);
            if (!s) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-1 pl-1.5 pr-1 text-xs"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                  aria-hidden
                />
                <span className="pl-0.5">{s.name}</span>
                <button
                  onClick={() => removeSel(id)}
                  aria-label={`${s.name} 삭제`}
                  className="grid h-5 w-5 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            );
          })}
          {canAdd && <AddButton rows={rows} selected={selected} onAdd={(id) => onSelected([...selected, id])} />}
          <span className="ml-auto text-[11px] text-muted-foreground">
            최대 8개까지 비교할 수 있어요 · 현재 {selected.length}/8
          </span>
        </div>

        <div className="mt-4 h-[380px] w-full sm:h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis
                dataKey="date"
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={24}
              />
              <YAxis
                stroke="var(--color-muted-foreground)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={
                  yScale === "auto"
                    ? ["auto", "auto"]
                    : metric === "index"
                      ? [80, 120]
                      : metric === "share"
                        ? [0, 30]
                        : [-25, 25]
                }
                tickFormatter={(v: number) =>
                  metric === "share"
                    ? `${v.toFixed(1)}%`
                    : metric === "change"
                      ? `${v > 0 ? "+" : ""}${v.toFixed(0)}%`
                      : v.toFixed(0)
                }
                width={52}
              />
              <Tooltip
                cursor={{ stroke: "var(--color-border)" }}
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelStyle={{ color: "var(--color-muted-foreground)" }}
                formatter={(value: number, name: string) => {
                  const s = rowMap.get(name);
                  const suffix =
                    metric === "share" || metric === "change" ? "%" : "";
                  return [`${value.toFixed(2)}${suffix}`, s?.name ?? name];
                }}
              />
              {metric === "index" && (
                <ReferenceLine
                  y={100}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                  label={{
                    value: "기준 100",
                    position: "right",
                    fill: "var(--color-muted-foreground)",
                    fontSize: 10,
                  }}
                />
              )}
              {metric === "change" && (
                <ReferenceLine
                  y={0}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.6}
                />
              )}
              {selected.map((id, idx) => (
                <Line
                  key={id}
                  type="monotone"
                  dataKey={id}
                  stroke={CHART_COLORS[idx % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            프리셋
          </span>
          {PRESETS.filter((p) => p.ids.every((id) => rowMap.has(id))).map((p) => (
            <button
              key={p.label}
              onClick={() => applyPreset(p.ids)}
              className="rounded-md border border-dashed border-border/80 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-brand/40 hover:bg-secondary hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ChartSeg({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="inline-flex h-8 items-center gap-0.5 rounded-lg border border-border bg-surface p-0.5">
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              onClick={() => onChange(o.id)}
              aria-pressed={active}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                active
                  ? "bg-secondary text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AddButton({
  rows,
  selected,
  onAdd,
}: {
  rows: Sector[];
  selected: string[];
  onAdd: (id: string) => void;
}) {
  const available = rows.filter((s) => !selected.includes(s.id));
  if (available.length === 0) return null;
  return (
    <div className="group relative">
      <Button variant="outline" size="sm" className="h-7 rounded-full px-3 text-xs">
        + 그룹 추가
      </Button>
      <div className="invisible absolute left-0 top-full z-20 mt-1 w-56 rounded-lg border border-border bg-popover p-1 opacity-0 shadow-md transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        {available.map((s) => (
          <button
            key={s.id}
            onClick={() => onAdd(s.id)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-secondary"
          >
            <span>{s.name}</span>
            <span className="text-muted-foreground tabular">{s.share.toFixed(1)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}
