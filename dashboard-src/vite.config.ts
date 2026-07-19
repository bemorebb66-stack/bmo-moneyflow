import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const ROUTE_META = {
  scanner: {
    title: "미국 주식 거래대금 순위·급증 종목 스캐너 | BVT Money Flow",
    description:
      "미국 주식의 거래대금 순위와 전일·5일·20일·60일 평균 대비 변화를 확인하고, 거래대금 급증 종목을 조건별로 탐색하세요.",
  },
  stock: {
    title: "미국 주식 종목별 거래대금 상세 분석 | BVT Money Flow",
    description:
      "종목별 거래대금 변화, 가격 흐름, 섹터 내 점유율과 내부자 거래·실적 일정을 함께 확인하세요.",
  },
  insider: {
    title: "미국 주식 내부자 매수·매도 조회 | BVT Money Flow",
    description:
      "미국 상장기업 임원과 주요 주주의 내부자 매수·매도 내역을 거래일과 SEC 보고일 기준으로 확인하세요.",
  },
  "ipo-lockup": {
    title: "미국 IPO 락업 해제 일정 | BVT Money Flow",
    description:
      "미국 상장기업의 IPO 락업 해제 예정일, 예상 가치, 근거와 관련 종목 거래대금을 확인하세요.",
  },
  today: {
    title: "오늘의 미국 주식 거래대금·시장 요약 | BVT Money Flow",
    description:
      "오늘 미국 시장의 거래대금 집중 섹터, 급증 종목, 내부자 거래, 실적과 주요 이벤트를 한눈에 확인하세요.",
  },
  replay: {
    title: "미국 주식 매매 복기·시장환경 분석 | BVT Replay",
    description:
      "거래내역 CSV와 당시 거래대금·산업·시장 흐름을 연결해 반복되는 수익·손실 환경을 확인하세요.",
  },
  methodology: {
    title: "거래대금·시장 흐름 계산 기준 | BVT Money Flow",
    description:
      "BVT Money Flow의 거래대금, 점유율 변화, 기간 비교, 종목 범위와 데이터 갱신 기준을 확인하세요.",
  },
  feedback: {
    title: "데이터 오류 신고·서비스 문의 | BVT Money Flow",
    description: "BVT Money Flow의 데이터 오류를 신고하거나 서비스 관련 의견을 보내주세요.",
  },
  disclaimer: {
    title: "면책·데이터 한계 | BVT Money Flow",
    description: "BVT Money Flow가 제공하는 금융 데이터의 범위와 한계, 이용 시 유의사항을 안내합니다.",
  },
  "privacy-policy": {
    title: "개인정보처리방침 | BVT Money Flow",
    description: "BVT Money Flow의 개인정보 처리와 보호 기준을 안내합니다.",
  },
} as const;

function replaceMeta(html: string, route: string, title: string, description: string) {
  const url = `https://www.bvtmoneyflow.xyz/${route}/`;
  return html
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${description}" />`)
    .replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`)
    .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${title}" />`)
    .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${description}" />`)
    .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`)
    .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${title}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${description}" />`);
}

const routeShells = () => ({
  name: "route-shells",
  closeBundle() {
    const outputDir = resolve(
      fileURLToPath(new URL(".", import.meta.url)),
      "dist",
    );
    const shell = resolve(outputDir, "index.html");

    const html = readFileSync(shell, "utf8");
    for (const [route, meta] of Object.entries(ROUTE_META)) {
      const routeDir = resolve(outputDir, route);
      mkdirSync(routeDir, { recursive: true });
      writeFileSync(
        resolve(routeDir, "index.html"),
        replaceMeta(html, route, meta.title, meta.description),
      );
    }
  },
});

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsconfigPaths(),
    routeShells(),
  ],
  build: { outDir: "dist" },
});
