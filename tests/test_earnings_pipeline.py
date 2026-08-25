from __future__ import annotations

import unittest
from datetime import date

from fetch_earnings import (
    build_earnings_universe,
    merge_events,
    merge_with_existing,
    limit_reported_history,
    merge_reported_history,
    normalize_event,
    normalize_reported_financials,
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

    def test_near_term_event_tickers_are_prioritized(self) -> None:
        universe = build_earnings_universe(self.market)
        selected = select_supplemental_tickers(
            self.market,
            universe,
            date(2026, 7, 29),
            limit=1,
            priority_tickers=["IONQ"],
        )
        self.assertEqual(selected, ["IONQ"])

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
        api = [
            {
                "ticker": "STX",
                "date": "2026-07-28",
                "epsActual": 5.71,
                "source": "Finnhub",
            }
        ]
        manual = [
            {
                "ticker": "stx",
                "date": "2026-07-28",
                "epsActual": None,
                "confirmed": True,
                "source": "Seagate IR",
            }
        ]
        merged = merge_events(api, manual)
        self.assertEqual(merged[0]["ticker"], "STX")
        self.assertEqual(merged[0]["epsActual"], 5.71)
        self.assertTrue(merged[0]["confirmed"])
        self.assertEqual(merged[0]["source"], "Seagate IR")

    def test_known_future_schedule_is_retained_when_provider_omits_it(self) -> None:
        existing = [
            {
                "ticker": "NVDA",
                "date": "2026-08-26",
                "year": 2027,
                "quarter": 2,
            }
        ]
        merged = merge_with_existing(existing, [], date(2026, 7, 30))
        self.assertEqual(merged[0]["date"], "2026-08-26")

    def test_fresh_schedule_replaces_old_date_for_same_period(self) -> None:
        existing = [
            {
                "ticker": "AMD",
                "date": "2026-08-03",
                "year": 2026,
                "quarter": 2,
            }
        ]
        fresh = [
            {
                "ticker": "AMD",
                "date": "2026-08-04",
                "year": 2026,
                "quarter": 2,
            }
        ]
        merged = merge_with_existing(existing, fresh, date(2026, 7, 30))
        self.assertEqual([row["date"] for row in merged], ["2026-08-04"])

    def test_reported_history_is_limited_per_ticker_without_dropping_schedule(self) -> None:
        events = [
            {
                "ticker": "AAA",
                "date": f"2025-{month:02d}-01",
                "epsActual": float(month),
            }
            for month in range(1, 7)
        ] + [{"ticker": "AAA", "date": "2026-09-01", "status": "scheduled"}]
        limited = limit_reported_history(events, max_quarters=4)
        self.assertEqual(
            len([row for row in limited if row.get("epsActual") is not None]),
            4,
        )
        self.assertTrue(any(row.get("status") == "scheduled" for row in limited))

    def test_reported_financials_become_quarterly_actual_history(self) -> None:
        payload = {
            "data": [
                {
                    "year": 2026,
                    "quarter": 2,
                    "filedDate": "2026-08-20 16:10:00",
                    "report": {
                        "ic": [
                            {"concept": "Revenues", "value": 13_900_000_000},
                            {"concept": "NetIncomeLoss", "value": 10_700_000_000},
                            {"concept": "EarningsPerShareDiluted", "value": 1.23},
                        ]
                    },
                }
            ]
        }
        rows = normalize_reported_financials(
            payload,
            "NVDA",
            {"NVDA": "엔비디아"},
            {"NVDA": "core-index"},
            date(2025, 1, 1),
        )
        self.assertEqual(rows[0]["date"], "2026-08-20")
        self.assertEqual(rows[0]["revenueActual"], 13_900_000_000)
        self.assertEqual(rows[0]["netIncomeActual"], 10_700_000_000)
        self.assertEqual(rows[0]["epsActual"], 1.23)

    def test_reported_history_enriches_matching_calendar_period(self) -> None:
        calendar = [{"ticker": "NVDA", "date": "2026-08-26", "year": 2026, "quarter": 2, "epsEstimate": 1.2}]
        reported = [{"ticker": "NVDA", "date": "2026-08-20", "year": 2026, "quarter": 2, "revenueActual": 13_900_000_000}]
        merged = merge_reported_history(calendar, reported)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["date"], "2026-08-26")
        self.assertEqual(merged[0]["revenueActual"], 13_900_000_000)


if __name__ == "__main__":
    unittest.main()
