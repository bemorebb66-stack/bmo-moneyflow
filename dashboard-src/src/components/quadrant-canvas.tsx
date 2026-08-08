import { useEffect, useMemo, useRef } from "react";

export type QuadrantCanvasPoint = {
  ticker: string;
  x: number;
  y: number;
  z: number;
};

export function sampleQuadrantPoints<T extends QuadrantCanvasPoint>(
  points: T[],
  limit = 500,
) {
  if (points.length <= limit) return points;
  const quadrants = [
    points.filter((point) => point.x >= 0 && point.y > 0),
    points.filter((point) => point.x >= 0 && point.y <= 0),
    points.filter((point) => point.x < 0 && point.y > 0),
    points.filter((point) => point.x < 0 && point.y <= 0),
  ];
  const selected: T[] = [];
  for (const rows of quadrants) {
    if (!rows.length) continue;
    const quota = Math.max(1, Math.floor((rows.length / points.length) * limit));
    const ordered = [...rows].sort(
      (a, b) => b.z - a.z || a.ticker.localeCompare(b.ticker),
    );
    const stride = ordered.length / Math.min(quota, ordered.length);
    for (let index = 0; index < Math.min(quota, ordered.length); index += 1) {
      selected.push(ordered[Math.floor(index * stride)]);
    }
  }
  if (selected.length < limit) {
    const used = new Set(selected.map((point) => point.ticker));
    for (const point of [...points].sort((a, b) => b.z - a.z)) {
      if (selected.length >= limit) break;
      if (!used.has(point.ticker)) {
        selected.push(point);
        used.add(point.ticker);
      }
    }
  }
  return selected.slice(0, limit);
}

const colorFor = (point: QuadrantCanvasPoint) => {
  if (point.x >= 0 && point.y > 0) return "#178a68";
  if (point.x >= 0 && point.y <= 0) return "#c94b55";
  if (point.x < 0 && point.y > 0) return "#3f7fc4";
  return "#7c8791";
};

export function QuadrantCanvas<T extends QuadrantCanvasPoint>({
  points,
  onPointClick,
}: {
  points: T[];
  onPointClick: (point: T) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampled = useMemo(() => sampleQuadrantPoints(points), [points]);
  const hitPoints = useRef<Array<{ point: T; x: number; y: number; radius: number }>>(
    [],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, rect.width, rect.height);
      const padding = { top: 12, right: 12, bottom: 24, left: 40 };
      const width = Math.max(1, rect.width - padding.left - padding.right);
      const height = Math.max(1, rect.height - padding.top - padding.bottom);
      const yExtent = Math.max(5, ...sampled.map((point) => Math.abs(point.y)));
      const projectX = (value: number) => padding.left + ((value + 100) / 600) * width;
      const projectY = (value: number) => padding.top + ((yExtent - value) / (yExtent * 2)) * height;

      context.strokeStyle = "rgba(120, 130, 140, 0.28)";
      context.lineWidth = 1;
      for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
        const y = padding.top + height * fraction;
        context.beginPath();
        context.moveTo(padding.left, y);
        context.lineTo(padding.left + width, y);
        context.stroke();
      }
      context.strokeStyle = "rgba(100, 110, 120, 0.65)";
      context.beginPath();
      context.moveTo(projectX(0), padding.top);
      context.lineTo(projectX(0), padding.top + height);
      context.moveTo(padding.left, projectY(0));
      context.lineTo(padding.left + width, projectY(0));
      context.stroke();

      hitPoints.current = sampled.map((point) => {
        const x = projectX(point.x);
        const y = projectY(point.y);
        const radius = Math.max(2, Math.min(7, 2 + Math.log10(Math.max(1, point.z))));
        context.fillStyle = colorFor(point);
        context.globalAlpha = 0.58;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        return { point, x, y, radius };
      });
      context.globalAlpha = 1;
    };
    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [sampled]);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full cursor-crosshair"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        const nearest = hitPoints.current
          .map((item) => ({
            ...item,
            distance: Math.hypot(item.x - x, item.y - y),
          }))
          .sort((a, b) => a.distance - b.distance)[0];
        if (nearest && nearest.distance <= Math.max(12, nearest.radius + 6)) {
          onPointClick(nearest.point);
        }
      }}
    />
  );
}
