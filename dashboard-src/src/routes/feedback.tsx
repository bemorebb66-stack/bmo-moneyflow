import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Bug, Check, Clipboard, ExternalLink, MessageSquare } from "lucide-react";
import { PageHeading, PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LIVE_META } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/feedback")({
  head: () => ({
    meta: [
      { title: "오류 신고·서비스 문의 | BVT Money Flow" },
      { name: "description", content: "BVT Money Flow의 데이터 오류를 신고하거나 서비스 개선 의견을 보내주세요." },
      { name: "robots", content: "noindex,follow" },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/feedback/" }],
  }),
  component: FeedbackPage,
});

type FeedbackType = "data" | "contact";

function initialParams() {
  if (typeof window === "undefined") return { type: "data" as FeedbackType, page: "/" };
  const params = new URLSearchParams(window.location.search);
  return {
    type: params.get("type") === "contact" ? "contact" as FeedbackType : "data" as FeedbackType,
    page: params.get("page") || document.referrer || "/",
  };
}

function FeedbackPage() {
  const [initial] = useState(initialParams);
  const [type, setType] = useState<FeedbackType>(initial.type);
  const [page, setPage] = useState(initial.page);
  const [ticker, setTicker] = useState("");
  const [category, setCategory] = useState("수치 오류");
  const [description, setDescription] = useState("");
  const [copied, setCopied] = useState(false);

  const report = useMemo(() => [
    `유형: ${type === "data" ? "데이터 오류 신고" : "서비스 문의"}`,
    `현재 페이지: ${page || "미입력"}`,
    `데이터 기준일: ${LIVE_META.asOf}`,
    `종목: ${ticker || "해당 없음"}`,
    `오류/문의 분류: ${category}`,
    `사용 중인 필터: ${page.includes("#") ? page.split("#")[1] : "확인 필요"}`,
    "",
    "설명:",
    description || "내용을 입력해주세요.",
  ].join("\n"), [category, description, page, ticker, type]);

  const copyReport = async () => {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  const openIssue = () => {
    const title = type === "data" ? `[데이터 오류] ${ticker || page}` : `[서비스 문의] ${category}`;
    window.open(`https://github.com/bemorebb66-stack/bmo-moneyflow/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(report)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <PageShell>
      <PageHeading
        title="오류 신고·서비스 문의"
        description="잘못된 데이터나 누락된 정보를 발견하셨나요? 확인 후 최대한 빠르게 수정하겠습니다."
        showDataStatus={false}
      />
      <div className="max-w-3xl rounded-lg border border-border bg-surface p-4 sm:p-6">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-surface-2 p-1">
          <TypeButton active={type === "data"} onClick={() => { setType("data"); setCategory("수치 오류"); }} icon={<Bug />} label="데이터 오류 신고" />
          <TypeButton active={type === "contact"} onClick={() => { setType("contact"); setCategory("기능 제안"); }} icon={<MessageSquare />} label="서비스 문의" />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="현재 페이지" className="sm:col-span-2">
            <Input value={page} onChange={(event) => setPage(event.target.value)} />
          </Field>
          <Field label="기준일">
            <Input value={LIVE_META.asOf} readOnly className="bg-surface-2" />
          </Field>
          <Field label="종목명 또는 티커">
            <Input value={ticker} onChange={(event) => setTicker(event.target.value)} placeholder="예: NVDA" />
          </Field>
          <Field label={type === "data" ? "오류 유형" : "문의 유형"} className="sm:col-span-2">
            <select value={category} onChange={(event) => setCategory(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
              {(type === "data"
                ? ["수치 오류", "종목 누락", "기업명·분류 오류", "업데이트 지연", "화면 작동 오류", "기타"]
                : ["기능 제안", "서비스 사용 문의", "제휴·협업", "기타"]
              ).map((item) => <option key={item}>{item}</option>)}
            </select>
          </Field>
          <Field label="설명" className="sm:col-span-2">
            <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="어떤 화면에서 무엇이 잘못되었는지 적어주세요." className="min-h-32" />
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={copyReport} className="min-h-10">
            {copied ? <Check className="text-success" /> : <Clipboard />}{copied ? "내용 복사됨" : "신고 내용 복사"}
          </Button>
          <Button onClick={openIssue} disabled={!description.trim()} className="min-h-10 bg-brand text-brand-foreground hover:bg-brand/90">
            신고·문의 보내기 <ExternalLink />
          </Button>
        </div>
        <p className="mt-3 text-right text-[11px] text-muted-foreground">보내기 버튼은 입력 내용을 담아 BVT Money Flow 공개 문의 창을 엽니다.</p>
      </div>
    </PageShell>
  );
}

function TypeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("inline-flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold transition-colors [&_svg]:h-4 [&_svg]:w-4", active ? "bg-surface text-brand shadow-sm" : "text-muted-foreground hover:text-foreground")}>{icon}{label}</button>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <label className={cn("grid gap-1.5 text-xs font-medium text-foreground", className)}><span>{label}</span>{children}</label>;
}
