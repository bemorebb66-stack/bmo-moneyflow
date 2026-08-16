import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/bvt-money-flow-logo.png"
      alt=""
      aria-hidden="true"
      width="2001"
      height="724"
      decoding="async"
      className={cn("h-10 w-auto object-contain", className)}
    />
  );
}
