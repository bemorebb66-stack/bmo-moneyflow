from __future__ import annotations

import hashlib
import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INSIDER_DATA = ROOT / "insider" / "data"
LOCKUP_DATA = ROOT / "ipo-lockup" / "data"


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def data_sha256(data: dict) -> str:
    payload = {
        "trades": data["trades"],
        "pendingTrades": data["pendingTrades"],
    }
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class InsiderOperatingArtifactTests(unittest.TestCase):
    def test_operating_dataset_matches_its_quality_artifacts(self) -> None:
        data = read_json(INSIDER_DATA / "insider.json")
        quarantine = read_json(INSIDER_DATA / "insider-quarantine.json")
        report = read_json(INSIDER_DATA / "insider-quality.json")

        self.assertIn("trades", data)
        self.assertIn("pendingTrades", data)
        self.assertTrue(
            all(row.get("qualityStatus") == "accepted" for row in data["trades"])
        )
        self.assertTrue(
            all(
                row.get("qualityStatus") == "pending"
                for row in data["pendingTrades"]
            )
        )
        self.assertEqual(len(data["trades"]), data["meta"]["acceptedCount"])
        self.assertEqual(
            len(data["pendingTrades"]), data["meta"]["pendingCount"]
        )
        self.assertEqual(len(data["trades"]), report["acceptedCount"])
        self.assertEqual(len(data["pendingTrades"]), report["pendingCount"])
        self.assertEqual(data["pendingTrades"], quarantine["pendingTrades"])
        self.assertEqual(len(data["pendingTrades"]), quarantine["meta"]["count"])

        actual_hash = data_sha256(data)
        self.assertEqual(actual_hash, data["meta"]["dataSha256"])
        self.assertEqual(actual_hash, report["dataSha256"])

    def test_lockup_mirror_uses_the_same_validated_insider_dataset(self) -> None:
        self.assertEqual(
            read_json(INSIDER_DATA / "insider.json"),
            read_json(LOCKUP_DATA / "insider.json"),
        )


if __name__ == "__main__":
    unittest.main()
