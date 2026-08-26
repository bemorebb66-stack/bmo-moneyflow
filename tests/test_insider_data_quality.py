from __future__ import annotations

import json
import sys
import unittest
from copy import deepcopy
from decimal import Decimal
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = ROOT / "scripts"
FIXTURES = Path(__file__).resolve().parent / "fixtures" / "insider"
sys.path.insert(0, str(SCRIPTS))

from insider_data_quality import (  # noqa: E402
    aggregate_transactions,
    build_dataset,
    load_market_fixture,
    normalize_ticker,
    parse_form4_xml,
    parse_form_index,
    reconcile_amendments,
    validate_public_dataset,
    validate_transactions,
)


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


class InsiderDataQualityTests(unittest.TestCase):
    def setUp(self) -> None:
        self.market = load_market_fixture(FIXTURES / "market-prices.json")
        self.psx_original = parse_form4_xml(
            fixture("psx-original.xml"),
            accession="0001534701-26-000026",
            filed_date="2026-07-21",
            sec_url="https://www.sec.gov/psx-original.xml",
        )
        self.psx_amendment = parse_form4_xml(
            fixture("psx-amendment.xml"),
            accession="0001772603-26-000012",
            filed_date="2026-07-21",
            sec_url="https://www.sec.gov/psx-amendment.xml",
        )
        self.nmm_original = parse_form4_xml(
            fixture("nmm-original.xml"),
            accession="0001193125-26-318541",
            filed_date="2026-07-27",
            sec_url="https://www.sec.gov/nmm-original.xml",
        )

    def test_form_index_deduplicates_issuer_and_reporting_owner_rows(self) -> None:
        refs = parse_form_index(fixture("duplicate-form-index.idx"))
        self.assertEqual(2, len(refs))
        self.assertEqual(
            {"0001534701-26-000026", "0001772603-26-000012"},
            {row.accession for row in refs},
        )
        self.assertEqual({"4", "4/A"}, {row.form_type for row in refs})

    def test_exchange_decorated_tickers_are_normalized(self) -> None:
        self.assertEqual("VTEX", normalize_ticker("NYSE: VTEX"))
        self.assertEqual("CALX", normalize_ticker("(CALX)"))
        self.assertEqual("BRK.B", normalize_ticker("BRK.B"))

    def test_psx_partial_amendment_replaces_only_corrected_transaction(self) -> None:
        legs, pending, filings = reconcile_amendments(
            [self.psx_original, self.psx_original, self.psx_amendment]
        )
        self.assertEqual(2, len(filings))
        self.assertEqual([], pending)
        self.assertEqual(2, len(legs))
        by_date = {row["txDate"]: row for row in legs}
        self.assertEqual(Decimal("211.0082"), by_date["2026-07-20"]["price"])
        self.assertEqual(Decimal("211.0482"), by_date["2026-07-21"]["price"])
        self.assertEqual(
            ["0001534701-26-000026", "0001772603-26-000012"],
            by_date["2026-07-21"]["sourceAccessions"],
        )

        accepted, validation_pending, _ = validate_transactions(legs, self.market)
        self.assertEqual([], validation_pending)
        rows = aggregate_transactions(accepted)
        self.assertEqual(2, len(rows))
        self.assertEqual(4086, sum(row["shares"] for row in rows))
        self.assertAlmostEqual(862320.43, sum(row["value"] for row in rows), places=2)

    def test_nmm_bad_decimal_is_quarantined_without_losing_valid_legs(self) -> None:
        legs, pending, _ = reconcile_amendments([self.nmm_original, self.nmm_original])
        self.assertEqual([], pending)
        accepted, validation_pending, coverage = validate_transactions(legs, self.market)
        self.assertEqual(2, len(accepted))
        self.assertEqual(1, len(validation_pending))
        self.assertEqual("NMM", validation_pending[0]["ticker"])
        reason_codes = {
            reason["code"] for reason in validation_pending[0]["validationReasons"]
        }
        self.assertIn("SEC_FOOTNOTE_PRICE_CONFLICT", reason_codes)
        self.assertIn("MARKET_PRICE_EXTREME", reason_codes)
        self.assertEqual(1.0, coverage["marketCoverage"])
        rows = aggregate_transactions(accepted)
        self.assertEqual(2137, sum(row["shares"] for row in rows))
        self.assertAlmostEqual(167406.89, sum(row["value"] for row in rows), places=2)

    def test_full_amendment_replaces_corrected_non_price_fields(self) -> None:
        amendment = deepcopy(self.psx_original)
        amendment["accession"] = "0001534701-26-000099"
        amendment["documentType"] = "4/A"
        amendment["originalSubmissionDate"] = self.psx_original["filedDate"]
        amendment["filedDate"] = "2026-07-22"
        for index, leg in enumerate(amendment["transactions"]):
            leg["accession"] = amendment["accession"]
            leg["sourceAccessions"] = [amendment["accession"]]
            leg["documentType"] = "4/A"
            leg["filedDate"] = amendment["filedDate"]
            leg["transactionId"] = (
                f"{amendment['accession']}:nonDerivative:{index}"
            )
        amendment["transactions"][1]["shares"] = Decimal("600")
        amendment["transactions"][1]["ownAfter"] = Decimal("58560")
        amendment["transactions"][1]["acquiredDisposedCode"] = "A"

        legs, pending, _ = reconcile_amendments([self.psx_original, amendment])

        self.assertEqual([], pending)
        self.assertEqual(2, len(legs))
        self.assertEqual(Decimal("600"), legs[1]["shares"])
        self.assertEqual("A", legs[1]["acquiredDisposedCode"])
        self.assertEqual(
            ["0001534701-26-000026", "0001534701-26-000099"],
            legs[1]["sourceAccessions"],
        )

    def test_unresolved_amendment_quarantines_original_without_failing_dataset(self) -> None:
        amendment = deepcopy(self.psx_amendment)
        amendment["transactions"] = [deepcopy(amendment["transactions"][0])]
        amendment["transactions"][0]["txDate"] = "2099-01-01"

        result, quarantine, report = build_dataset(
            [self.psx_original, amendment],
            source_meta={"source": "fixture"},
            market_quotes=self.market,
            max_pending_rate=1.0,
        )

        self.assertEqual("passed", report["status"])
        self.assertEqual([], report["fatalErrors"])
        self.assertIn("AMENDMENT_TRANSACTION_NOT_FOUND", report["reviewWarnings"])
        self.assertIn("AMENDMENT_UNRESOLVED_ORIGINAL", report["reviewWarnings"])
        self.assertEqual([], result["trades"])
        self.assertEqual(3, result["meta"]["pendingCount"])
        self.assertEqual(3, quarantine["meta"]["count"])
        self.assertTrue(
            all(row["qualityStatus"] == "pending" for row in result["pendingTrades"])
        )

    def test_same_day_separate_accessions_are_not_deduplicated(self) -> None:
        second = parse_form4_xml(
            fixture("psx-original.xml"),
            accession="0001534701-26-000099",
            filed_date="2026-07-21",
        )
        second["transactions"] = second["transactions"][:1]
        first = dict(self.psx_original)
        first["transactions"] = self.psx_original["transactions"][:1]
        legs, pending, _ = reconcile_amendments([first, second])
        self.assertEqual([], pending)
        self.assertEqual(2, len(legs))
        accepted, validation_pending, _ = validate_transactions(legs, self.market)
        self.assertEqual([], validation_pending)
        rows = aggregate_transactions(accepted)
        self.assertEqual(1, len(rows))
        self.assertEqual(1126, rows[0]["shares"])
        self.assertEqual(2, rows[0]["transactionCount"])

    def test_public_amount_cross_check_blocks_tampering(self) -> None:
        bad = {
            "ticker": "OK",
            "filer": "Example",
            "txType": "매수",
            "txDate": "2026-07-01",
            "sourceAccessions": ["0000000001-26-000001"],
            "qualityStatus": "accepted",
            "shares": 100,
            "price": 10,
            "value": 5000,
        }
        errors = validate_public_dataset([bad], [])
        self.assertTrue(any("amount mismatch" in error for error in errors))

    def test_public_gate_blocks_reused_transaction_id(self) -> None:
        base = {
            "ticker": "OK",
            "filer": "Example",
            "txType": "매수",
            "txDate": "2026-07-01",
            "sourceAccessions": ["0000000001-26-000001"],
            "qualityStatus": "accepted",
            "shares": 100,
            "price": 10,
            "value": 1000,
            "transactionIds": ["0000000001-26-000001:nonDerivative:0"],
        }
        errors = validate_public_dataset(
            [{**base, "id": "row-1"}, {**base, "id": "row-2"}],
            [],
        )
        self.assertTrue(any("duplicate public transaction id" in error for error in errors))

    def test_dataset_gate_keeps_pending_out_of_accepted_trades(self) -> None:
        result, quarantine, report = build_dataset(
            [self.psx_original, self.psx_amendment, self.nmm_original],
            source_meta={"source": "fixture"},
            market_quotes=self.market,
            max_pending_rate=0.25,
            min_market_coverage=0.95,
        )
        self.assertEqual("passed", report["status"])
        self.assertEqual(1, result["meta"]["pendingCount"])
        self.assertEqual(1, quarantine["meta"]["count"])
        self.assertTrue(
            all(row["qualityStatus"] == "accepted" for row in result["trades"])
        )
        self.assertTrue(
            all(row["qualityStatus"] == "pending" for row in result["pendingTrades"])
        )
        self.assertIn("pendingTrades", result)
        self.assertIsInstance(result["pendingTrades"], list)
        json.dumps(result, ensure_ascii=False)


if __name__ == "__main__":
    unittest.main()
