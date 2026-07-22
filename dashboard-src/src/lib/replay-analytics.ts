import type { CompletedTrade } from "./replay";

export type PerformanceRow = {
  label: string;
  trades: number;
  winRate: number;
  averageReturn: number;
  totalProfit: number;
  averageHoldingDays: number;
  maximumGain: number;
  maximumLoss: number;
};

const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function summarize(label: string, trades: CompletedTrade[]): PerformanceRow {
  return {
    label,
    trades: trades.length,
    winRate: trades.length ? trades.filter((trade) => trade.returnPercent > 0).length / trades.length * 100 : 0,
    averageReturn: average(trades.map((trade) => trade.returnPercent)),
    totalProfit: trades.reduce((sum, trade) => sum + trade.realizedProfit, 0),
    averageHoldingDays: average(trades.map((trade) => trade.holdingDays)),
    maximumGain: Math.max(0, ...trades.map((trade) => trade.returnPercent)),
    maximumLoss: Math.min(0, ...trades.map((trade) => trade.returnPercent)),
  };
}

function grouped(trades: CompletedTrade[], keyFor: (trade: CompletedTrade) => string) {
  const groups = new Map<string, CompletedTrade[]>();
  for (const trade of trades) groups.set(keyFor(trade), [...(groups.get(keyFor(trade)) ?? []), trade]);
  return [...groups].map(([label, rows]) => summarize(label, rows));
}

export function analyzeReplayPerformance(trades: CompletedTrade[]) {
  const chronological = [...trades].sort((a, b) => a.exitDate.localeCompare(b.exitDate) || a.entryDate.localeCompare(b.entryDate));
  const wins = trades.filter((trade) => trade.returnPercent > 0);
  const losses = trades.filter((trade) => trade.returnPercent < 0);
  const totalProfit = trades.reduce((sum, trade) => sum + trade.realizedProfit, 0);
  const averageWin = average(wins.map((trade) => trade.returnPercent));
  const averageLoss = average(losses.map((trade) => trade.returnPercent));
  let cumulativeProfit = 0;
  let peak = 0;
  let maximumDrawdown = 0;
  let lossStreak = 0;
  let maximumLossStreak = 0;
  const equityCurve = chronological.map((trade, index) => {
    cumulativeProfit += trade.realizedProfit;
    peak = Math.max(peak, cumulativeProfit);
    maximumDrawdown = Math.min(maximumDrawdown, cumulativeProfit - peak);
    lossStreak = trade.returnPercent < 0 ? lossStreak + 1 : 0;
    maximumLossStreak = Math.max(maximumLossStreak, lossStreak);
    return { order: index + 1, ticker: trade.ticker, profit: cumulativeProfit, returnPercent: trade.returnPercent };
  });
  const positiveProfit = wins.reduce((sum, trade) => sum + Math.max(0, trade.realizedProfit), 0);
  const topFiveProfit = [...wins].sort((a, b) => b.realizedProfit - a.realizedProfit).slice(0, 5).reduce((sum, trade) => sum + Math.max(0, trade.realizedProfit), 0);
  const distributionDefinitions = [
    ["-20% 이하", (value: number) => value <= -20],
    ["-20~-10%", (value: number) => value > -20 && value <= -10],
    ["-10~-5%", (value: number) => value > -10 && value <= -5],
    ["-5~0%", (value: number) => value > -5 && value < 0],
    ["0~5%", (value: number) => value >= 0 && value < 5],
    ["5~10%", (value: number) => value >= 5 && value < 10],
    ["10% 이상", (value: number) => value >= 10],
  ] as const;
  const distribution = distributionDefinitions.map(([label, matches]) => ({ label, count: trades.filter((trade) => matches(trade.returnPercent)).length }));
  const tickerRows = grouped(trades, (trade) => trade.ticker).sort((a, b) => b.trades - a.trades || a.totalProfit - b.totalProfit);
  const holdingRows = grouped(trades, (trade) => trade.holdingDays === 0 ? "당일" : trade.holdingDays === 1 ? "1일" : trade.holdingDays <= 3 ? "2~3일" : trade.holdingDays <= 7 ? "4~7일" : "8일 이상");
  const holdingOrder = ["당일", "1일", "2~3일", "4~7일", "8일 이상"];
  holdingRows.sort((a, b) => holdingOrder.indexOf(a.label) - holdingOrder.indexOf(b.label));
  const weekdayNames = ["일", "월", "화", "수", "목", "금", "토"];
  const weekdayRows = grouped(trades, (trade) => `${weekdayNames[new Date(`${trade.exitDate}T00:00:00Z`).getUTCDay()]}요일`);
  const worstTicker = [...tickerRows].sort((a, b) => a.totalProfit - b.totalProfit)[0];
  const bestTicker = [...tickerRows].sort((a, b) => b.totalProfit - a.totalProfit)[0];
  const worstHolding = [...holdingRows].filter((row) => row.trades >= 2).sort((a, b) => a.averageReturn - b.averageReturn)[0];
  const largeLosses = losses.filter((trade) => trade.returnPercent <= -10);
  const diagnostics = [
    `승률은 ${trades.length ? (wins.length / trades.length * 100).toFixed(1) : "0.0"}%이며 거래당 기대값은 ${average(trades.map((trade) => trade.returnPercent)).toFixed(2)}%입니다.${Math.abs(averageLoss) > averageWin ? " 평균 손실이 평균 이익보다 큽니다." : " 평균 이익이 평균 손실보다 큽니다."}`,
    largeLosses.length ? `-10% 이하 대형 손실 ${largeLosses.length}건이 전체 성과를 훼손했는지 점검하세요.` : "-10% 이하 대형 손실은 없었습니다.",
    worstTicker && bestTicker ? `${worstTicker.label}에서 손실이 가장 컸고, ${bestTicker.label}의 성과가 가장 양호했습니다.` : "종목별 성과를 계산할 거래가 부족합니다.",
    worstHolding ? `${worstHolding.label} 보유 거래의 평균 성과가 ${worstHolding.averageReturn.toFixed(2)}%로 가장 낮았습니다.` : "보유기간별 비교를 위한 표본이 부족합니다.",
  ];
  return {
    totalTrades: trades.length,
    winRate: trades.length ? wins.length / trades.length * 100 : 0,
    averageReturn: average(trades.map((trade) => trade.returnPercent)),
    totalProfit,
    averageWin,
    averageLoss,
    payoffRatio: averageLoss ? averageWin / Math.abs(averageLoss) : 0,
    expectancy: average(trades.map((trade) => trade.returnPercent)),
    maximumSingleLoss: Math.min(0, ...trades.map((trade) => trade.returnPercent)),
    maximumLossStreak,
    maximumDrawdown,
    averageHoldingDays: average(trades.map((trade) => trade.holdingDays)),
    topFiveProfitShare: positiveProfit ? topFiveProfit / positiveProfit * 100 : 0,
    equityCurve,
    distribution,
    tickerRows,
    holdingRows,
    weekdayRows,
    diagnostics,
  };
}
