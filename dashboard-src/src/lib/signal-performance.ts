import type { DataGrade } from "./signal-rules";
import { PERFORMANCE_RULE_VERSION, SIGNAL_PERFORMANCE_ASSUMPTIONS } from "./signal-rules";

export type PerformanceOutcome = {
  status: "COMPLETE" | "INCOMPLETE";
  netReturn?: number;
  reasons?: string[];
};

export type PerformanceStatus = "ELIGIBLE" | "INSUFFICIENT_SAMPLE" | "INCOMPLETE" | "UNAVAILABLE_DATA_GRADE";

export function netLongReturn(entryAdjustedOpen: number, exitAdjustedClose: number, sideCost = 0.0015) {
  if (![entryAdjustedOpen, exitAdjustedClose].every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("진입·청산 가격은 유한한 양수여야 합니다.");
  }
  if (!Number.isFinite(sideCost) || sideCost < 0 || sideCost >= 1) throw new Error("편도 비용은 0 이상 1 미만이어야 합니다.");
  return exitAdjustedClose * (1 - sideCost) / (entryAdjustedOpen * (1 + sideCost)) - 1;
}

export function excessReturn(strategyReturn: number, benchmarkReturn: number) {
  if (benchmarkReturn <= -1) throw new Error("벤치마크 수익률은 -100%보다 커야 합니다.");
  return (1 + strategyReturn) / (1 + benchmarkReturn) - 1;
}

const quantile = (values: number[], probability: number) => {
  const ordered = [...values].sort((a, b) => a - b);
  if (ordered.length === 1) return ordered[0];
  const position = (ordered.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  return lower === upper ? ordered[lower] : ordered[lower] * (upper - position) + ordered[upper] * (position - lower);
};

export function summarizeSignalPerformance(outcomes: PerformanceOutcome[], expectedCount: number, dataGrade: DataGrade) {
  const returns = outcomes
    .filter((row) => row.status === "COMPLETE" && Number.isFinite(row.netReturn))
    .map((row) => Number(row.netReturn));
  const coverage = expectedCount > 0 ? returns.length / expectedCount : 0;
  let status: PerformanceStatus = "ELIGIBLE";
  const reasons: string[] = [];
  if (coverage < SIGNAL_PERFORMANCE_ASSUMPTIONS.minimumCoverage) {
    status = "INCOMPLETE";
    reasons.push("COVERAGE_BELOW_90_PERCENT");
  }
  if (returns.length < SIGNAL_PERFORMANCE_ASSUMPTIONS.minimumSample) {
    if (status === "ELIGIBLE") status = "INSUFFICIENT_SAMPLE";
    reasons.push("SAMPLE_BELOW_30");
  }
  if (dataGrade === "CURRENT_PROXY") {
    status = "UNAVAILABLE_DATA_GRADE";
    reasons.push("CURRENT_PROXY_SURVIVORSHIP_RISK");
  }
  const sorted = [...returns].sort((a, b) => a - b);
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : null;
  const median = returns.length
    ? returns.length % 2 ? sorted[(returns.length - 1) / 2] : (sorted[returns.length / 2 - 1] + sorted[returns.length / 2]) / 2
    : null;
  return {
    performanceRuleVersion: PERFORMANCE_RULE_VERSION,
    status,
    reasons,
    expectedCount,
    sampleCount: returns.length,
    coverage,
    isConfirmatory: false,
    hitRate: returns.length ? returns.filter((value) => value > 0).length / returns.length : null,
    mean,
    median,
    p10: returns.length ? quantile(returns, 0.1) : null,
    p25: returns.length ? quantile(returns, 0.25) : null,
    p75: returns.length ? quantile(returns, 0.75) : null,
    p90: returns.length ? quantile(returns, 0.9) : null,
    distribution: {
      lossBelow10Pct: returns.filter((value) => value < -0.1).length,
      loss0To10Pct: returns.filter((value) => value >= -0.1 && value < 0).length,
      gain0To10Pct: returns.filter((value) => value >= 0 && value < 0.1).length,
      gain10PctOrMore: returns.filter((value) => value >= 0.1).length,
    },
  };
}
