from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import time
import urllib.parse
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Iterable
from xml.etree import ElementTree as ET

import requests


ACCESSION_RE = re.compile(r"^\d{10}-\d{2}-\d{6}$")
MONEY_CENT = Decimal("0.01")
PRICE_CENT = Decimal("0.01")
MARKET_PASS_LOW = Decimal("0.5")
MARKET_PASS_HIGH = Decimal("2")
MARKET_HARD_LOW = Decimal("0.2")
MARKET_HARD_HIGH = Decimal("5")
DEFAULT_USER_AGENT = "BVTMoneyFlow/1.0 admin@bvtmoneyflow.xyz"


def decimal_value(value: Any, default: Decimal | None = None) -> Decimal | None:
    if value is None or value == "":
        return default
    try:
        parsed = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, ValueError, TypeError):
        return default
    return parsed if parsed.is_finite() else default


def json_number(value: Decimal | None) -> int | float | None:
    if value is None:
        return None
    if value == value.to_integral_value():
        return int(value)
    return float(value)


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY_CENT, rounding=ROUND_HALF_UP)


def price(value: Decimal) -> Decimal:
    return value.quantize(PRICE_CENT, rounding=ROUND_HALF_UP)


def local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def child(node: ET.Element | None, name: str) -> ET.Element | None:
    if node is None:
        return None
    for item in list(node):
        if local_name(item.tag) == name:
            return item
    return None


def descendant(node: ET.Element | None, name: str) -> ET.Element | None:
    if node is None:
        return None
    for item in node.iter():
        if local_name(item.tag) == name:
            return item
    return None


def text_at(node: ET.Element | None, *names: str) -> str:
    current = node
    for name in names:
        current = child(current, name)
        if current is None:
            return ""
    return (current.text or "").strip()


def value_at(node: ET.Element | None, name: str) -> str:
    block = descendant(node, name)
    if block is None:
        return ""
    value_node = child(block, "value")
    return ((value_node.text if value_node is not None else block.text) or "").strip()


def normalize_accession(value: str) -> str:
    match = re.search(r"(\d{10}-\d{2}-\d{6})", value or "")
    return match.group(1) if match else ""


def accession_from_row(row: dict[str, Any]) -> str:
    for candidate in (
        str(row.get("accession") or ""),
        str(row.get("id") or ""),
        str(row.get("secUrl") or ""),
    ):
        accession = normalize_accession(candidate)
        if accession:
            return accession
    return ""


