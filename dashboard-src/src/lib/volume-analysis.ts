export interface VolumePoint {
  date: string;
  value: number;
}

export interface VolumeTrendPoint extends VolumePoint {
  ma5: number | null;
  ma20: number | null;
}

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function buildVolumeTrend(points: VolumePoint[]): VolumeTrendPoint[] {
  return points.map((point, index) => {
    const values5 = points
      .slice(Math.max(0, index - 4), index + 1)
      .map((row) => row.value);
    const values20 = points
      .slice(Math.max(0, index - 19), index + 1)
      .map((row) => row.value);
    return {
      ...point,
      ma5: values5.length === 5 ? average(values5) : null,
      ma20: values20.length === 20 ? average(values20) : null,
    };
  });
}

export function isLatestVolumeBreakout20(points: VolumePoint[]) {
  const trend = buildVolumeTrend(points);
  const current = trend.at(-1);
  const previous = trend.at(-2);
  return Boolean(
    current?.ma20 != null &&
    previous?.ma20 != null &&
    previous.value <= previous.ma20 &&
    current.value > current.ma20,
  );
}

export function calculateVolumeMomentum(points: VolumePoint[]) {
  const trend = buildVolumeTrend(points);
  const current = trend.at(-1);
  if (
    !current ||
    current.ma20 == null ||
    current.ma5 == null ||
    current.ma20 <= 0
  )
    return null;

  const currentRatio = current.value / current.ma20;
  const shortRatio = current.ma5 / current.ma20;
  const recent = trend.slice(-5).filter((row) => row.ma20 != null);
  const persistence = recent.length
    ? recent.filter((row) => row.value > (row.ma20 ?? Infinity)).length /
      recent.length
    : 0;

  const currentComponent = clamp(currentRatio / 2, 0, 1) * 50;
  const trendComponent = clamp(shortRatio / 1.5, 0, 1) * 30;
  return Math.round(currentComponent + trendComponent + persistence * 20);
}

export function volumeMomentumLabel(score: number | null) {
  if (score == null) return "계산 불가";
  if (score >= 80) return "매우 강함";
  if (score >= 65) return "강함";
  if (score >= 45) return "보통";
  return "약함";
}
