from __future__ import annotations

import unittest

from enrich_news_summaries import enrich_payload, summarize_headline


class NewsSummaryTests(unittest.TestCase):
    def test_earnings_headline(self) -> None:
        result = summarize_headline(
            "Micron beats quarterly earnings and raises guidance",
            "마이크론 테크놀로지",
        )
        self.assertEqual(result["topic"], "실적·전망")
        self.assertEqual(result["sentiment"], "positive")
        self.assertIn("마이크론 테크놀로지", result["headlineKo"])

    def test_regulatory_risk(self) -> None:
        result = summarize_headline(
            "Company faces antitrust investigation and regulatory pressure",
            "테스트 기업",
        )
        self.assertEqual(result["topic"], "규제·법률")
        self.assertEqual(result["sentiment"], "negative")

    def test_payload_is_enriched(self) -> None:
        headline = "Shares fall after revenue warning"
        payload = {
            "companies": {
                "TEST": {
                    "company": "테스트 기업",
                    "news": [{"headline": headline}],
                }
            }
        }
        enriched = enrich_payload(
            payload,
            {headline: "매출 경고 이후 주가가 하락했습니다."},
        )
        item = enriched["companies"]["TEST"]["news"][0]
        self.assertEqual(item["summaryKo"], "매출 경고 이후 주가가 하락했습니다.")
        self.assertEqual(item["headlineKo"], item["summaryKo"])
        self.assertEqual(enriched["meta"]["koreanSummaryCount"], 1)
        self.assertEqual(enriched["meta"]["translatedSummaryCount"], 1)


if __name__ == "__main__":
    unittest.main()
