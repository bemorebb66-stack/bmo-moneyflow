from __future__ import annotations

import unittest
from datetime import date

from fetch_earnings import (
    build_earnings_universe,
    merge_events,
    normalize_event,
    select_supplemental_tickers,
)


class EarningsPipelineTests(unittest.TestCase):
    def setUp(self) -> None:
        self.market = {
            "stocks": [
                {
                    "t": "STX",
                    "nko": "씨게이트",
                    "uni": ["S&P 500", "Nasdaq 100"],
                    "dv": 4_000,
                },
                {
                    "t": "IONQ",
                    "nko": "아이온큐",
                    "uni": ["Russell 2000"],
                    "dv": 500,
                },
                {
                    "t": "R2000",
                    "nko": "인기 소형주",
                    "uni": ["Russell 2000"],
                    "dv": 1_000,
                },
            ]
        }

    def test_core_and_theme_universe(self) -> None:
        universe = build_earnings_universe(self.market)
        self.assertEqual(universe["STX"], "core-index")
        self.assertEqual(universe["IONQ"], "theme")
        self.assertEqual(universe["R2000"], "popular-small-cap")

    def test_liquid_core_is_supplemented(self) -> None:
        universe = build_earnings_universe(self.market)
        selected = select_supplemental_tickers(
            self.market, universe, date(2026, 7, 29), limit=10
        )
        self.assertIn("STX", selected)
        self.assertIn("IONQ", selected)

    def test_normalize_event_marks_tracking_tier(self) -> None:
        event = normalize_event(
            {
                "symbol": "STX",
                "date": "2026-07-28",
                "hour": "amc",
                "epsActual": 5.71,
            },
            {"STX": "씨게이트"},
            {"STX": "core-index"},
        )
        self.assertEqual(event["trackingTier"], "core-index")
        self.assertEqual(event["epsActual"], 5.71)

    def test_manual_event_overrides_api_event(self) -> None:
        api = [{"ticker": "STX", "date": "2026-07-28", "epsActual": None}]
        manual = [{"ticker": "stx", "date": "2026-07-28", "epsActual": 5.71}]
        merged = merge_events(api, manual)
        self.assertEqual(merged[0]["ticker"], "STX")
        self.assertEqual(merged[0]["epsActual"], 5.71)


if __name__ == "__main__":
    unittest.main()
