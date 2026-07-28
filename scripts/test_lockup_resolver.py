from __future__ import annotations

import unittest

from resolve_lockup_filings import accession_from_id, verify_terms


class LockupResolverTests(unittest.TestCase):
    def setUp(self) -> None:
        self.row = {
            "ticker": "TEST",
            "ipoDate": "2026-01-10",
            "lockupDays": 180,
        }
        self.filing = {
            "cik": "123",
            "accession": "0000000123-26-000001",
            "filingDate": "2026-01-09",
            "sourceUrl": "https://www.sec.gov/Archives/example.htm",
        }

    def test_accession_from_event_id(self) -> None:
        self.assertEqual(
            accession_from_id("lk-0001193125-26-159369"),
            "0001193125-26-159369",
        )

    def test_fixed_terms(self) -> None:
        result = verify_terms(
            dict(self.row),
            self.filing,
            "The lock-up restrictions continue for a period of 180 days.",
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["datePrecision"], "fixed")
        self.assertEqual(result["verificationStatus"], "confirmed")

    def test_conditional_terms(self) -> None:
        result = verify_terms(
            dict(self.row),
            self.filing,
            "The lock-up ends on the earlier of an earnings release or 180 days.",
        )
        self.assertIsNotNone(result)
        self.assertEqual(result["datePrecision"], "conditional-max")
        self.assertEqual(result["verificationStatus"], "conditional")

    def test_unmatched_terms_are_not_verified(self) -> None:
        result = verify_terms(
            dict(self.row),
            self.filing,
            "The securities are subject to transfer restrictions.",
        )
        self.assertIsNone(result)


if __name__ == "__main__":
    unittest.main()
