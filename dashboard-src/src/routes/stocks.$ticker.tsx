import { createFileRoute } from "@tanstack/react-router";
import { StockPage } from "./stock";

const canonicalTicker = (value: string) =>
  value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "");

export const Route = createFileRoute("/stocks/$ticker")({
  head: ({ params }) => {
    const ticker = canonicalTicker(params.ticker);
    const url = `https://www.bvtmoneyflow.xyz/stocks/${ticker.toLowerCase()}/`;
    const title = `${ticker} 미국 주식 거래대금 분석 | BVT Money Flow`;
    const description = `${ticker}의 가격, 거래대금 변화, 시가총액, 섹터와 산업 흐름을 확인합니다.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: StockPathPage,
});

function StockPathPage() {
  const { ticker } = Route.useParams();
  return <StockPage ticker={canonicalTicker(ticker)} />;
}
