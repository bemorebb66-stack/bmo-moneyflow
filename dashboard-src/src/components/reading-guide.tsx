import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "./ui/accordion";
import { BookOpen } from "lucide-react";
import { Card, CardContent } from "./ui/card";

const ITEMS = [
  {
    q: "'매수 유입'과 '매도 출회'는 어떻게 구분하나요?",
    a: "거래대금이 20일 평균 대비 크게 증가한 상태에서 가격이 함께 상승하면 매수 유입, 함께 하락하면 매도 출회로 분류합니다. 방향과 강도를 동시에 봐야 자금 흐름의 성격을 알 수 있습니다.",
  },
  {
    q: "'관심 이탈' 신호는 무엇을 뜻하나요?",
    a: "거래대금이 평균을 뚜렷하게 하회해 시장 참여자의 관심이 줄어든 구간입니다. 가격 방향과 무관하게 유동성이 감소하고 있음을 의미하며, 추세 확인이 어려운 상태입니다.",
  },
  {
    q: "점유율 Δ(bp)는 어떻게 읽나요?",
    a: "해당 섹터가 전체 거래대금에서 차지하는 비중의 변화입니다. 100bp = 1%p이며, 양수면 시장 자금이 해당 섹터로 이동, 음수면 이탈했다는 뜻입니다.",
  },
  {
    q: "지수화와 시장 점유율 차트는 어떻게 다른가요?",
    a: "지수화는 기간 시작을 100으로 두고 상대 성과를 보여 주는 반면, 시장 점유율은 전체 거래대금 대비 비중의 절대 수준을 보여줍니다. 로테이션의 방향은 점유율, 성과는 지수화로 판단하세요.",
  },
  {
    q: "데이터는 언제 갱신되고 어디에서 가져오나요?",
    a: "미국 정규장 마감 데이터를 기준으로 다음 갱신 때 반영합니다. 시장 가격·거래대금과 SEC 공시 데이터를 정리하며, 휴장일에는 직전 거래일 값을 표시합니다. 투자 판단 전에는 거래소와 SEC의 원본 자료를 함께 확인하세요.",
  },
];

export function ReadingGuide() {
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-brand" />
          <h2 className="text-base font-semibold sm:text-lg">읽는 법</h2>
        </div>
        <Accordion type="single" collapsible className="w-full">
          {ITEMS.map((item, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">
                {item.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  );
}
