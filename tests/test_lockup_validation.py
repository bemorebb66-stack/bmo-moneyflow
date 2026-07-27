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

    def test_flags_unknown_ticker_for_review(self):
        result = MODULE.validate_payload(
            {"events": [{"ticker": "OLD", "ipoDate": "2025-01-01", "lockupDate": "2025-06-30", "lockupDays": 180}]},
            {"stocks": []},
        )
        row = result["events"][0]
        self.assertEqual(row["listingStatus"], "not-found")
        self.assertEqual(row["verificationStatus"], "review-needed")


if __name__ == "__main__":
    unittest.main()
