import { useState } from "react";
import { Check, Copy, Download, MessageCircle, Share2 } from "lucide-react";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { LIVE_META, SECTORS, SURGE_STOCKS } from "@/lib/mock-data";
import { fmtBp, fmtMoney } from "@/lib/format";

function briefingText() {
  const top = [...SECTORS].sort((a, b) => b.shareDelta - a.shareDelta)[0];
  const total = SECTORS.reduce((sum, row) => sum + row.volume, 0);
  return `${LIVE_META.asOf} 미국 시장 거래대금은 ${fmtMoney(total)}이며, ${top.name}의 거래대금 점유율이 ${fmtBp(top.shareDelta)} 확대됐습니다.\nBVT Money Flow에서 자세히 보기`;
}

async function copyText(value: string) {
  await navigator.clipboard.writeText(value);
}

function trackShare(action: string) {
  const detail = { event: "summary_share_click", market_date: LIVE_META.asOf, action };
  window.dispatchEvent(new CustomEvent("bvt:analytics", { detail }));
  const dataLayer = (window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer;
  dataLayer?.push(detail);
}

function saveBriefingImage() {
  const topSector = [...SECTORS].sort((a, b) => b.shareDelta - a.shareDelta)[0];
  const topStocks = [...SURGE_STOCKS].sort((a, b) => b.volumeRatio - a.volumeRatio).slice(0, 3);
  const total = SECTORS.reduce((sum, row) => sum + row.volume, 0);
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#f5f8fc";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, 0, 18, canvas.height);
  ctx.fillStyle = "#0b1f36";
  ctx.font = "700 30px Arial, sans-serif";
  ctx.fillText("BVT MONEY FLOW", 80, 92);
  ctx.fillStyle = "#64748b";
  ctx.font = "22px Arial, sans-serif";
  ctx.fillText(`${LIVE_META.asOf} 미국 장 마감 브리핑`, 80, 132);
  ctx.fillStyle = "#0b1f36";
  ctx.font = "700 54px Arial, sans-serif";
  ctx.fillText(`${topSector.name} 거래 관심 확대`, 80, 230);
  ctx.fillStyle = "#2563eb";
  ctx.font = "700 42px Arial, sans-serif";
  ctx.fillText(`점유율 ${fmtBp(topSector.shareDelta)}`, 80, 290);
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#dbe4ef";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(70, 345, 1060, 190, 12);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#64748b";
  ctx.font = "18px Arial, sans-serif";
  ctx.fillText(`전체 거래대금  ${fmtMoney(total)}`, 105, 390);
  ctx.fillText("20일 평균 대비 급증 종목", 105, 435);
  topStocks.forEach((stock, index) => {
    ctx.fillStyle = "#0b1f36";
    ctx.font = "700 24px Arial, sans-serif";
    ctx.fillText(stock.ticker, 105 + index * 325, 490);
    ctx.fillStyle = "#059669";
    ctx.font = "700 21px Arial, sans-serif";
    ctx.fillText(`${stock.volumeRatio.toFixed(1)}배`, 205 + index * 325, 490);
  });
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `bvt-money-flow-${LIVE_META.asOf}.png`;
    link.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export function ShareMenu({ label = "공유" }: { label?: string }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    trackShare("native_share");
    const url = window.location.href;
    const text = briefingText();
    if (navigator.share) await navigator.share({ title: "BVT Money Flow 시장 브리핑", text, url }).catch(() => undefined);
    else {
      await copyText(`${text}\n${url}`);
      setCopied(true);
    }
  };
  const copy = async () => {
    trackShare("copy_link");
    await copyText(window.location.href);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const shareX = () => {
    trackShare("x_share");
    const url = `https://x.com/intent/post?text=${encodeURIComponent(briefingText())}&url=${encodeURIComponent(window.location.href)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="min-h-10 gap-1.5 sm:min-h-8">
          {copied ? <Check className="text-success" /> : <Share2 />}
          {copied ? "복사됨" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onSelect={copy} className="min-h-10"><Copy /> 링크 복사</DropdownMenuItem>
        <DropdownMenuItem onSelect={share} className="min-h-10"><MessageCircle /> 카카오톡 등 공유</DropdownMenuItem>
        <DropdownMenuItem onSelect={shareX} className="min-h-10"><Share2 /> X에 공유</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { trackShare("save_image"); saveBriefingImage(); }} className="min-h-10"><Download /> 이미지로 저장</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
