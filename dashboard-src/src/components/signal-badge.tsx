import { ArrowDownRight, ArrowUpRight, Minus, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIGNAL_META, type Signal } from "@/lib/mock-data";

const TONE: Record<string, string> = {
  success:
    "border-success/25 bg-success/10 text-success dark:bg-success/15",
  danger:
    "border-danger/25 bg-danger/10 text-danger dark:bg-danger/15",
  info:
    "border-info/25 bg-info/10 text-info dark:bg-info/15",
  muted: "border-border bg-muted text-muted-foreground",
};

const ICONS: Record<Signal, React.ComponentType<{ className?: string }>> = {
  inflow: ArrowUpRight,
  outflow: ArrowDownRight,
  "attention-loss": EyeOff,
  neutral: Minus,
};

export function SignalBadge({
  signal,
  className,
  size = "sm",
}: {
  signal: Signal;
  className?: string;
  size?: "xs" | "sm";
}) {
  const meta = SIGNAL_META[signal];
  const Icon = ICONS[signal];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border font-medium",
        TONE[meta.tone],
        size === "xs" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      <Icon className={size === "xs" ? "h-2.5 w-2.5" : "h-3 w-3"} aria-hidden />
      {meta.label}
    </span>
  );
}

export function DeltaText({
  value,
  suffix = "%",
  digits = 2,
  className,
}: {
  value: number;
  suffix?: string;
  digits?: number;
  className?: string;
}) {
  const pos = value > 0;
  const zero = value === 0;
  const Icon = pos ? ArrowUpRight : zero ? Minus : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 tabular font-medium",
        pos ? "text-success" : zero ? "text-muted-foreground" : "text-danger",
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {pos ? "+" : ""}
      {value.toFixed(digits)}
      {suffix}
    </span>
  );
}

