import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 32"
      aria-hidden="true"
      focusable="false"
      className={cn("h-8 w-12", className)}
    >
      <path
        d="M3 6h12c5 0 7 6 2 8H6"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 17l10 10 10-15 8 10"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M22 7h22L31 27 20 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".72"
      />
    </svg>
  );
}
