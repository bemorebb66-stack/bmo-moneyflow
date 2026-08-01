export const SIGNAL_RULE_VERSION = "bvt-signal/2.0.0";
export const DATA_CONTRACT_VERSION = "bvt-market-data/2.0.0";
export const REPLAY_RULE_VERSION = "bvt-replay/2.0.0";
export const PERFORMANCE_RULE_VERSION = "bvt-performance/2.0.0";
export const BENCHMARK_VERSION = "US-SPY-total-return/1.0.0";

export type Signal = "inflow" | "outflow" | "attention-loss" | "neutral";
export type DataGrade = "PIT_VERIFIED" | "PIT_RECONSTRUCTED" | "CURRENT_PROXY";
export type CalculationStatus = "COMPLETE" | "INCOMPLETE";

export const SIGNAL_PERFORMANCE_ASSUMPTIONS = {
  horizons: [1, 5, 20] as const,
  commissionBpPerSide: 5,
  slippageBpPerSide: 10,
  benchmark: "SPY adjusted total return",
  entry: "available_at 이후 첫 정규 거래일 수정 시가",
  exit: "진입일을 1일째로 센 N번째 정규 거래일 수정 종가",
  minimumSample: 30,
  minimumCoverage: 0.9,
} as const;

export function classifyStockSignal(volumeChangePercent: number, priceChangePercent: number): Signal {
  if (volumeChangePercent > 3 && priceChangePercent > 0.15) return "inflow";
  if (volumeChangePercent > 3 && priceChangePercent < -0.15) return "outflow";
  if (volumeChangePercent < -3) return "attention-loss";
  return "neutral";
}

export function classifyGroupSignal(shareDeltaBp: number, priceChangePercent: number, volumeChangePercent: number): Signal {
  if (shareDeltaBp > 10 && priceChangePercent >= 0) return "inflow";
  if (shareDeltaBp < -10 && priceChangePercent < 0) return "outflow";
  if (volumeChangePercent < -15) return "attention-loss";
  return "neutral";
}

export function isSurge(ratio20: number | null | undefined, dollarVolume: number | null | undefined) {
  return Number.isFinite(ratio20) && Number.isFinite(dollarVolume) && Number(ratio20) >= 2 && Number(dollarVolume) >= 50_000_000;
}

export function signalEligibility(priorSessionCount: number, values: Array<number | null | undefined>) {
  const reasons: string[] = [];
  if (priorSessionCount < 20) reasons.push("INSUFFICIENT_PRIOR_SESSIONS");
  if (values.some((value) => value == null || !Number.isFinite(value))) reasons.push("MISSING_OR_NON_FINITE_INPUT");
  return { status: reasons.length ? "INCOMPLETE" as const : "COMPLETE" as const, reasons };
}

