import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "fetch_news.py"
SPEC = importlib.util.spec_from_file_location("fetch_news", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class NewsPipelineTests(unittest.TestCase):
    def test_priority_tickers_deduplicates_volume_and_surge_lists(self):
        market = {
            "stocks": [
                {"t": "AAA", "dv": 1000, "a20": 1000},
                {"t": "BBB", "dv": 500, "a20": 10},
                {"t": "CCC", "dv": 100, "a20": 100},
            ]
        }
        result = MODULE.priority_tickers(market)
        self.assertEqual(len(result), len(set(result)))
        self.assertIn("AAA", result)
        self.assertIn("BBB", result)

    def test_clean_headline_normalizes_whitespace(self):
        self.assertEqual(
            MODULE.clean_headline("  New   product\nannounced  "),
            "New product announced",
        )

    def test_company_aliases_remove_generic_suffixes(self):
        aliases = MODULE.company_aliases(
            "MRVL", "Marvell Technology, Inc.", "Marvell Technology Group Ltd"
        )
        self.assertIn("mrvl", aliases)
        self.assertIn("marvell", aliases)
        self.assertNotIn("technology", aliases)

    def test_relevance_filter_rejects_unrelated_company_news(self):
        self.assertFalse(
            MODULE.is_relevant_headline(
                {"headline": "Tesla shares rise after delivery update"},
                "NVDA",
                "NVIDIA Corporation",
            )
        )
        self.assertTrue(
            MODULE.is_relevant_headline(
                {"headline": "Nvidia launches a new AI chip platform"},
                "NVDA",
                "NVIDIA Corporation",
            )
        )
        self.assertTrue(
            MODULE.is_relevant_headline(
                {"headline": "NVDA earnings: what investors should watch"},
                "NVDA",
                "NVIDIA Corporation",
            )
        )

    def test_existing_profile_is_reused_only_when_links_are_complete(self):
        self.assertTrue(
            MODULE.profile_is_complete(
                {
                    "website": "https://www.nvidia.com/",
                    "logo": "https://example.com/nvda.png",
                }
            )
        )
        self.assertFalse(
            MODULE.profile_is_complete(
                {"website": "https://www.nvidia.com/", "logo": ""}
            )
        )

    def test_missing_or_invalid_existing_payload_returns_empty_companies(self):
        original_output = MODULE.OUTPUT
        MODULE.OUTPUT = Path(__file__).with_name("missing-news-fixture.json")
        try:
            self.assertEqual(MODULE.load_existing_companies(), {})
        finally:
            MODULE.OUTPUT = original_output


if __name__ == "__main__":
    unittest.main()
