"""Validate synced IPO lockup events against the current US listing directory."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
LOCKUP_PATH = ROOT / "ipo-lockup" / "data" / "lockup.json"
DIRECTORY_PATH = ROOT / "stock_directory.json"


def validate_payload(lockup: dict, directory: dict) -> dict:
    listed = {row["ticker"].upper() for row in directory.get("stocks", [])}
    events = []
    for raw in lockup.get("events", []):
        row = dict(raw)
        ticker = str(row.get("ticker", "")).upper().strip()
        is_listed = ticker in listed
        has_basis = bool(
            row.get("ipoDate") and row.get("lockupDate") and row.get("lockupDays")
        )
        row["ticker"] = ticker
        row["listingStatus"] = "listed" if is_listed else "not-found"
        row["verificationStatus"] = (
            "estimated" if is_listed and has_basis else "review-needed"
        )
        row["sourceUrl"] = (
            "https://www.sec.gov/edgar/search/#/q="
            f"{quote(ticker)}&category=custom&forms=424B4"
        )
        row["verificationNote"] = (
            "현재 미국 상장 종목과 대조했으며, SEC 투자설명서의 락업 기간을 "
            "IPO일에 더해 계산한 예정일입니다. 조기 해제 조건은 원문 확인이 필요합니다."
            if is_listed and has_basis
            else "현재 상장 종목 디렉터리에서 티커를 확인하지 못했습니다. "
            "상장폐지, 티커 변경 또는 수집 오류 여부를 추가 검토해야 합니다."
        )
        events.append(row)

    output = dict(lockup)
    meta = dict(output.get("meta", {}))
    meta["validatedAt"] = datetime.now(timezone.utc).isoformat()
    meta["listedChecked"] = len(events)
    meta["listedMatched"] = sum(row["listingStatus"] == "listed" for row in events)
    meta["reviewNeeded"] = sum(
        row["verificationStatus"] == "review-needed" for row in events
    )
    output["meta"] = meta
    output["events"] = sorted(
        events, key=lambda row: (row.get("lockupDate") or "9999-12-31", row["ticker"])
    )
    return output


def main() -> None:
    lockup = json.loads(LOCKUP_PATH.read_text(encoding="utf-8"))
    directory = json.loads(DIRECTORY_PATH.read_text(encoding="utf-8"))
    validated = validate_payload(lockup, directory)
    LOCKUP_PATH.write_text(
        json.dumps(validated, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Validated {len(validated['events'])} events; "
        f"{validated['meta']['reviewNeeded']} require review."
    )


if __name__ == "__main__":
    main()
