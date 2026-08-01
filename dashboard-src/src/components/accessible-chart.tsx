import type { ReactNode } from "react";

export function AccessibleChart({
  title,
  description,
  children,
  table,
}: {
  title: string;
  description: string;
  children: ReactNode;
  table?: ReactNode;
}) {
  const id = `chart-${title.replace(/[^a-zA-Z0-9가-힣]+/g, "-")}`;
  return (
    <figure
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      <figcaption className="sr-only">
        <span id={`${id}-title`}>{title}</span>
        <span id={`${id}-description`}>{description}</span>
      </figcaption>
      <div aria-hidden="true">{children}</div>
      {table && (
        <details className="chart-data-table mt-3 rounded-md border border-border/80 bg-surface-2/45">
          <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            표로 데이터 보기
          </summary>
          <div className="max-h-72 overflow-auto border-t border-border/80">
            {table}
          </div>
        </details>
      )}
    </figure>
  );
}
