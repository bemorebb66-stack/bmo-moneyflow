"""Add concise Korean interpretation fields to collected company headlines."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
NEWS_PATH = ROOT / "news.json"

POSITIVE = (
    "beat",
    "beats",
    "surge",
    "surges",
    "jump",
    "jumps",
    "rise",
    "rises",
    "record",
    "upgrade",
    "upgraded",
    "approval",
    "approved",
    "win",
    "wins",
    "growth",
    "profit",
    "partnership",
    "contract",
)
NEGATIVE = (
    "miss",
    "misses",
    "fall",
    "falls",
    "drop",
    "drops",
    "plunge",
    "plunges",
    "downgrade",
    "downgraded",
    "lawsuit",
    "probe",
    "investigation",
    "pressure",
    "risk",
    "recall",
    "layoff",
    "cuts",
    "warning",
)

TOPICS = (
    (
        "실적·전망",
        ("earnings", "revenue", "profit", "loss", "forecast", "guidance", "quarter"),
        "실적과 향후 전망을 다룬 소식입니다. 예상치 대비 결과와 회사의 가이던스를 확인하세요.",
    ),
    (
        "투자의견",
        (
            "analyst",
            "price target",
            "upgrade",
            "downgrade",
            "rating",
            "valuation",
        ),
        "증권사 평가와 목표가 관련 소식입니다. 평가 근거와 기존 시장 기대의 차이를 확인하세요.",
    ),
    (
        "인수·합병",
        ("acquisition", "acquire", "merger", "takeover", "buyout", "deal"),
        "인수·합병 또는 지분 거래 관련 소식입니다. 거래 조건과 주주 가치 변화를 확인하세요.",
    ),
    (
        "사업 확대",
        (
            "launch",
            "partnership",
            "contract",
            "order",
            "expansion",
            "customer",
            "product",
        ),
        "신제품·계약·사업 확대 관련 소식입니다. 매출 기여 시점과 계약 규모를 확인하세요.",
    ),
    (
        "규제·법률",
        (
            "lawsuit",
            "probe",
            "investigation",
            "regulation",
            "regulatory",
            "tariff",
            "ban",
            "antitrust",
        ),
        "규제·법률 위험 관련 소식입니다. 회사의 공식 대응과 재무적 영향을 확인하세요.",
    ),
    (
        "자금 조달·주식 공급",
        (
            "offering",
            "share sale",
            "convertible",
            "debt",
            "financing",
            "secondary",
        ),
        "자금 조달 또는 주식 공급 변화 관련 소식입니다. 희석 가능성과 자금 사용 목적을 확인하세요.",
    ),
    (
        "주가 변동",
        (
            "stock",
            "shares",
            "surge",
            "jump",
            "rise",
            "fall",
            "drop",
            "plunge",
            "sell off",
        ),
        "주가 변동 배경을 다룬 소식입니다. 일시적 수급인지 실적·사업 변화인지 구분해 확인하세요.",
    ),
)


def classify_sentiment(headline: str) -> str:
    text = headline.lower()
    positive = sum(phrase in text for phrase in POSITIVE)
    negative = sum(phrase in text for phrase in NEGATIVE)
    if positive > negative:
        return "positive"
    if negative > positive:
        return "negative"
    return "neutral"


def summarize_headline(headline: str, company: str) -> dict[str, str]:
    normalized = re.sub(r"\s+", " ", headline).strip()
    lowered = normalized.lower()
    topic = "기업 동향"
    summary = (
        f"{company}의 최근 사업·시장 동향을 다룬 소식입니다. "
        "원문에서 발표 주체와 구체적인 수치를 확인하세요."
    )
    for label, keywords, template in TOPICS:
        if any(keyword in lowered for keyword in keywords):
            topic = label
            summary = template
            break
    sentiment = classify_sentiment(normalized)
    sentiment_label = {
        "positive": "긍정",
        "negative": "부정",
        "neutral": "중립",
    }[sentiment]
    return {
        "headlineKo": f"{company} {topic} 관련 {sentiment_label} 소식",
        "summaryKo": summary,
        "topic": topic,
        "sentiment": sentiment,
    }


def enrich_payload(payload: dict[str, Any]) -> dict[str, Any]:
    companies = payload.get("companies", {})
    enriched = 0
    for company_payload in companies.values():
        company = str(company_payload.get("company") or "해당 기업")
        for item in company_payload.get("news", []):
            headline = str(item.get("headline") or "").strip()
            if not headline:
                continue
            item.update(summarize_headline(headline, company))
            enriched += 1
    meta = dict(payload.get("meta", {}))
    meta["koreanSummaryCount"] = enriched
    meta["summaryMethod"] = "헤드라인 기반 한국어 주제·핵심 확인사항 분류"
    payload["meta"] = meta
    return payload


def main() -> None:
    if not NEWS_PATH.exists():
        print("news.json does not exist; skipping summaries.")
        return
    payload = json.loads(NEWS_PATH.read_text(encoding="utf-8"))
    enriched = enrich_payload(payload)
    NEWS_PATH.write_text(
        json.dumps(enriched, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Added {enriched['meta'].get('koreanSummaryCount', 0)} Korean news summaries."
    )


if __name__ == "__main__":
    main()