def normalize_security_title(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip().lower()


def normalize_ticker(value: str) -> str:
    ticker = html.unescape(value or "").strip().upper()
    exchange_match = re.fullmatch(
        r"(?:NYSE|NASDAQ|AMEX|OTC)\s*:\s*([A-Z0-9.-]+)",
        ticker,
    )
    if exchange_match:
        return exchange_match.group(1)
    wrapped_match = re.fullmatch(r"\(([A-Z0-9.-]+)\)", ticker)
    return wrapped_match.group(1) if wrapped_match else ticker


def normalize_decimal_key(value: Any) -> str:
    parsed = decimal_value(value, Decimal("0")) or Decimal("0")
    return format(parsed.normalize(), "f")


def transaction_fingerprint(leg: dict[str, Any]) -> tuple[str, ...]:
    return (
        str(leg.get("issuerCik") or ""),
        str(leg.get("ownerCik") or ""),
        normalize_security_title(str(leg.get("securityTitle") or "")),
        str(leg.get("txDate") or ""),
        str(leg.get("transactionCode") or ""),
        str(leg.get("acquiredDisposedCode") or ""),
        str(leg.get("ownershipNature") or ""),
        normalize_decimal_key(leg.get("shares")),
        normalize_decimal_key(leg.get("ownAfter")),
    )


def amendment_identity(leg: dict[str, Any]) -> tuple[str, ...]:
    return (
        str(leg.get("issuerCik") or ""),
        str(leg.get("ownerCik") or ""),
        normalize_security_title(str(leg.get("securityTitle") or "")),
        str(leg.get("txDate") or ""),
        str(leg.get("transactionCode") or ""),
        str(leg.get("ownershipNature") or ""),
    )


def exact_transaction_fingerprint(leg: dict[str, Any]) -> tuple[str, ...]:
    return transaction_fingerprint(leg) + (normalize_decimal_key(leg.get("price")),)


@dataclass(frozen=True)
class FilingRef:
    form_type: str
    company: str
    cik: str
    filed_date: str
    file_name: str
    accession: str


def parse_form_index(text: str) -> list[FilingRef]:
    refs: dict[str, FilingRef] = {}
    for line in text.splitlines():
        match = re.match(
            r"^(4/A|4)\s+(.+?)\s+(\d+)\s+(\d{8})\s+(\S+\.txt)\s*$",
            line,
        )
        if not match:
            continue
        form_type, company, cik, filed_date_raw, file_name = match.groups()
        accession = normalize_accession(file_name)
        if not accession or not file_name.endswith(".txt"):
            continue
        filed_date = (
            f"{filed_date_raw[:4]}-{filed_date_raw[4:6]}-{filed_date_raw[6:8]}"
            if re.fullmatch(r"\d{8}", filed_date_raw)
            else filed_date_raw
        )
        candidate = FilingRef(
            form_type=form_type,
            company=company,
            cik=cik,
            filed_date=filed_date,
            file_name=file_name,
            accession=accession,
        )
        previous = refs.get(accession)
        if previous is None or (previous.form_type != "4/A" and form_type == "4/A"):
            refs[accession] = candidate
    return list(refs.values())


def reporting_role(root: ET.Element) -> str:
    relationship = descendant(root, "reportingOwnerRelationship")
    title = value_at(relationship, "officerTitle")
    if title:
        return title[:80]
    is_ten = value_at(relationship, "isTenPercentOwner").lower() in {"1", "true"}
    is_director = value_at(relationship, "isDirector").lower() in {"1", "true"}
    if is_ten:
        return "10%대주주"
    if is_director:
        return "이사"
    return "임원"


def parse_form4_xml(
    xml_text: str,
    *,
    accession: str,
    filed_date: str,
    sec_url: str = "",
) -> dict[str, Any]:
    if not ACCESSION_RE.fullmatch(accession):
        raise ValueError(f"invalid accession: {accession}")
    root = ET.fromstring(xml_text)
    document_type = value_at(root, "documentType") or "4"
    if document_type not in {"4", "4/A"}:
        raise ValueError(f"unsupported document type: {document_type}")

    issuer = descendant(root, "issuer")
    owner = descendant(root, "reportingOwner")
    ticker = normalize_ticker(value_at(issuer, "issuerTradingSymbol"))
    footnotes: dict[str, str] = {}
    for node in root.iter():
        if local_name(node.tag) == "footnote" and node.attrib.get("id"):
            footnotes[node.attrib["id"]] = " ".join("".join(node.itertext()).split())

    filing: dict[str, Any] = {
        "accession": accession,
        "documentType": document_type,
        "filedDate": filed_date,
        "originalSubmissionDate": value_at(root, "dateOfOriginalSubmission"),
        "periodOfReport": value_at(root, "periodOfReport"),
        "issuerCik": value_at(issuer, "issuerCik").lstrip("0"),
        "ownerCik": value_at(owner, "rptOwnerCik").lstrip("0"),
        "ticker": ticker,
        "company": html.unescape(value_at(issuer, "issuerName")),
        "filer": html.unescape(value_at(owner, "rptOwnerName")),
        "role": reporting_role(root),
        "secUrl": sec_url,
        "footnotes": footnotes,
        "transactions": [],
    }

    for index, tx in enumerate(
        node for node in root.iter() if local_name(node.tag) == "nonDerivativeTransaction"
    ):
        code = value_at(tx, "transactionCode")
        if code not in {"P", "S"}:
            continue
        shares = decimal_value(value_at(tx, "transactionShares"))
        tx_price = decimal_value(value_at(tx, "transactionPricePerShare"))
        own_after = decimal_value(value_at(tx, "sharesOwnedFollowingTransaction"))
        if shares is None or tx_price is None:
            continue
        price_block = descendant(tx, "transactionPricePerShare")
        price_footnotes = [
            node.attrib["id"]
            for node in (price_block.iter() if price_block is not None else [])
            if local_name(node.tag) == "footnoteId" and node.attrib.get("id")
        ]
        acquired_disposed = value_at(tx, "transactionAcquiredDisposedCode")
        own_before = None
        if own_after is not None:
            own_before = own_after - shares if code == "P" else own_after + shares
        filing["transactions"].append(
            {
                "transactionId": f"{accession}:nonDerivative:{index}",
                "accession": accession,
                "sourceAccessions": [accession],
                "documentType": document_type,
                "issuerCik": filing["issuerCik"],
                "ownerCik": filing["ownerCik"],
                "ticker": ticker,
                "company": filing["company"],
                "filer": filing["filer"],
                "role": filing["role"],
                "securityTitle": value_at(tx, "securityTitle"),
                "txDate": value_at(tx, "transactionDate"),
                "filedDate": filed_date,
                "transactionCode": code,
                "txType": "매수" if code == "P" else "매도",
                "acquiredDisposedCode": acquired_disposed,
                "ownershipNature": value_at(tx, "directOrIndirectOwnership"),
                "shares": shares,
                "price": tx_price,
                "value": shares * tx_price,
                "ownBefore": own_before,
                "ownAfter": own_after,
                "priceFootnoteIds": price_footnotes,
                "priceFootnotes": [footnotes[key] for key in price_footnotes if key in footnotes],
                "secUrl": sec_url,
            }
        )

    attach_price_ranges(filing)
    return filing


PRICE_RANGE_RE = re.compile(
    r"\$\s*([\d,]+(?:\.\d+)?)\s+(?:to|through|-)\s+\$\s*([\d,]+(?:\.\d+)?)",
    re.IGNORECASE,
)


def attach_price_ranges(filing: dict[str, Any]) -> None:
    by_footnote: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for leg in filing.get("transactions", []):
        for footnote_id in leg.get("priceFootnoteIds", []):
            by_footnote[footnote_id].append(leg)
    footnotes = filing.get("footnotes", {})
    for footnote_id, legs in by_footnote.items():
        ranges = [
            (decimal_value(low), decimal_value(high))
            for low, high in PRICE_RANGE_RE.findall(footnotes.get(footnote_id, ""))
        ]
        ranges = [
            (low, high)
            for low, high in ranges
            if low is not None and high is not None and 0 < low <= high
        ]
        if not ranges:
            continue
        if len(ranges) == len(legs):
            for leg, (low, high) in zip(legs, ranges):
                leg["footnotePriceLow"] = low
                leg["footnotePriceHigh"] = high
        elif len(ranges) == 1:
            low, high = ranges[0]
            for leg in legs:
                leg["footnotePriceLow"] = low
                leg["footnotePriceHigh"] = high


def dedupe_filings(
    filings: Iterable[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    unique: dict[str, dict[str, Any]] = {}
    conflicts: list[dict[str, Any]] = []
    for filing in filings:
        accession = str(filing.get("accession") or "")
        previous = unique.get(accession)
        if previous is None:
            unique[accession] = filing
            continue
        previous_fingerprints = [
            exact_transaction_fingerprint(row) for row in previous.get("transactions", [])
        ]
        current_fingerprints = [
            exact_transaction_fingerprint(row) for row in filing.get("transactions", [])
        ]
        if previous_fingerprints != current_fingerprints:
            conflicts.append(
                {
                    "accession": accession,
                    "reasonCode": "ACCESSION_CONTENT_CONFLICT",
                    "severity": "critical",
                }
            )
    return list(unique.values()), conflicts


def amendment_candidates(
    amendment: dict[str, Any], originals: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    same_parties = [
        filing
        for filing in originals
        if filing.get("issuerCik") == amendment.get("issuerCik")
        and filing.get("ownerCik") == amendment.get("ownerCik")
    ]
    original_date = amendment.get("originalSubmissionDate")
    if original_date:
        dated = [filing for filing in same_parties if filing.get("filedDate") == original_date]
        if dated:
            return dated
    amendment_keys = {amendment_identity(leg) for leg in amendment.get("transactions", [])}
    return [
        filing
        for filing in same_parties
        if amendment_keys.intersection(
            amendment_identity(leg) for leg in filing.get("transactions", [])
        )
    ]


def reconcile_amendments(
    filings: Iterable[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    unique, conflicts = dedupe_filings(filings)
    originals = [row for row in unique if row.get("documentType") == "4"]
    amendments = sorted(
        (row for row in unique if row.get("documentType") == "4/A"),
        key=lambda row: (str(row.get("filedDate") or ""), str(row.get("accession") or "")),
    )
    canonical = [
        {**leg, "sourceAccessions": list(leg.get("sourceAccessions") or [])}
        for filing in originals
        for leg in filing.get("transactions", [])
    ]
    pending = list(conflicts)
    blocked_source_accessions: set[str] = set()

    for amendment in amendments:
        candidates = amendment_candidates(amendment, originals)
        if not candidates:
            pending.append(
                {
                    "accession": amendment.get("accession"),
                    "ticker": amendment.get("ticker"),
                    "reasonCode": "AMENDMENT_ORIGINAL_NOT_FOUND",
                    "severity": "critical",
                    "secUrl": amendment.get("secUrl"),
                }
            )
            continue
        candidate_accessions = {row.get("accession") for row in candidates}
        if len(candidates) == 1 and len(amendment.get("transactions", [])) == len(
            candidates[0].get("transactions", [])
        ):
            original_accession = candidates[0].get("accession")
            original_legs = [
                (index, leg)
                for index, leg in enumerate(canonical)
                if original_accession
                in leg.get("sourceAccessions", [leg.get("accession")])
            ]
            if len(original_legs) == len(amendment.get("transactions", [])):
                for (index, original_leg), amended_leg in zip(
                    original_legs, amendment.get("transactions", [])
                ):
                    replacement = dict(amended_leg)
                    replacement["sourceAccessions"] = list(
                        dict.fromkeys(
                            [
                                *original_leg.get(
                                    "sourceAccessions",
                                    [original_leg.get("accession")],
                                ),
                                amendment.get("accession"),
                            ]
                        )
                    )
                    replacement["supersedesTransactionId"] = original_leg.get(
                        "transactionId"
                    )
                    canonical[index] = replacement
                continue
        for amended_leg in amendment.get("transactions", []):
            matches = [
                (index, leg)
                for index, leg in enumerate(canonical)
                if candidate_accessions.intersection(
                    leg.get("sourceAccessions", [leg.get("accession")])
                )
                and amendment_identity(leg) == amendment_identity(amended_leg)
            ]
            if len(matches) > 1:
                scored = [
                    (
                        sum(
                            normalize_decimal_key(leg.get(field))
                            == normalize_decimal_key(amended_leg.get(field))
                            for field in ("shares", "ownAfter", "price")
                        )
                        + (
                            1
                            if leg.get("acquiredDisposedCode")
                            == amended_leg.get("acquiredDisposedCode")
                            else 0
                        ),
                        index,
                        leg,
                    )
                    for index, leg in matches
                ]
                best_score = max(score for score, _, _ in scored)
                best = [
                    (index, leg)
                    for score, index, leg in scored
                    if score == best_score
                ]
                matches = best if len(best) == 1 else matches
            if len(matches) != 1:
                pending.append(
                    {
                        **public_pending_row(amended_leg),
                        "reasonCode": (
                            "AMENDMENT_TRANSACTION_NOT_FOUND"
                            if not matches
                            else "AMENDMENT_TRANSACTION_AMBIGUOUS"
                        ),
                        "severity": "critical",
                    }
                )
                blocked_source_accessions.update(
                    str(accession)
                    for accession in candidate_accessions
                    if accession
                )
                continue
            index, original_leg = matches[0]
            replacement = dict(amended_leg)
            replacement["sourceAccessions"] = list(
                dict.fromkeys(
                    [
                        *original_leg.get("sourceAccessions", [original_leg.get("accession")]),
                        amendment.get("accession"),
                    ]
                )
            )
            replacement["supersedesTransactionId"] = original_leg.get("transactionId")
            canonical[index] = replacement

    if blocked_source_accessions:
        safe_canonical: list[dict[str, Any]] = []
        for leg in canonical:
            source_accessions = {
                str(accession)
                for accession in leg.get(
                    "sourceAccessions", [leg.get("accession")]
                )
                if accession
            }
            if source_accessions.intersection(blocked_source_accessions):
                pending.append(
                    {
                        **public_pending_row(leg),
                        "reasonCode": "AMENDMENT_UNRESOLVED_ORIGINAL",
                        "severity": "critical",
                    }
                )
                continue
            safe_canonical.append(leg)
        canonical = safe_canonical

    seen_ids: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for leg in canonical:
        transaction_id = str(leg.get("transactionId") or "")
        if transaction_id in seen_ids:
            continue
        seen_ids.add(transaction_id)
        deduped.append(leg)
    return deduped, pending, unique


def price_range_status(
    tx_price: Decimal, low: Decimal, high: Decimal
) -> tuple[str, dict[str, str]] | None:
    tolerance = max(Decimal("0.02"), max(abs(low), abs(high)) * Decimal("0.01"))
    if tx_price < low - tolerance or tx_price > high + tolerance:
        return (
            "SEC_FOOTNOTE_PRICE_CONFLICT",
            {
                "observedPrice": format(tx_price, "f"),
                "expectedLow": format(low, "f"),
                "expectedHigh": format(high, "f"),
            },
        )
    return None


def market_status(
    tx_price: Decimal, quote: dict[str, Any] | None
) -> tuple[str, dict[str, str]]:
    if not quote:
        return "unverified", {}
    low = decimal_value(quote.get("low"))
    high = decimal_value(quote.get("high"))
    if low is None or high is None or low <= 0 or high <= 0:
        return "unverified", {}
    details = {
        "marketLow": format(low, "f"),
        "marketHigh": format(high, "f"),
    }
    if tx_price < low * MARKET_HARD_LOW or tx_price > high * MARKET_HARD_HIGH:
        return "critical", details
    if tx_price < low * MARKET_PASS_LOW or tx_price > high * MARKET_PASS_HIGH:
        return "review", details
    return "verified", details


def arithmetic_tolerance(shares: Decimal) -> Decimal:
    return max(Decimal("1"), shares.copy_abs() * Decimal("0.005") + Decimal("0.50"))


def validate_transactions(
    legs: Iterable[dict[str, Any]],
    market_quotes: dict[tuple[str, str], dict[str, Any]] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    market_quotes = market_quotes or {}
    accepted: list[dict[str, Any]] = []
    pending: list[dict[str, Any]] = []
    eligible_market = 0
    verified_market = 0

    for raw_leg in legs:
        leg = dict(raw_leg)
        reasons: list[dict[str, Any]] = []
        shares = decimal_value(leg.get("shares"))
        tx_price = decimal_value(leg.get("price"))
        reported_value = decimal_value(leg.get("value"))
        if shares is None or shares <= 0:
            reasons.append({"code": "INVALID_SHARES", "severity": "critical"})
        if tx_price is None or tx_price <= 0:
            reasons.append({"code": "INVALID_PRICE", "severity": "critical"})
        if leg.get("txDate") and leg.get("filedDate") and leg["txDate"] > leg["filedDate"]:
            reasons.append({"code": "TRANSACTION_AFTER_FILING", "severity": "critical"})

        if shares is not None and tx_price is not None:
            expected_value = shares * tx_price
            leg["value"] = expected_value
            if (
                reported_value is not None
                and abs(reported_value - expected_value) > Decimal("0.01")
            ):
                reasons.append(
                    {
                        "code": "SHARES_PRICE_VALUE_MISMATCH",
                        "severity": "critical",
                        "observedValue": format(reported_value, "f"),
                        "expectedValue": format(expected_value, "f"),
                    }
                )
            footnote_low = decimal_value(leg.get("footnotePriceLow"))
            footnote_high = decimal_value(leg.get("footnotePriceHigh"))
            if footnote_low is not None and footnote_high is not None:
                conflict = price_range_status(tx_price, footnote_low, footnote_high)
                if conflict:
                    code, details = conflict
                    reasons.append({"code": code, "severity": "critical", **details})

            ticker = str(leg.get("ticker") or "")
            tx_date = str(leg.get("txDate") or "")
            if ticker and tx_date:
                eligible_market += 1
                status, details = market_status(tx_price, market_quotes.get((ticker, tx_date)))
                leg["marketValidationStatus"] = status
                if status != "unverified":
                    verified_market += 1
                if status == "critical":
                    reasons.append(
                        {
                            "code": "MARKET_PRICE_EXTREME",
                            "severity": "critical",
                            **details,
                        }
                    )
                elif status == "review":
                    reasons.append(
                        {
                            "code": "MARKET_PRICE_REVIEW",
                            "severity": "review",
                            **details,
                        }
                    )

        if reasons:
            pending.append(
                {
                    **public_pending_row(leg),
                    "validationReasons": reasons,
                    "reasonCode": reasons[0]["code"],
                    "severity": (
                        "critical"
                        if any(row.get("severity") == "critical" for row in reasons)
                        else "review"
                    ),
                }
            )
        else:
            leg["qualityStatus"] = "accepted"
            accepted.append(leg)

    return (
        accepted,
        pending,
        {
            "marketEligibleCount": eligible_market,
            "marketVerifiedCount": verified_market,
            "marketCoverage": (
                verified_market / eligible_market if eligible_market else 1.0
            ),
        },
    )


def public_pending_row(leg: dict[str, Any]) -> dict[str, Any]:
    return {
        "ticker": leg.get("ticker"),
        "company": leg.get("company"),
        "filer": leg.get("filer"),
        "role": leg.get("role"),
        "txType": leg.get("txType"),
        "shares": json_number(decimal_value(leg.get("shares"))),
        "price": json_number(decimal_value(leg.get("price"))),
        "txDate": leg.get("txDate"),
        "filedDate": leg.get("filedDate"),
        "accession": leg.get("accession"),
        "sourceAccessions": leg.get("sourceAccessions") or [leg.get("accession")],
        "secUrl": leg.get("secUrl"),
        "qualityStatus": "pending",
    }


def aggregate_transactions(legs: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = defaultdict(list)
    for leg in legs:
        key = (
            str(leg.get("issuerCik") or ""),
            str(leg.get("ownerCik") or ""),
            str(leg.get("ticker") or ""),
            str(leg.get("filer") or ""),
            normalize_security_title(str(leg.get("securityTitle") or "")),
            str(leg.get("txDate") or ""),
            str(leg.get("transactionCode") or ""),
            str(leg.get("ownershipNature") or ""),
        )
        groups[key].append(leg)

    rows: list[dict[str, Any]] = []
    for key, group in groups.items():
        group.sort(key=lambda row: str(row.get("transactionId") or ""))
        total_shares = sum(
            (decimal_value(row.get("shares"), Decimal("0")) or Decimal("0"))
            for row in group
        )
        total_value = sum(
            (decimal_value(row.get("value"), Decimal("0")) or Decimal("0"))
            for row in group
        )
        weighted_price = total_value / total_shares if total_shares > 0 else Decimal("0")
        rounded_price = price(weighted_price)
        rounded_value = money(total_value)
        if abs(rounded_value - rounded_price * total_shares) > arithmetic_tolerance(
            total_shares
        ):
            raise ValueError("aggregate shares × price cross-check failed")

        first = group[0]
        accessions = list(
            dict.fromkeys(
                str(accession)
                for row in group
                for accession in row.get("sourceAccessions", [row.get("accession")])
                if accession
            )
        )
        own_before = decimal_value(first.get("ownBefore"))
        own_after = decimal_value(group[-1].get("ownAfter"))
        ownership_chain_valid = True
        for previous, current in zip(group, group[1:]):
            if decimal_value(previous.get("ownAfter")) != decimal_value(
                current.get("ownBefore")
            ):
                ownership_chain_valid = False
                break
        if len(group) > 1 and not ownership_chain_valid:
            own_before = None
            own_after = None
        own_change = Decimal("0")
        if own_before is not None and own_after is not None and own_before > 0:
            own_change = (own_after - own_before) / own_before * Decimal("100")

        primary_accession = accessions[-1] if accessions else str(first.get("accession") or "")
        transaction_ids = [
            str(row.get("transactionId") or "")
            for row in group
            if row.get("transactionId")
        ]
        group_id = hashlib.sha256(
            "|".join((*key, *transaction_ids)).encode("utf-8")
        ).hexdigest()[:10]
        rows.append(
            {
                "ticker": first.get("ticker"),
                "company": first.get("company"),
                "filer": first.get("filer"),
                "role": first.get("role"),
                "txType": first.get("txType"),
                "shares": json_number(total_shares),
                "price": json_number(rounded_price),
                "value": json_number(rounded_value),
                "ownBefore": json_number(own_before),
                "filedDate": max(str(row.get("filedDate") or "") for row in group),
                "txDate": first.get("txDate"),
                "ownAfter": json_number(own_after),
                "ownChangePct": float(own_change.quantize(Decimal("0.1"))),
                "id": f"f4-{primary_accession}-{group_id}",
                "accession": primary_accession,
                "sourceAccessions": accessions,
                "transactionIds": transaction_ids,
                "secUrl": first.get("secUrl"),
                "qualityStatus": "accepted",
                "marketValidationStatus": (
                    "verified"
                    if all(row.get("marketValidationStatus") == "verified" for row in group)
                    else "unverified"
                ),
                "transactionCount": len(group),
            }
        )

    clusters: dict[tuple[str, str], set[str]] = defaultdict(set)
    for row in rows:
        clusters[(str(row.get("ticker")), str(row.get("txType")))].add(
            str(row.get("filer"))
        )
    for row in rows:
        row["clusterCount"] = len(
            clusters[(str(row.get("ticker")), str(row.get("txType")))]
        )
    rows.sort(key=lambda row: float(row.get("value") or 0), reverse=True)
    return rows


def validate_public_dataset(
    trades: list[dict[str, Any]], pending_trades: list[dict[str, Any]]
) -> list[str]:
    errors: list[str] = []
    row_ids: set[str] = set()
    transaction_ids: set[str] = set()
    for row in trades:
        if row.get("qualityStatus") != "accepted":
            errors.append("non-accepted trade leaked into public trades")
        shares = decimal_value(row.get("shares"))
        row_price = decimal_value(row.get("price"))
        row_value = decimal_value(row.get("value"))
        if shares is None or row_price is None or row_value is None:
            errors.append(f"{row.get('ticker')}: invalid numeric field")
            continue
        if abs(row_value - shares * row_price) > arithmetic_tolerance(shares):
            errors.append(f"{row.get('ticker')}: public amount mismatch")
        row_id = str(row.get("id") or "")
        if not row_id or row_id in row_ids:
            errors.append(f"{row.get('ticker')}: duplicate public row id")
        row_ids.add(row_id)
        for transaction_id in row.get("transactionIds") or []:
            transaction_id = str(transaction_id)
            if transaction_id in transaction_ids:
                errors.append(
                    f"{row.get('ticker')}: duplicate public transaction id"
                )
            transaction_ids.add(transaction_id)
    if any(row.get("qualityStatus") != "pending" for row in pending_trades):
        errors.append("non-pending row found in pendingTrades")
    return errors


def dataset_sha256(payload: dict[str, Any]) -> str:
    encoded = json.dumps(
        payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def build_dataset(
    filings: Iterable[dict[str, Any]],
    *,
    source_meta: dict[str, Any] | None = None,
    market_quotes: dict[tuple[str, str], dict[str, Any]] | None = None,
    max_pending_rate: float = 0.05,
    min_market_coverage: float = 0.0,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    canonical, amendment_pending, unique_filings = reconcile_amendments(filings)
    accepted_legs, validation_pending, coverage = validate_transactions(
        canonical, market_quotes
    )
    pending = [*amendment_pending, *validation_pending]
    trades = aggregate_transactions(accepted_legs)
    pending_public = [
        row
        if row.get("qualityStatus") == "pending"
        else {**row, "qualityStatus": "pending"}
        for row in pending
    ]
    public_errors = validate_public_dataset(trades, pending_public)
    total_candidates = len(canonical) + len(amendment_pending)
    pending_rate = len(pending_public) / total_candidates if total_candidates else 0.0
    fatal_errors = list(public_errors)
    review_warnings = sorted(
        {
            str(row.get("reasonCode"))
            for row in pending_public
            if row.get("severity") == "critical" and row.get("reasonCode")
        }
    )
    if pending_rate > max_pending_rate:
        fatal_errors.append(
            f"pending rate {pending_rate:.2%} exceeds {max_pending_rate:.2%}"
        )
    if coverage["marketCoverage"] < min_market_coverage:
        fatal_errors.append(
            f"market coverage {coverage['marketCoverage']:.2%} below "
            f"{min_market_coverage:.2%}"
        )

    source_meta = dict(source_meta or {})
    result = {
        "meta": {
            **source_meta,
            "validatedAt": datetime.now(timezone.utc).isoformat(),
            "validationVersion": 1,
            "validationStatus": "passed" if not fatal_errors else "failed",
            "acceptedCount": len(trades),
            "pendingCount": len(pending_public),
            "uniqueAccessionCount": len(unique_filings),
            "marketCoverage": round(float(coverage["marketCoverage"]), 6),
            "validationRule": (
                "Form 4/A transaction replacement, accession dedupe, exact amount "
                "cross-check, transaction-date market range"
            ),
        },
        "trades": trades,
        "pendingTrades": pending_public,
    }
    result["meta"]["dataSha256"] = dataset_sha256(
        {"trades": trades, "pendingTrades": pending_public}
    )
    quarantine = {
        "meta": {
            "generatedAt": result["meta"]["validatedAt"],
            "count": len(pending_public),
        },
        "pendingTrades": list(pending_public),
    }
    report = {
        "status": "passed" if not fatal_errors else "failed",
        "fatalErrors": fatal_errors,
        "reviewWarnings": review_warnings,
        "acceptedCount": len(trades),
        "pendingCount": len(pending_public),
        "pendingRate": round(pending_rate, 6),
        "candidateCount": total_candidates,
        "uniqueAccessionCount": len(unique_filings),
        **coverage,
        "dataSha256": result["meta"]["dataSha256"],
    }
    return result, quarantine, report


class SecClient:
    def __init__(self, user_agent: str = DEFAULT_USER_AGENT, delay_seconds: float = 0.2):
        self.session = requests.Session()
        self.session.headers.update(
            {"User-Agent": user_agent, "Accept-Encoding": "gzip, deflate"}
        )
        self.delay_seconds = delay_seconds
        self._last_request = 0.0

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request
        if elapsed < self.delay_seconds:
            time.sleep(self.delay_seconds - elapsed)

    def _get(self, url: str) -> requests.Response:
        request_url = url
        if "sec.gov/Archives/" in url:
            parsed = urllib.parse.urlsplit(url)
            query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
            if ("output", "1") not in query:
                query.append(("output", "1"))
            request_url = urllib.parse.urlunsplit(
                parsed._replace(query=urllib.parse.urlencode(query))
            )
        response: requests.Response | None = None
        for attempt in range(4):
            self._throttle()
            response = self.session.get(request_url, timeout=30)
            self._last_request = time.monotonic()
            if response.status_code not in {403, 429, 500, 502, 503, 504}:
                break
            if attempt < 3:
                time.sleep(2**attempt)
        assert response is not None
        response.raise_for_status()
        return response

    def get_text(self, url: str) -> str:
        response = self._get(url)
        return response.text

    def get_json(self, url: str) -> dict[str, Any]:
        response = self._get(url)
        return response.json()


def quarter(day: date) -> int:
    return (day.month - 1) // 3 + 1


def date_span(start: str, end: str) -> Iterable[date]:
    current = date.fromisoformat(start)
    last = date.fromisoformat(end)
    while current <= last:
        yield current
        current += timedelta(days=1)


def fetch_amendment_refs(
    client: SecClient, start: str, end: str
) -> list[FilingRef]:
    refs: dict[str, FilingRef] = {}
    for day in date_span(start, end):
        if day.weekday() >= 5:
            continue
        url = (
            "https://www.sec.gov/Archives/edgar/daily-index/"
            f"{day.year}/QTR{quarter(day)}/form.{day:%Y%m%d}.idx"
        )
        try:
            for ref in parse_form_index(client.get_text(url)):
                if ref.form_type == "4/A":
                    refs[ref.accession] = ref
        except requests.HTTPError as error:
            if error.response is not None and error.response.status_code == 404:
                continue
            raise
    return list(refs.values())


def fetch_ref_xml(client: SecClient, ref: FilingRef) -> tuple[str, str]:
    path_parts = ref.file_name.split("/")
    cik_path = path_parts[2]
    accession_no_dash = ref.accession.replace("-", "")
    index_url = (
        "https://www.sec.gov/Archives/edgar/data/"
        f"{cik_path}/{accession_no_dash}/index.json"
    )
    index = client.get_json(index_url)
    xml_name = next(
        (
            item["name"]
            for item in index.get("directory", {}).get("item", [])
            if str(item.get("name", "")).lower().endswith(".xml")
            and not str(item.get("name", "")).lower().startswith("xsl")
        ),
        "",
    )
    if not xml_name:
        raise ValueError(f"no ownership XML for {ref.accession}")
    sec_url = (
        "https://www.sec.gov/Archives/edgar/data/"
        f"{cik_path}/{accession_no_dash}/{xml_name}"
    )
    return client.get_text(sec_url), sec_url


def refetch_source_filings(
    source: dict[str, Any], client: SecClient
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    failures: list[dict[str, Any]] = []
    filings: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in source.get("trades", []):
        accessions = row.get("sourceAccessions") or [accession_from_row(row)]
        for accession in accessions:
            accession = normalize_accession(str(accession or ""))
            if not accession or accession in seen:
                continue
            seen.add(accession)
            sec_url = str(row.get("secUrl") or "")
            if accession.replace("-", "") not in sec_url:
                failures.append(
                    {
                        **public_pending_row(row),
                        "accession": accession,
                        "reasonCode": "SOURCE_URL_MISSING",
                        "severity": "critical",
                    }
                )
                continue
            try:
                xml_text = client.get_text(sec_url)
                filings.append(
                    parse_form4_xml(
                        xml_text,
                        accession=accession,
                        filed_date=str(row.get("filedDate") or ""),
                        sec_url=sec_url,
                    )
                )
            except Exception as error:
                failures.append(
                    {
                        **public_pending_row(row),
                        "accession": accession,
                        "reasonCode": "SOURCE_REFETCH_FAILED",
                        "severity": "critical",
                        "error": str(error),
                    }
                )

    original_party_pairs = {
        (str(filing.get("issuerCik") or ""), str(filing.get("ownerCik") or ""))
        for filing in filings
        if filing.get("documentType") == "4"
    }
    original_party_ciks = {
        cik for pair in original_party_pairs for cik in pair if cik
    }
    original_filings = list(filings)
    date_range = source.get("meta", {}).get("dateRange") or {}
    start = date_range.get("from")
    end = date_range.get("to")
    latest_filed_date = source.get("meta", {}).get("filedDate")
    if (
        end
        and latest_filed_date
        and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(latest_filed_date))
    ):
        end = min(str(end), str(latest_filed_date))
    if start and end:
        for ref in fetch_amendment_refs(client, start, end):
            if (
                ref.accession in seen
                or ref.cik.lstrip("0") not in original_party_ciks
            ):
                continue
            try:
                xml_text, sec_url = fetch_ref_xml(client, ref)
                amendment = parse_form4_xml(
                    xml_text,
                    accession=ref.accession,
                    filed_date=ref.filed_date,
                    sec_url=sec_url,
                )
                amendment_pair = (
                    str(amendment.get("issuerCik") or ""),
                    str(amendment.get("ownerCik") or ""),
                )
                if (
                    amendment.get("transactions")
                    and amendment_pair in original_party_pairs
                    and amendment_candidates(amendment, original_filings)
                ):
                    filings.append(amendment)
                seen.add(ref.accession)
            except Exception as error:
                failures.append(
                    {
                        "accession": ref.accession,
                        "company": ref.company,
                        "filedDate": ref.filed_date,
                        "reasonCode": "AMENDMENT_REFETCH_FAILED",
                        "severity": "critical",
                        "qualityStatus": "pending",
                        "error": str(error),
                    }
                )
    return filings, failures


def fetch_market_quotes(
    transactions: Iterable[dict[str, Any]], chunk_size: int = 100
) -> dict[tuple[str, str], dict[str, Any]]:
    import pandas as pd
    import yfinance as yf

    legs = list(transactions)
    tickers = sorted({str(row.get("ticker") or "") for row in legs if row.get("ticker")})
    dates = sorted({str(row.get("txDate") or "") for row in legs if row.get("txDate")})
    if not tickers or not dates:
        return {}
    start = date.fromisoformat(dates[0]) - timedelta(days=3)
    end = date.fromisoformat(dates[-1]) + timedelta(days=4)
    quotes: dict[tuple[str, str], dict[str, Any]] = {}
    for offset in range(0, len(tickers), chunk_size):
        batch = tickers[offset : offset + chunk_size]
        try:
            data = yf.download(
                batch,
                start=start.isoformat(),
                end=end.isoformat(),
                auto_adjust=False,
                actions=True,
                group_by="ticker",
                threads=True,
                progress=False,
            )
        except Exception:
            continue
        for ticker in batch:
            try:
                if len(batch) == 1 and not isinstance(data.columns, pd.MultiIndex):
                    frame = data
                elif isinstance(data.columns, pd.MultiIndex):
                    if ticker in data.columns.get_level_values(0):
                        frame = data[ticker]
                    else:
                        frame = data.xs(ticker, axis=1, level=1)
                else:
                    continue
                for timestamp, row in frame.iterrows():
                    low = float(row.get("Low"))
                    high = float(row.get("High"))
                    if not math.isfinite(low) or not math.isfinite(high) or low <= 0 or high <= 0:
                        continue
                    quotes[(ticker, timestamp.date().isoformat())] = {
                        "low": low,
                        "high": high,
                        "split": float(row.get("Stock Splits", 0) or 0),
                    }
            except Exception:
                continue
    return quotes


def load_market_fixture(path: Path) -> dict[tuple[str, str], dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {
        tuple(key.split("|", 1)): value
        for key, value in raw.items()
        if "|" in key
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Validate SEC Form 4 insider data")
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--quarantine", required=True, type=Path)
    parser.add_argument("--report", required=True, type=Path)
    parser.add_argument("--market-fixture", type=Path)
    parser.add_argument("--skip-market-fetch", action="store_true")
    parser.add_argument("--min-market-coverage", type=float, default=0.95)
    parser.add_argument("--max-pending-rate", type=float, default=0.05)
    parser.add_argument("--user-agent", default=DEFAULT_USER_AGENT)
    args = parser.parse_args(argv)

    source = json.loads(args.source.read_text(encoding="utf-8"))
    client = SecClient(args.user_agent)
    filings, fetch_failures = refetch_source_filings(source, client)
    canonical, amendment_pending, _ = reconcile_amendments(filings)
    if args.market_fixture:
        market_quotes = load_market_fixture(args.market_fixture)
    elif args.skip_market_fetch:
        market_quotes = {}
    else:
        market_quotes = fetch_market_quotes(canonical)
    result, quarantine, report = build_dataset(
        filings,
        source_meta=source.get("meta", {}),
        market_quotes=market_quotes,
        max_pending_rate=args.max_pending_rate,
        min_market_coverage=(
            0.0 if args.skip_market_fetch else args.min_market_coverage
        ),
    )
    if fetch_failures:
        result["pendingTrades"].extend(fetch_failures)
        quarantine["pendingTrades"] = list(result["pendingTrades"])
        quarantine["meta"]["count"] = len(quarantine["pendingTrades"])
        result["meta"]["pendingCount"] = len(result["pendingTrades"])
        result["meta"]["dataSha256"] = dataset_sha256(
            {
                "trades": result["trades"],
                "pendingTrades": result["pendingTrades"],
            }
        )
        total_candidates = int(report.get("candidateCount") or 0) + len(
            fetch_failures
        )
        pending_rate = (
            len(result["pendingTrades"]) / total_candidates
            if total_candidates
            else 0.0
        )
        report["pendingCount"] = len(result["pendingTrades"])
        report["pendingRate"] = round(pending_rate, 6)
        report["candidateCount"] = total_candidates
        report["dataSha256"] = result["meta"]["dataSha256"]
        report["fatalErrors"] = [
            error
            for error in report["fatalErrors"]
            if not str(error).startswith("pending rate ")
        ]
        if pending_rate > args.max_pending_rate:
            report["fatalErrors"].append(
                f"pending rate {pending_rate:.2%} exceeds "
                f"{args.max_pending_rate:.2%}"
            )
        report["reviewWarnings"] = sorted(
            {
                str(row.get("reasonCode"))
                for row in result["pendingTrades"]
                if row.get("severity") == "critical" and row.get("reasonCode")
            }
        )
        report["status"] = "failed" if report["fatalErrors"] else "passed"
        result["meta"]["validationStatus"] = report["status"]
    write_json(args.output, result)
    write_json(args.quarantine, quarantine)
    write_json(args.report, report)
    return 0 if report["status"] == "passed" else 1


if __name__ == "__main__":
    raise SystemExit(cli())
