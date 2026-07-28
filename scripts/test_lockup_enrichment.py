from __future__ import annotations

import json
import unittest
from pathlib import Path

from enrich_major_lockups import SEED_PATH, build_major_event, merge_major_events


class MajorLockupEnrichmentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.seeds = json.loads(Path(SEED_PATH).read_text(encoding="utf-8"))

    def test_seed_contains_25_direct_sec_sources(self) -> None:
        self.assertEqual(len(self.seeds), 25)
        self.assertEqual(len({seed["ticker"] for seed in self.seeds}), 25)
        self.assertTrue(
            all("/Archives/edgar/data/" in seed["sourceUrl"] for seed in self.seeds)
        )

    def test_fixed_lockup_uses_prospectus_date(self) -> None:
        etoro = next(seed for seed in self.seeds if seed["ticker"] == "ETOR")
        event = build_major_event(etoro)
        self.assertEqual(event["lockupDate"], "2025-11-09")
        self.assertEqual(event["verificationStatus"], "confirmed")
        self.assertEqual(event["datePrecision"], "fixed")

    def test_conditional_lockup_is_not_presented_as_exact(self) -> None:
        circle = next(seed for seed in self.seeds if seed["ticker"] == "CRCL")
        event = build_major_event(circle)
        self.assertEqual(event["maxLockupDate"], "2025-12-01")
        self.assertEqual(event["verificationStatus"], "conditional")
        self.assertEqual(event["datePrecision"], "conditional-max")
        self.assertIn("최대 예정일", event["verificationNote"])

    def test_merge_replaces_old_version_of_major_ticker(self) -> None:
        merged = merge_major_events(
            {
                "meta": {},
                "events": [
                    {"ticker": "CRCL", "lockupDate": "2099-01-01"},
                    {"ticker": "OTHER", "lockupDate": "2026-01-01"},
                ],
            },
            self.seeds,
        )
        circle_rows = [
            event for event in merged["events"] if event["ticker"] == "CRCL"
        ]
        self.assertEqual(len(circle_rows), 1)
        self.assertEqual(circle_rows[0]["lockupDate"], "2025-12-01")
        self.assertTrue(
            any(event["ticker"] == "OTHER" for event in merged["events"])
        )


if __name__ == "__main__":
    unittest.main()
