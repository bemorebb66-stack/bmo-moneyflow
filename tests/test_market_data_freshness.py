import unittest

import pandas as pd

from fetch_data import select_complete_market_date


class MarketDataFreshnessTests(unittest.TestCase):
    def build_prices(self):
        dates = pd.to_datetime(["2026-07-24", "2026-07-27", "2026-07-28"])
        columns = pd.MultiIndex.from_product(
            [["AAA", "BBB", "CCC", "DDD"], ["Close", "Volume"]]
        )
        prices = pd.DataFrame(index=dates, columns=columns, dtype=float)
        for ticker in ["AAA", "BBB", "CCC", "DDD"]:
            prices.loc[dates[:2], (ticker, "Close")] = [10, 11]
            prices.loc[dates[:2], (ticker, "Volume")] = [100, 110]
        prices.loc[dates[2], ("AAA", "Close")] = 12
        prices.loc[dates[2], ("AAA", "Volume")] = 120
        return prices

    def test_ignores_a_partially_populated_latest_session(self):
        market_date, coverage = select_complete_market_date(
            self.build_prices(), ["AAA", "BBB", "CCC", "DDD"]
        )

        self.assertEqual(market_date, "2026-07-27")
        self.assertEqual(coverage["2026-07-28"], 1)

    def test_uses_latest_session_when_coverage_is_complete(self):
        prices = self.build_prices()
        latest = pd.Timestamp("2026-07-28")
        for ticker in ["BBB", "CCC", "DDD"]:
            prices.loc[latest, (ticker, "Close")] = 12
            prices.loc[latest, (ticker, "Volume")] = 120

        market_date, _ = select_complete_market_date(
            prices, ["AAA", "BBB", "CCC", "DDD"]
        )

        self.assertEqual(market_date, "2026-07-28")


if __name__ == "__main__":
    unittest.main()
