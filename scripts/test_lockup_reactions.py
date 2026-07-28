from __future__ import annotations

import unittest
from datetime import date, timedelta

from build_lockup_reactions import calculate_reaction, classify_reaction


def sample_records(
    *,
    start: date = date(2026, 1, 1),
    sessions: int = 30,
    before_close: float = 100,
    after_close: float = 90,
    before_volume: int = 1_000,
    after_volume: int = 2_000,
) -> list[dict]:
    rows = []
    day = start
    for index in range(sessions):
        rows.append(
            {
                "date": day.isoformat(),
                "close": before_close if index < 20 else after_close,
                "volume": before_volume if index < 20 else after_volume,
            }
        )
        day += timedelta(days=1)
    return rows


class LockupReactionTests(unittest.TestCase):
    def test_negative_high_impact_reaction(self) -> None:
        result = calculate_reaction(
            "TEST",
            "2026-01-21",
            sample_records(),
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["priceReturn"], -10.0)
        self.assertEqual(result["tradingValueRatio"], 1.8)
        self.assertEqual(result["impact"], "high")
        self.assertEqual(result["direction"], "negative")

    def test_positive_reaction(self) -> None:
        result = calculate_reaction(
            "TEST",
            "2026-01-21",
            sample_records(after_close=108, after_volume=1_100),
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["priceReturn"], 8.0)
        self.assertEqual(result["impact"], "medium")
        self.assertEqual(result["direction"], "positive")

    def test_insufficient_history_is_not_reported(self) -> None:
        result = calculate_reaction(
            "TEST",
            "2026-01-06",
            sample_records(sessions=8),
        )
        self.assertIsNone(result)

    def test_mixed_limited_classification(self) -> None:
        self.assertEqual(classify_reaction(-2.0, 1.1), ("limited", "mixed"))


if __name__ == "__main__":
    unittest.main()
