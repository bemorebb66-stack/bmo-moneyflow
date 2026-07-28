import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "scripts" / "validate_lockup_data.py"
SPEC = importlib.util.spec_from_file_location("validate_lockup_data", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader
SPEC.loader.exec_module(MODULE)


class LockupValidationTests(unittest.TestCase):
    def test_marks_listed_event_as_estimated(self):
        result = MODULE.validate_payload(
            {"events": [{"ticker": "TEST", "ipoDate": "2026-01-01", "lockupDate": "2026-06-30", "lockupDays": 180}]},
            {"stocks": [{"ticker": "TEST"}]},
        )
        row = result["events"][0]
        self.assertEqual(row["listingStatus"], "listed")
        self.assertEqual(row["verificationStatus"], "estimated")
        self.assertIn("sec.gov", row["sourceUrl"])
        self.assertEqual(row["sourceLabel"], "SEC 424B4 검색")
        self.assertTrue(row["validationChecks"]["dateConsistent"])

    def test_excludes_unknown_ticker_from_public_events(self):
        result = MODULE.validate_payload(
            {"events": [{"ticker": "OLD", "ipoDate": "2025-01-01", "lockupDate": "2025-06-30", "lockupDays": 180}]},
            {"stocks": []},
        )
        self.assertEqual(result["events"], [])
        row = result["excludedEvents"][0]
        self.assertEqual(row["listingStatus"], "not-found")
        self.assertEqual(row["verificationStatus"], "review-needed")
        self.assertEqual(result["meta"]["excludedCount"], 1)

    def test_excludes_inconsistent_lockup_date(self):
        result = MODULE.validate_payload(
            {"events": [{"ticker": "TEST", "ipoDate": "2026-01-01", "lockupDate": "2026-02-01", "lockupDays": 180}]},
            {"stocks": [{"ticker": "TEST"}]},
        )
        self.assertEqual(result["events"], [])
        self.assertIn("계산 결과", result["excludedEvents"][0]["exclusionReason"])

    def test_preserves_confirmed_filing_and_deduplicates(self):
        search_event = {
            "ticker": "TEST",
            "ipoDate": "2026-01-01",
            "lockupDate": "2026-06-30",
            "lockupDays": 180,
        }
        confirmed_event = {
            **search_event,
            "verificationStatus": "confirmed",
            "sourceUrl": "https://www.sec.gov/Archives/edgar/data/1/filing.htm",
        }
        result = MODULE.validate_payload(
            {"events": [search_event, confirmed_event]},
            {"stocks": [{"ticker": "TEST"}]},
        )
        self.assertEqual(len(result["events"]), 1)
        self.assertEqual(result["events"][0]["verificationStatus"], "confirmed")
        self.assertEqual(result["events"][0]["sourceLabel"], "SEC 424B4 원문")
        self.assertEqual(result["meta"]["excludedCount"], 1)


if __name__ == "__main__":
    unittest.main()
