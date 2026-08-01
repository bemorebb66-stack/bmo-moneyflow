import { Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { useWatchlist } from "@/lib/user-library";

export function SaveStockButton({
  ticker,
  showLabel = false,
  className,
  onChanged,
}: {
  ticker: string;
  showLabel?: boolean;
  className?: string;
  onChanged?: (watched: boolean) => void;
}) {
  const watchlist = useWatchlist();
  const watched = watchlist.has(ticker);
  const label = watched
    ? `${ticker} 관심종목에서 제거`
    : `${ticker} 관심종목 추가`;

  return (
    <Button
      type="button"
      variant="outline"
      size={showLabel ? "sm" : "icon"}
      aria-label={label}
      aria-pressed={watched}
      title={label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        const result = watchlist.toggle(ticker);
        if (!result.ok) {
          toast.error(
            result.reason === "limit"
              ? "관심종목은 최대 500개까지 저장할 수 있습니다."
              : "관심종목을 변경할 수 없습니다.",
          );
          return;
        }
        const message = watched
          ? `${ticker}를 관심종목에서 제거했습니다.`
          : `${ticker}를 관심종목에 추가했습니다.`;
        result.persistent
          ? toast.success(message)
          : toast.warning(message, {
              description: "브라우저 저장 공간을 사용할 수 없어 이번 세션에만 유지됩니다.",
            });
        onChanged?.(!watched);
      }}
      className={cn(
        showLabel ? "gap-1.5" : "h-10 w-10",
        watched && "border-brand/35 bg-brand/10 text-brand",
        className,
      )}
    >
      <Star className={cn("h-4 w-4", watched && "fill-current")} />
      {showLabel && (watched ? "관심종목 저장됨" : "관심종목 저장")}
    </Button>
  );
}
