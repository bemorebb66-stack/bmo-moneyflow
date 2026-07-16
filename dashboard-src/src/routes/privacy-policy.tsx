import { createFileRoute } from "@tanstack/react-router";
import { PageHeading, PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/privacy-policy")({
  head: () => ({
    meta: [
      { title: "개인정보처리방침 | BVT Money Flow" },
      { name: "description", content: "BVT Money Flow의 개인정보 및 브라우저 저장 정보 처리 방침을 안내합니다." },
    ],
    links: [{ rel: "canonical", href: "https://www.bvtmoneyflow.xyz/privacy-policy/" }],
  }),
  component: PrivacyPolicyPage,
});

const SECTIONS = [
  {
    title: "수집하는 개인정보",
    body: "본 사이트는 회원가입, 로그인, 댓글 기능을 제공하지 않으며 이름·이메일·연락처 등 개인 식별 정보를 직접 수집하지 않습니다.",
  },
  {
    title: "브라우저 저장 정보",
    body: "화면 테마와 관심 종목 등 이용 편의를 위한 설정은 이용자의 브라우저에만 저장됩니다. 해당 정보는 서버로 전송되지 않으며 브라우저의 인터넷 사용 기록 삭제 기능으로 제거할 수 있습니다.",
  },
  {
    title: "제3자 서비스",
    body: "본 사이트는 GitHub Pages를 통해 제공됩니다. 서비스 제공 과정에서 GitHub가 접속 IP 등 표준 웹 로그를 처리할 수 있으며, 외부 사이트로 이동한 뒤에는 해당 사이트의 개인정보처리방침이 적용됩니다.",
  },
  {
    title: "광고 및 분석 도구",
    body: "현재 본 사이트는 광고를 게재하지 않으며 별도의 방문자 분석 도구를 사용하지 않습니다. 관련 도구를 도입할 경우 쿠키와 정보 처리 내용을 본 방침에 반영합니다.",
  },
  {
    title: "문의",
    body: "개인정보처리방침에 대한 문의는 사이트 하단의 서비스 문의를 이용해 주세요.",
  },
];

function PrivacyPolicyPage() {
  return (
    <PageShell>
      <PageHeading
        title="개인정보처리방침"
        description="시행일: 2026년 7월 4일"
        showDataStatus={false}
      />
      <article className="max-w-4xl space-y-7 text-sm leading-7 text-muted-foreground">
        <p className="rounded-lg border border-brand/20 bg-brand/[0.055] p-4 text-foreground">
          BVT Money Flow는 이용자의 개인정보를 소중히 여기며 관련 법령을 준수합니다.
        </p>
        {SECTIONS.map(({ title, body }, index) => (
          <section key={title} className="border-t border-border pt-5">
            <h2 className="text-base font-semibold text-foreground">
              {index + 1}. {title}
            </h2>
            <p className="mt-1.5">{body}</p>
          </section>
        ))}
      </article>
    </PageShell>
  );
}
