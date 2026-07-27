import unittest

from scripts.build_stock_directory import build_directory


class StockDirectoryTest(unittest.TestCase):
    def test_keeps_common_stock_and_excludes_warrants_and_units(self):
        rows = [
            {
                "symbol": "FLNC",
                "name": "Fluence Energy, Inc. Class A Common Stock",
                "sector": "Industrials",
                "industry": "Electrical Products",
                "marketCap": "2500000000",
                "ipoyear": "2021",
            },
            {"symbol": "TESTW", "name": "Test Corp Warrant"},
            {"symbol": "TESTU", "name": "Test Corp Units"},
        ]

        result = build_directory(rows)

        self.assertEqual([row["ticker"] for row in result], ["FLNC"])
        self.assertEqual(result[0]["marketCap"], 2500000000)

    def test_deduplicates_tickers(self):
        result = build_directory(
            [
                {"symbol": "ABC", "name": "ABC Common Stock"},
                {"symbol": "ABC", "name": "ABC Corporation Common Stock"},
            ]
        )

        self.assertEqual(len(result), 1)


if __name__ == "__main__":
    unittest.main()
