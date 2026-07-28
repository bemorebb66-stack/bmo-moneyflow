"""Resolve estimated lockup rows to direct SEC 424B4 filings and verify terms."""

from __future__ import annotations

import html
import json
import re
import time
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCKUP_PATH = ROOT / "ipo-lockup" / "data" / "lockup.json"
SEC_TICKERS = "https://www.sec.gov/files/company_tickers.json"
SEC_SUBMISSIONS = "https://data.sec.gov/submissions/CIK{cik:010d}.json"
SEC_ARCHIVES = "https://www.sec.gov/Archives/edgar/data/{cik}/{compact}/{document}"
USER_AGENT = "BVT Money Flow admin@bvtmoneyflow.xyz"
DAY_PATTERN = re.compile(
    r"(?P<days>30|45|60|90|120|150|180|181|270|360|365|366)\s*(?:calendar\s+)?days",
    re.IGNORECASE,
)


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        raw = response.read().decode("utf-8", errors="ignore")
    plain = re.sub(r"<script\b[^>]*>.*?</script>", " ", raw, flags=re.I | re.S)
    plain = re.sub(r"<style\b[^>]*>.*?</style>", " ", plain, flags=re.I | re.S)
    plain = re.sub(r"<[^>]+>", " ", plain)
    return re.sub(r"\s+", " ", html.unescape(plain))


def accession_from_id(event_id: str) -> str | None:
    match = re.search(r"(\d{10}-\d{2}-\d{6})", event_id)
    return match.group(1) if match else None


def find_filing(row: dict[str, Any], ticker_map: dict[str, int]) -> dict[str, str] | None:
    ticker = str(row.get("ticker") or "").upper()
    cik = ticker_map.get(ticker)
    accession = row.get("accession") or accession_from_id(str(row.get("id") or ""))
    if not cik:
        return None
    submissions = fetch_json(SEC_SUBMISSIONS.format(cik=cik))
    recent = submissions.get("filings", {}).get("recent", {})
    for index, form in enumerate(recent.get("form", [])):
        candidate = recent.get("accessionNumber", [])[index]
        if form != "424B4" or (accession and candidate != accession):
            continue
        document = recent.get("primaryDocument", [])[index]
        compact = candidate.replace("-", "")
        return {
            "cik": str(cik),
            "accession": candidate,
            "filingDate": recent.get("filingDate", [])[index],
            "sourceUrl": SEC_ARCHIVES.format(
                cik=cik, compact=compact, document=document
            ),
        }
    return None


def lockup_context(text: str) -> str:
    lowered = text.lower()
    locations = [
        match.start()
        for match in re.finditer(r"lock[\s-]?up", lowered)
    ]
    snippets = [text[max(0, pos - 700) : pos + 1800] for pos in locations[:40]]
    return " ".join(snippets)


def verify_terms(
    row: dict[str, Any], filing: dict[str, str], text: str
) -> dict[str, Any] | None:
    context = lockup_context(text)
    expected = int(row.get("lockupDays") or 0)
    day_values = [int(match.group("days")) for match in DAY_PATTERN.finditer(context)]
    if not context or expected not in day_values:
        return None
    prospectus = date.fromisoformat(
        str(row.get("prospectusDate") or row.get("ipoDate"))
    )
    max_date = prospectus + timedelta(days=expected)
    conditional = bool(
        re.search(
            r"(earlier of|first to occur|earnings release|price condition|"
            r"may be released|early release)",
            context,
            flags=re.IGNORECASE,
        )
    )
    row.update(filing)
    row["prospectusDate"] = prospectus.isoformat()
    row["lockupDate"] = max_date.isoformat()
    row["maxLockupDate"] = max_date.isoformat()
    row["termsVerified"] = True
    row["datePrecision"] = "conditional-max" if conditional else "fixed"
    row["verificationStatus"] = "conditional" if conditional else "confirmed"
    row["releaseRuleType"] = "earnings-or-days" if conditional else "fixed-days"
    row["releaseRuleSummary"] = (
        f"SEC 투자설명서상 조기 해제 조건 또는 {expected}일 중 먼저 "
        "충족되는 시점에 해제될 수 있습니다."
        if conditional
        else f"SEC 공모 투자설명서 기준 {expected}일 락업입니다."
    )
    row["verificationNote"] = (
        "SEC 424B4 원문에서 락업 기간과 조건을 확인했습니다. "
        + (
            "표시일은 최대 예정일이며 조건 충족 시 먼저 해제될 수 있습니다."
            if conditional
            else "표시일은 투자설명서 기준일에 락업 기간을 더해 계산했습니다."
        )
    )
    row["sourceType"] = "SEC 424B4"
    row["sourceLabel"] = "SEC 424B4 원문"
    return row


def resolve_payload(payload: dict[str, Any]) -> dict[str, Any]:
    tickers = fetch_json(SEC_TICKERS)
    ticker_map = {
        str(item["ticker"]).upper(): int(item["cik_str"])
        for item in tickers.values()
    }
    resolved = 0
    verified = 0
    failures: list[dict[str, str]] = []
    for row in payload.get("events", []):
        if row.get("termsVerified") and "/Archives/" in str(row.get("sourceUrl")):
            continue
        try:
            filing = find_filing(row, ticker_map)
            if not filing:
                failures.append({"ticker": row["ticker"], "reason": "filing-not-found"})
                continue
            resolved += 1
            text = fetch_text(filing["sourceUrl"])
            if verify_terms(row, filing, text):
                verified += 1
            else:
                row.update(filing)
                row["sourceLabel"] = "SEC 424B4 원문"
                row["termsVerified"] = False
                row["datePrecision"] = "estimated"
                row["verificationStatus"] = "estimated"
                row["verificationNote"] = (
                    "SEC 424B4 원문은 연결했지만 락업 조건을 자동 확정하지 "
                    "못했습니다. 표시일은 공시에서 수집한 기간 기준 추정일입니다."
                )
                failures.append({"ticker": row["ticker"], "reason": "terms-not-matched"})
            time.sleep(0.11)
        except Exception as exc:
            failures.append({"ticker": row.get("ticker", ""), "reason": type(exc).__name__})

    meta = dict(payload.get("meta", {}))
    events = payload.get("events", [])
    meta.update(
        {
            "filingsResolvedAt": datetime.now(timezone.utc).isoformat(),
            "directSecSourceCount": sum(
                "/Archives/" in str(row.get("sourceUrl") or "") for row in events
            ),
            "termsVerifiedCount": sum(bool(row.get("termsVerified")) for row in events),
            "resolverResolvedCount": resolved,
            "resolverVerifiedCount": verified,
            "resolverFailureCount": len(failures),
            "resolverFailures": failures,
        }
    )
    payload["meta"] = meta
    return payload


def main() -> None:
    payload = json.loads(LOCKUP_PATH.read_text(encoding="utf-8"))
    resolved = resolve_payload(payload)
    LOCKUP_PATH.write_text(
        json.dumps(resolved, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Direct SEC sources: {resolved['meta']['directSecSourceCount']}; "
        f"verified terms: {resolved['meta']['termsVerifiedCount']}."
    )


if __name__ == "__main__":
    main()
