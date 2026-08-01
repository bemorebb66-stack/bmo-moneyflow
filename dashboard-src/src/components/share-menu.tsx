import { useState } from "react";
import { Check, Copy, Link2, Share2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

type ShareResult = "success" | "cancel" | "error" | "fallback";

function trackShare(
  method: "copy_link" | "copy_summary" | "web_share",
  result: ShareResult,
  period: "daily" | "weekly",
  dateKey: string,
  briefingStatus: string,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("bvt:analytics", {
      detail: {
        event: "share",
        method,
        result,
        period,
        date_key: dateKey,
        briefing_status: briefingStatus,
      },
    }),
  );
}

export async function copyText(value: string) {
  let clipboardError: unknown;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }
  if (typeof document === "undefined" || typeof document.execCommand !== "function") {
    throw clipboardError ?? new Error("Clipboard unavailable");
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    const copied = document.execCommand("copy");
    if (!copied) throw clipboardError ?? new Error("Clipboard unavailable");
  } finally {
    textarea.remove();
  }
}

export function ShareMenu({
  label = "공유",
  title = "BVT Money Flow 시장 브리핑",
  text = "BVT Money Flow에서 미국 시장 거래대금 브리핑을 확인하세요.",
  url,
  period = "daily",
  dateKey = "unknown",
  briefingStatus = "complete",
  disabled = false,
}: {
  label?: string;
  title?: string;
  text?: string;
  url?: string;
  period?: "daily" | "weekly";
  dateKey?: string;
  briefingStatus?: string;
  disabled?: boolean;
}) {
  const [feedback, setFeedback] = useState<"copied" | "error" | null>(null);
  const resolvedUrl = () =>
    url ?? (typeof window === "undefined" ? "" : window.location.href);
  const resetLater = () => window.setTimeout(() => setFeedback(null), 2200);

  const copy = async (includeSummary: boolean) => {
    const method = includeSummary ? "copy_summary" : "copy_link";
    try {
      await copyText(includeSummary ? `${text}\n${resolvedUrl()}` : resolvedUrl());
      setFeedback("copied");
      trackShare(method, "success", period, dateKey, briefingStatus);
    } catch {
      setFeedback("error");
      trackShare(method, "error", period, dateKey, briefingStatus);
    }
    resetLater();
  };

  const share = async () => {
    if (!navigator.share) {
      try {
        await copyText(`${text}\n${resolvedUrl()}`);
        setFeedback("copied");
        trackShare("web_share", "fallback", period, dateKey, briefingStatus);
      } catch {
        setFeedback("error");
        trackShare("web_share", "error", period, dateKey, briefingStatus);
      }
      resetLater();
      return;
    }
    try {
      await navigator.share({ title, text, url: resolvedUrl() });
      trackShare("web_share", "success", period, dateKey, briefingStatus);
    } catch (error) {
      const cancelled = error instanceof DOMException && error.name === "AbortError";
      trackShare(
        "web_share",
        cancelled ? "cancel" : "error",
        period,
        dateKey,
        briefingStatus,
      );
      if (!cancelled) {
        setFeedback("error");
        resetLater();
      }
    }
  };

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={disabled}
            className="min-h-10 gap-1.5 sm:min-h-8"
            aria-label={`${label} 메뉴 열기`}
          >
            {feedback === "copied" ? <Check className="text-success" /> : <Share2 />}
            {feedback === "copied" ? "복사됨" : label}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => void copy(false)} className="min-h-10">
            <Link2 /> 링크 복사
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void copy(true)} className="min-h-10">
            <Copy /> 내용과 링크 복사
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void share()} className="min-h-10">
            <Share2 /> 기기 공유
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="sr-only" role="status" aria-live="polite">
        {feedback === "copied"
          ? "클립보드에 복사했습니다."
          : feedback === "error"
            ? "공유하지 못했습니다. 다시 시도해주세요."
            : ""}
      </span>
      {feedback === "error" && (
        <p
          role="alert"
          className="absolute right-0 top-full z-50 mt-2 w-60 rounded-md border border-danger/30 bg-popover px-3 py-2 text-xs text-danger shadow-md"
        >
          공유하지 못했습니다. 브라우저 권한을 확인하고 다시 시도해주세요.
        </p>
      )}
    </div>
  );
}
