"""Merge curated, SEC-backed major IPO lockup history into the synced feed."""

from __future__ import annotations

import json
from datetime import date, timedelta
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
LOCKUP_PATH = ROOT / "ipo-lockup" / "data" / "lockup.json"
SEED_PATH = ROOT / "scripts" / "data" / "major_ipo_lockups.json"


def build_major_event(seed: dict) -> dict:
    prospectus_date = date.fromisoformat(seed["prospectusDate"])
    lockup_days = int(seed["lockupDays"])
    maximum_date = prospectus_date + timedelta(days=lockup_days)
    conditional = bool(seed.get("conditional"))
    ticker = seed["ticker"].upper()

    if conditional:
        rule_type = "earnings-or-days"
        rule_summary = (
            f"SEC 투자설명서상 실적 발표 등 조기 해제 조건 또는 "
            f"{lockup_days}일 중 먼저 충족되는 시점에 해제될 수 있습니다."
        )
        verification_status = "conditional"
        verification_note = (
            "SEC 공시에서 락업 조건을 확인했습니다. 표시일은 최대 예정일이며 "
            "실적 발표·주가·주관사 승인 조건에 따라 일부 또는 전부가 먼저 해제될 수 있습니다."
        )
    else:
        rule_type = "fixed-days"
        rule_summary = f"SEC 공모 투자설명서 기준 {lockup_days}일 락업입니다."
        verification_status = "confirmed"
        verification_note = (
            "SEC 공시 원문에서 락업 기간을 확인해 투자설명서 기준일로 계산했습니다. "
            "주관사 재량과 공시상 예외 조항은 별도로 적용될 수 있습니다."
        )

    return {
        "id": f"major-{ticker}-{seed['prospectusDate']}",
        "ticker": ticker,
        "company": seed["company"],
        "companyKo": seed["companyKo"],
        "ipoDate": seed["ipoDate"],
        "prospectusDate": seed["prospectusDate"],
        "ipoPrice": seed.get("ipoPrice"),
        "lockupDate": maximum_date.isoformat(),
        "maxLockupDate": maximum_date.isoformat(),
        "lockupDays": lockup_days,
        "unlockShares": None,
        "floatRatio": None,
        "underwriter": None,
        "majorIpo": True,
        "termsVerified": True,
        "datePrecision": "conditional-max" if conditional else "fixed",
        "releaseRuleType": rule_type,
        "releaseRuleSummary": rule_summary,
        "listingStatus": "listed",
        "verificationStatus": verification_status,
        "verificationNote": verification_note,
        "sourceType": "SEC 424B4",
        "sourceLabel": "SEC 424B4 원문",
        "sourceUrl": seed["sourceUrl"],
        "cik": seed["cik"],
        "accession": seed["accession"],
    }


def merge_major_events(payload: dict, seeds: list[dict]) -> dict:
    major_events = [build_major_event(seed) for seed in seeds]
    major_tickers = {event["ticker"] for event in major_events}
    retained = [
        event
        for event in payload.get("events", [])
        if str(event.get("ticker", "")).upper() not in major_tickers
    ]
    events = retained + major_events
    events.sort(key=lambda row: (row.get("lockupDate") or "9999-12-31", row["ticker"]))

    output = dict(payload)
    output["events"] = events
    meta = dict(output.get("meta", {}))
    meta["majorIpoCount"] = len(major_events)
    meta["majorIpoSource"] = "SEC EDGAR 424B4 원문"
    output["meta"] = meta
    return output


def main() -> None:
    payload = json.loads(LOCKUP_PATH.read_text(encoding="utf-8"))
    seeds = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    enriched = merge_major_events(payload, seeds)
    LOCKUP_PATH.write_text(
        json.dumps(enriched, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Merged {len(seeds)} SEC-backed major IPO lockup events.")


if __name__ == "__main__":
    main()
