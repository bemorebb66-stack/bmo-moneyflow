import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "./ui/tooltip";
import { cn } from "@/lib/utils";

export function MetricInfo({ label, children, className }: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`${label} 설명`}
            className={cn(
              "inline-grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
              className,
            )}
          >
            <CircleHelp className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-[310px] p-3 text-xs leading-relaxed">
          <strong className="mb-1 block text-primary-foreground">{label}</strong>
          {children}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
