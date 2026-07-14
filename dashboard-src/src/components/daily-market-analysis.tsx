import { useEffect, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { MetricInfo } from "./metric-info";
import { LIVE_META, LIVE_STOCKS, SECTORS, type StockRow } from "@/lib/mock-data";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/utils";

type QuadrantPoint = StockRow & { x: number; y: number; z: number };
type Analysis = {
  valid: StockRow[];
  upValue: StockRow[];
  upPriceUpValue: StockRow[];
  downPriceUpValue: StockRow[];
  upPriceDownValue: StockRow[];
  downPriceDownValue: StockRow[];
  participation: number;
  points: QuadrantPoint[];
  surges: StockRow[];
  concentration: { label: string; current: number; average: number }[];
  topFive: StockRow[];
};
type AnalyticsEvent =
  | "daily_summary_view"
  | "quadrant_view"
  | "quadrant_point_click"
  | "participation_view"
  | "concentration_view"
  | "surge_stock_click"
  | "surge_stock_more_click"
  | "sector_chart_interaction";

const MEGA_CAP_7 = new Set(["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA"]);
const tooltipStyle = {
  backgroundColor: "var(--color-popover)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: 12,
};

function track(event: AnalyticsEvent, detail: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  const payload = {
    event,
    market_date: LIVE_META.asOf,
    device_type: window.innerWidth < 768 ? "mobile" : "desktop",
    ...detail,
  };
  window.dispatchEvent(new CustomEvent("bvt:analytics", { detail: payload }));
  const dataLayer = (window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer;
  dataLayer?.push(payload);
}

const averageVolume = (stock: StockRow, period: "5d" | "20d") => {
  const change = stock.volumeVs?.[period];
  if (change == null || change <= -100) return null;
  const value = stock.volume / (1 + change / 100);
  return Number.isFinite(value) && value > 0 ? value : null;
};

const shareOf = (rows: StockRow[], count: number, value: (stock: StockRow) => number | null) => {
  const valid = rows
    .map((stock) => ({ stock, value: value(stock) }))
    .filter((item): item is { stock: StockRow; value: number } => item.value != null && item.value > 0);
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  if (!total) return 0;
  return valid.sort((a, b) => b.value - a.value).slice(0, count).reduce((sum, item) => sum + item.value, 0) / total * 100;
};

const groupShare = (rows: StockRow[], tickers: Set<string>, value: (stock: StockRow) => number | null) => {
  const valid = rows
    .map((stock) => ({ stock, value: value(stock) }))
    .filter((item): item is { stock: StockRow; value: number } => item.value != null && item.value > 0);
  const total = valid.reduce((sum, item) => sum + item.value, 0);
  const selected = valid.filter((item) => tickers.has(item.stock.ticker)).reduce((sum, item) => sum + item.value, 0);
  return total ? selected / total * 100 : 0;
};

export function DailyMarketAnalysis() {
  const analysis = useMemo(() => {
    const valid = LIVE_STOCKS.filter((stock) => Number.isFinite(stock.volumeRatio) && stock.volumeRatio > 0);
    const upValue = valid.filter((stock) => stock.volumeRatio >= 1);
    const upPriceUpValue = upValue.filter((stock) => stock.change > 0);
    const downPriceUpValue = upValue.filter((stock) => stock.change <= 0);
    const upPriceDownValue = valid.filter((stock) => stock.change > 0 && stock.volumeRatio < 1);
    const downPriceDownValue = valid.filter((stock) => stock.change <= 0 && stock.volumeRatio < 1);
    const participation = valid.length ? upValue.length / valid.length * 100 : 0;
    const points: QuadrantPoint[] = valid.map((stock) => ({
      ...stock,
      x: Math.max(-100, Math.min(500, (stock.volumeRatio - 1) * 100)),
      y: stock.change,
      z: Math.max(40, stock.volume),
    }));
    const surges = valid
      .filter((stock) => stock.volumeRatio >= 2 && stock.volume >= 50)
      .sort((a, b) => b.volumeRatio - a.volumeRatio);
    const concentration = [5, 10, 20].map((count) => ({
      label: `상위 ${count}개 종목`,
      current: shareOf(valid, count, (stock) => stock.volume),
      average: shareOf(valid, count, (stock) => averageVolume(stock, "5d")),
    }));
    concentration.push({
      label: "메가캡 7종목",
      current: groupShare(valid, MEGA_CAP_7, (stock) => stock.volume),
      average: groupShare(valid, MEGA_CAP_7, (stock) => averageVolume(stock, "5d")),
    });
    const topFive = [...valid].sort((a, b) => b.volume - a.volume).slice(0, 5);
    return {
      valid,
      upValue,
      upPriceUpValue,
      downPriceUpValue,
      upPriceDownValue,
      downPriceDownValue,
      participation,
      points,
      surges,
      concentration,
      topFive,
    };
  }, []);

  useEffect(() => {
    track("daily_summary_view");
    track("quadrant_view", { section_name: "price_value_quadrant" });
    track("participation_view", { section_name: "market_participation" });
    track("concentration_view", { section_name: "trading_value_concentration" });
  }, []);

  if (!analysis.valid.length) {
    return (
      <Card className="mt-5">
        <CardContent className="p-5 text-sm text-muted-foreground">
          20일 평균 데이터가 부족해 일일 시장 분석을 계산하지 못했습니다.
        </CardContent>
      </Card>
    );
  }

  const participationMessage = analysis.participation >= 60
    ? "거래대금 증가가 시장 전반으로 확산됐습니다."
    : analysis.participation >= 40
      ? "시장 참여도가 중립적인 수준입니다."
      : "거래대금 증가가 일부 종목에 집중됐습니다.";
  const top10 = analysis.concentration[1];
  const concentrationDifference = top10.current - top10.average;
  const concentrationMessage = concentrationDifference >= 5
    ? "오늘 거래대금은 최근보다 소수 종목에 강하게 집중됐습니다."
    : concentrationDifference <= -5
      ? "오늘 거래대금은 최근보다 여러 종목에 분산됐습니다."
      : "거래대금 집중도는 최근 5일 평균과 비슷한 수준입니다.";

  return (
    <section className="mt-5" aria-label="오늘의 시장 상세 분석">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <QuadrantCard analysis={analysis} className="order-4 lg:order-1 lg:col-span-5" />
        <ParticipationCard analysis={analysis} message={participationMessage} className="order-1 lg:order-2 lg:col-span-3" />
        <ConcentrationCard analysis={analysis} message={concentrationMessage} className="order-2 lg:order-3 lg:col-span-4" />
        <SurgeCard rows={analysis.surges} className="order-3 lg:order-4 lg:col-span-7" />
        <SectorChangeCard className="order-5 lg:order-5 lg:col-span-5" />
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        20일 평균 데이터가 없는 신규 상장 종목은 참여도·4분면·급증 분석에서 제외됩니다. 거래대금 증가는 실제 순매수를 뜻하지 않습니다.
      </p>
    </section>
  );
}

function AnalysisHeader({ label, title, description, info }: { label: string; title: string; description: string; info: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">{label}</div>
      <div className="mt-1 flex items-center gap-1">
        <h2 className="text-base font-semibold">{title}</h2>
        <MetricInfo label={`${title} 기준`}>{info}</MetricInfo>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{description}</p>
    </div>
  );
}

function ParticipationCard({ analysis, message, className }: {
  analysis: Analysis;
  message: string;
  className?: string;
}) {
  const data = [
    { name: "상승 + 거래대금 증가", value: analysis.upPriceUpValue.length, color: "var(--color-success)" },
    { name: "하락 + 거래대금 증가", value: analysis.downPriceUpValue.length, color: "var(--color-danger)" },
    { name: "거래대금 감소", value: analysis.valid.length - analysis.upValue.length, color: "var(--color-muted)" },
  ];
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <AnalysisHeader
          label="MARKET PARTICIPATION"
          title="시장 참여도"
          description="20일 평균보다 거래대금이 증가한 종목 비율"
          info="현재 거래대금이 20일 평균 거래대금 이상인 종목을 참여 종목으로 계산합니다."
        />
        <div className="relative mt-3 h-44">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" innerRadius={52} outerRadius={72} paddingAngle={2} stroke="none">
                {data.map((item) => <Cell key={item.name} fill={item.color} />)}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} formatter={(value: number, name: string) => [`${value}종목`, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <strong className="text-2xl tabular">{analysis.participation.toFixed(0)}%</strong>
            <span className="text-[10px] text-muted-foreground">거래대금 증가</span>
            <span className="text-[10px] tabular text-muted-foreground">{analysis.upValue.length} / {analysis.valid.length}</span>
          </div>
        </div>
        <div className="space-y-1.5 text-xs">
          {data.map((item) => (
            <div key={item.name} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
              <span className="flex-1 text-muted-foreground">{item.name}</span>
              <span className="font-medium tabular">{item.value}종목 · {(item.value / analysis.valid.length * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs font-medium">{message}</p>
      </CardContent>
    </Card>
  );
}

function ConcentrationCard({ analysis, message, className }: {
  analysis: Analysis;
  message: string;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <AnalysisHeader
          label="MARKET CONCENTRATION"
          title="거래대금 집중도"
          description="시장 전체 거래대금에서 상위 종목이 차지하는 비중"
          info="당일 거래대금 기준 상위 종목 점유율과 종목별 최근 5일 평균 거래대금으로 계산한 기준치를 비교합니다."
        />
        <div className="mt-4 divide-y divide-border/70">
          {analysis.concentration.map((item) => {
            const difference = item.current - item.average;
            const displayedDifference = Math.abs(difference) < 0.05 ? 0 : difference;
            return (
              <div key={item.label} className="py-2.5 first:pt-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{item.label} 점유율</span>
                  <strong className="text-base tabular">{item.current.toFixed(1)}%</strong>
                </div>
                <div className="mt-0.5 flex justify-between text-[11px] tabular text-muted-foreground">
                  <span>5일 평균 {item.average.toFixed(1)}%</span>
                  <span className={displayedDifference > 0 ? "text-danger" : displayedDifference < 0 ? "text-success" : ""}>
                    {displayedDifference > 0 ? "+" : ""}{displayedDifference.toFixed(1)}%p
                  </span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 text-[11px] text-muted-foreground">
          상위 5개 · {analysis.topFive.map((stock) => stock.ticker).join(" · ")}
        </div>
        <p className="mt-3 rounded-md bg-surface-2 px-3 py-2 text-xs font-medium">{message}</p>
      </CardContent>
    </Card>
  );
}

function QuadrantCard({ analysis, className }: { analysis: Analysis; className?: string }) {
  const groups = [
    ["상승·거래대금 확대", analysis.upPriceUpValue.length, "text-success"],
    ["하락·거래대금 확대", analysis.downPriceUpValue.length, "text-danger"],
    ["상승·거래대금 축소", analysis.upPriceDownValue.length, "text-success"],
    ["하락·거래대금 축소", analysis.downPriceDownValue.length, "text-danger"],
  ] as const;
  const pointGroups = [
    { key: "up-up", data: analysis.points.filter((point) => point.y > 0 && point.x >= 0), color: "var(--color-success)" },
    { key: "down-up", data: analysis.points.filter((point) => point.y <= 0 && point.x >= 0), color: "var(--color-danger)" },
    { key: "up-down", data: analysis.points.filter((point) => point.y > 0 && point.x < 0), color: "var(--color-info)" },
    { key: "down-down", data: analysis.points.filter((point) => point.y <= 0 && point.x < 0), color: "var(--color-muted-foreground)" },
  ];
  const openStock = (point: QuadrantPoint) => {
    track("quadrant_point_click", { ticker: point.ticker, section_name: "price_value_quadrant" });
    window.location.href = `/scanner/?ticker=${encodeURIComponent(point.ticker)}`;
  };
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <AnalysisHeader
          label="PRICE × TRADING VALUE"
          title="가격 × 거래대금 4분면"
          description="주가 움직임에 평소보다 큰 거래가 동반됐는지 확인합니다."
          info="X축은 20일 평균 대비 거래대금 변화, Y축은 당일 주가 등락률, 점 크기는 현재 거래대금입니다. 극단치는 가독성을 위해 X축 +500%에서 표시를 제한합니다."
        />
        <div className="mt-3 h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 8, bottom: 10, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.55} />
              <XAxis type="number" dataKey="x" domain={[-100, 500]} tickFormatter={(value) => `${value}%`} fontSize={10} tickLine={false} />
              <YAxis type="number" dataKey="y" domain={["auto", "auto"]} tickFormatter={(value) => `${value}%`} fontSize={10} tickLine={false} width={42} />
              <ZAxis type="number" dataKey="z" range={[22, 280]} />
              <ReferenceLine x={0} stroke="var(--color-muted-foreground)" strokeOpacity={0.7} />
              <ReferenceLine y={0} stroke="var(--color-muted-foreground)" strokeOpacity={0.7} />
              <Tooltip content={<QuadrantTooltip />} cursor={{ strokeDasharray: "3 3" }} />
              {pointGroups.map((group) => (
                <Scatter
                  key={group.key}
                  data={group.data}
                  fill={group.color}
                  fillOpacity={0.55}
                  onClick={openStock}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-border/70 pt-3 text-[11px]">
          {groups.map(([label, count, tone]) => (
            <div key={label} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{label}</span>
              <strong className={cn("tabular", tone)}>{count}</strong>
            </div>
          ))}
        </div>
        <Link
          to="/scanner"
          search={{ priceDirection: "up", tradingValueDirection: "up" } as never}
          onClick={() => track("quadrant_point_click", { section_name: "quadrant_more" })}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
        >
          4분면 종목 전체 보기 <ArrowUpRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}

function QuadrantTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: QuadrantPoint }> }) {
  const stock = payload?.[0]?.payload;
  if (!active || !stock) return null;
  return (
    <div className="rounded-lg border border-border bg-popover p-3 text-xs shadow-xl">
      <div className="font-mono font-semibold">{stock.ticker}</div>
      <div className="mb-2 text-[11px] text-muted-foreground">{stock.name}</div>
      <div className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 tabular">
        <span className="text-muted-foreground">주가 변화</span><span>{fmtPct(stock.change)}</span>
        <span className="text-muted-foreground">현재 거래대금</span><span>{fmtMoney(stock.volume)}</span>
        <span className="text-muted-foreground">20일 평균 대비</span><span>{stock.volumeRatio.toFixed(2)}배</span>
        <span className="text-muted-foreground">섹터</span><span>{stock.sector}</span>
      </div>
    </div>
  );
}

function SurgeCard({ rows, className }: { rows: StockRow[]; className?: string }) {
  const shown = rows.slice(0, 5);
  return (
    <Card className={className}>
      <CardContent className="p-0">
        <div className="p-4 sm:p-5">
          <AnalysisHeader
            label="TRADING VALUE SURGE"
            title="거래대금 급증 종목"
            description={`20일 평균의 2배 이상·현재 거래대금 5천만 달러 이상 · ${rows.length}종목`}
            info="현재 거래대금이 20일 평균의 2배 이상이고 5천만 달러 이상인 종목만 표시합니다."
          />
        </div>
        <div className="overflow-x-auto border-y border-border/70">
          <table className="min-w-[760px] w-full text-xs">
            <thead className="bg-surface-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-center font-medium">순위</th>
                <th className="px-3 py-2 text-left font-medium">종목</th>
                <th className="px-3 py-2 text-left font-medium">섹터</th>
                <th className="px-3 py-2 text-right font-medium">현재 거래대금</th>
                <th className="px-3 py-2 text-right font-medium">20일 평균 대비</th>
                <th className="px-3 py-2 text-right font-medium">전일 대비</th>
                <th className="px-4 py-2 text-right font-medium">주가 변화</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {shown.map((stock, index) => (
                <tr key={stock.ticker} className="hover:bg-secondary/45">
                  <td className="px-4 py-3 text-center text-muted-foreground">{index + 1}</td>
                  <td className="px-3 py-3">
                    <Link
                      to="/scanner"
                      search={{ ticker: stock.ticker } as never}
                      onClick={() => track("surge_stock_click", { ticker: stock.ticker, section_name: "trading_value_surge" })}
                      className="font-mono font-semibold hover:text-brand"
                    >{stock.ticker}</Link>
                    <div className="max-w-36 truncate text-[10px] text-muted-foreground">{stock.name}</div>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{stock.sector}</td>
                  <td className="px-3 py-3 text-right font-medium tabular">{fmtMoney(stock.volume)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular text-brand">{stock.volumeRatio.toFixed(2)}배</td>
                  <td className={cn("px-3 py-3 text-right tabular", tone(stock.volumeVs?.["1d"] ?? 0))}>{fmtPct(stock.volumeVs?.["1d"] ?? 0, 1)}</td>
                  <td className={cn("px-4 py-3 text-right tabular", tone(stock.change))}>{fmtPct(stock.change)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="p-4 text-right sm:px-5">
          <Link
            to="/scanner"
            search={{ preset: "trading-value-surge" } as never}
            onClick={() => track("surge_stock_more_click", { section_name: "trading_value_surge" })}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
          >
            급증 종목 전체 보기 <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function SectorChangeCard({ className }: { className?: string }) {
  const all = [...SECTORS].sort((a, b) => Math.abs(b.shareDelta) - Math.abs(a.shareDelta));
  const mobile = [
    ...SECTORS.filter((sector) => sector.shareDelta > 0).sort((a, b) => b.shareDelta - a.shareDelta).slice(0, 3),
    ...SECTORS.filter((sector) => sector.shareDelta < 0).sort((a, b) => a.shareDelta - b.shareDelta).slice(0, 3),
  ];
  const chart = (data: typeof SECTORS, height: number) => (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 10 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" opacity={0.45} />
        <XAxis type="number" tickFormatter={(value) => `${(value / 100).toFixed(1)}%p`} fontSize={9} tickLine={false} />
        <YAxis type="category" dataKey="name" width={92} fontSize={10} tickLine={false} axisLine={false} />
        <ReferenceLine x={0} stroke="var(--color-muted-foreground)" />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(value: number) => [`${value > 0 ? "+" : ""}${(value / 100).toFixed(2)}%p`, "점유율 변화"]}
        />
        <Bar dataKey="shareDelta" radius={2} onClick={() => track("sector_chart_interaction", { section_name: "sector_share_change" })}>
          {data.map((sector) => <Cell key={sector.id} fill={sector.shareDelta >= 0 ? "var(--color-success)" : "var(--color-danger)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <AnalysisHeader
          label="SECTOR SHARE CHANGE"
          title="섹터별 점유율 변화"
          description="전일 대비 거래대금 점유율 변화 · 1%p = 100bp"
          info="섹터 거래대금을 전체 분석 대상 거래대금으로 나눈 점유율의 전일 대비 변화를 표시합니다."
        />
        <div className="mt-4 hidden lg:block">{chart(all, 360)}</div>
        <div className="mt-4 lg:hidden">{chart(mobile, 270)}</div>
      </CardContent>
    </Card>
  );
}

function tone(value: number) {
  return value > 0 ? "text-success" : value < 0 ? "text-danger" : "text-muted-foreground";
}
