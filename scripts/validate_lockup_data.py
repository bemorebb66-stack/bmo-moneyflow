"""Validate synced IPO lockup events against the current US listing directory."""

from __future__ import annotations

import json
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import quote


ROOT = Path(__file__).resolve().parents[1]
LOCKUP_PATH = ROOT / "ipo-lockup" / "data" / "lockup.json"
DIRECTORY_PATH = ROOT / "stock_directory.json"


def parse_iso_date(value: object) -> date | None:
    try:
        return date.fromisoformat(str(value or "").strip())
    except ValueError:
        return None


def sec_search_url(ticker: str) -> str:
    return (
        "https://www.sec.gov/edgar/search/#/q="
        f"{quote(ticker)}&category=custom&forms=424B4"
    )


def source_quality(row: dict) -> int:
    source_url = str(row.get("sourceUrl") or "")
    status = row.get("verificationStatus")
    if status == "confirmed" and "/Archives/" in source_url:
        return 4
    if status == "conditional" and "/Archives/" in source_url:
        return 3
    if "/Archives/" in source_url:
        return 2
    return 1 if status == "confirmed" else 0


def validate_payload(lockup: dict, directory: dict) -> dict:
    listed = {row["ticker"].upper() for row in directory.get("stocks", [])}
    validated_at = datetime.now(timezone.utc).isoformat()
    valid_events: dict[tuple[str, str], dict] = {}
    excluded_events = []

    for raw in lockup.get("events", []):
        row = dict(raw)
        ticker = str(row.get("ticker", "")).upper().strip()
        is_listed = ticker in listed
        ipo_date = parse_iso_date(row.get("ipoDate"))
        prospectus_date = parse_iso_date(row.get("prospectusDate")) or ipo_date
        lockup_date = parse_iso_date(
            row.get("maxLockupDate") or row.get("lockupDate")
        )
        lockup_days = int(row.get("lockupDays") or 0)
        calculated_days = (
            (lockup_date - prospectus_date).days
            if prospectus_date and lockup_date
            else None
        )
        date_consistent = bool(
            calculated_days is not None
            and calculated_days > 0
            and lockup_days > 0
            and abs(calculated_days - lockup_days) <= 2
        )

        row["ticker"] = ticker
        row["listingStatus"] = "listed" if is_listed else "not-found"
        row["validatedAt"] = validated_at
        row["sourceType"] = "SEC 424B4"
        row["sourceUrl"] = str(row.get("sourceUrl") or "").strip() or sec_search_url(
            ticker
        )
        row["sourceLabel"] = (
            "SEC 424B4 원문"
            if "/Archives/" in row["sourceUrl"]
            else "SEC 424B4 검색"
        )
        row["validationChecks"] = {
            "listed": is_listed,
            "datesPresent": bool(prospectus_date and lockup_date and lockup_days),
            "dateConsistent": date_consistent,
            "termsVerified": bool(row.get("termsVerified")),
        }

        if not ticker:
            row["verificationStatus"] = "review-needed"
            row["exclusionReason"] = "티커가 비어 있습니다."
            excluded_events.append(row)
            continue
        if not is_listed:
            row["verificationStatus"] = "review-needed"
            row["exclusionReason"] = (
                "현재 미국 상장 종목 디렉터리에서 티커를 확인하지 못했습니다."
            )
            excluded_events.append(row)
            continue
        if not date_consistent:
            row["verificationStatus"] = "review-needed"
            row["exclusionReason"] = (
                "투자설명서 기준일·락업 기간·최대 예정일의 계산 결과가 일치하지 않습니다."
            )
            excluded_events.append(row)
            continue

        raw_status = raw.get("verificationStatus")
        if raw_status in {"confirmed", "conditional"}:
            row["verificationStatus"] = raw_status
        else:
            row["verificationStatus"] = "estimated"

        if not row.get("verificationNote"):
            if row["verificationStatus"] == "confirmed":
                row["verificationNote"] = (
                    "SEC 공시 원문에서 락업 기간을 확인했습니다."
                )
            elif row["verificationStatus"] == "conditional":
                row["verificationNote"] = (
                    "SEC 공시에서 조건을 확인했습니다. 표시일은 최대 예정일이며 "
                    "조건 충족 시 먼저 해제될 수 있습니다."
                )
            else:
                row["verificationNote"] = (
                    "투자설명서의 락업 기간을 IPO일에 더해 계산한 예정일입니다. "
                    "조기 해제 조건과 거래소 휴장일에 따라 달라질 수 있습니다."
                )

        key = (ticker, str(row.get("lockupDate") or ""))
        previous = valid_events.get(key)
        if previous is None or source_quality(row) > source_quality(previous):
            if previous is not None:
                previous["exclusionReason"] = "동일 티커·해제일 중복 이벤트입니다."
                excluded_events.append(previous)
            valid_events[key] = row
        else:
            row["exclusionReason"] = "동일 티커·해제일 중복 이벤트입니다."
            excluded_events.append(row)

    output = dict(lockup)
    meta = dict(output.get("meta", {}))
    events = list(valid_events.values())
    meta["validatedAt"] = validated_at
    meta["listedChecked"] = len(lockup.get("events", []))
    meta["listedMatched"] = len(events)
    meta["reviewNeeded"] = len(excluded_events)
    meta["excludedCount"] = len(excluded_events)
    meta["directSecSourceCount"] = sum(
        "/Archives/" in str(row.get("sourceUrl") or "") for row in events
    )
    meta["conditionalCount"] = sum(
        row.get("verificationStatus") == "conditional" for row in events
    )
    meta["validationRule"] = (
        "미국 상장 종목 일치 + 투자설명서 기준일·락업 기간 계산 + SEC 원문 출처 + 중복 제거"
    )
    output["meta"] = meta
    output["events"] = sorted(
        events, key=lambda row: (row.get("lockupDate") or "9999-12-31", row["ticker"])
    )
    output["excludedEvents"] = sorted(
        excluded_events,
        key=lambda row: (row.get("ticker") or "", row.get("lockupDate") or ""),
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
