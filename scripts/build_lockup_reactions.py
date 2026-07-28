"""Build post-lockup market reactions for SEC-verified fixed-date events."""

from __future__ import annotations

import json
import math
import time
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
LOCKUP_PATH = ROOT / "ipo-lockup" / "data" / "lockup.json"
OUTPUT_PATH = ROOT / "ipo-lockup" / "data" / "reactions.json"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
USER_AGENT = "BVTMoneyFlow/1.0 admin@bvtmoneyflow.xyz"


def classify_reaction(price_return: float, trading_value_ratio: float) -> tuple[str, str]:
    magnitude = abs(price_return)
    if magnitude >= 10 or trading_value_ratio >= 2:
        impact = "high"
    elif magnitude >= 5 or trading_value_ratio >= 1.5:
        impact = "medium"
    else:
        impact = "limited"

    if price_return <= -5 and trading_value_ratio >= 1.2:
        direction = "negative"
    elif price_return >= 5:
        direction = "positive"
    else:
        direction = "mixed"
    return impact, direction


def calculate_reaction(
    ticker: str,
    event_date: str,
    records: list[dict[str, Any]],
) -> dict[str, Any] | None:
    event = date.fromisoformat(event_date)
    clean = sorted(
        (
            {
                "date": date.fromisoformat(str(row["date"])),
                "close": float(row["close"]),
                "volume": float(row["volume"]),
            }
            for row in records
            if row.get("date")
            and row.get("close") is not None
            and row.get("volume") is not None
            and float(row["close"]) > 0
            and float(row["volume"]) >= 0
        ),
        key=lambda row: row["date"],
    )
    event_index = next(
        (index for index, row in enumerate(clean) if row["date"] >= event),
        None,
    )
    if event_index is None or event_index < 10:
        return None

    before = clean[max(0, event_index - 20) : event_index]
    after = clean[event_index : event_index + 5]
    if len(before) < 10 or len(after) < 3:
        return None

    before_values = [row["close"] * row["volume"] for row in before]
    after_values = [row["close"] * row["volume"] for row in after]
    before_average = sum(before_values) / len(before_values)
    after_average = sum(after_values) / len(after_values)
    if before_average <= 0:
        return None

    pre_close = before[-1]["close"]
    post_close = after[-1]["close"]
    price_return = round((post_close / pre_close - 1) * 100, 2)
    trading_value_ratio = round(after_average / before_average, 2)
    impact, direction = classify_reaction(price_return, trading_value_ratio)

    return {
        "ticker": ticker,
        "eventDate": event_date,
        "firstTradingDate": after[0]["date"].isoformat(),
        "lastTradingDate": after[-1]["date"].isoformat(),
        "sessions": len(after),
        "preClose": round(pre_close, 4),
        "postClose": round(post_close, 4),
        "priceReturn": price_return,
        "tradingValueRatio": trading_value_ratio,
        "impact": impact,
        "direction": direction,
    }


def fetch_daily_records(ticker: str, event_date: str) -> list[dict[str, Any]]:
    event = date.fromisoformat(event_date)
    start = datetime.combine(event - timedelta(days=45), datetime.min.time(), tzinfo=timezone.utc)
    end_date = min(date.today() + timedelta(days=1), event + timedelta(days=20))
    end = datetime.combine(end_date, datetime.min.time(), tzinfo=timezone.utc)
    query = urllib.parse.urlencode(
        {
            "period1": int(start.timestamp()),
            "period2": int(end.timestamp()),
            "interval": "1d",
            "events": "history",
            "includeAdjustedClose": "true",
        }
    )
    request = urllib.request.Request(
        f"{YAHOO_CHART_URL.format(ticker=urllib.parse.quote(ticker))}?{query}",
        headers={"User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    result = payload["chart"]["result"][0]
    timestamps = result.get("timestamp") or []
    quote = (result.get("indicators", {}).get("quote") or [{}])[0]
    closes = quote.get("close") or []
    volumes = quote.get("volume") or []
    records = []
    for timestamp, close, volume in zip(timestamps, closes, volumes):
        if close is None or volume is None or not math.isfinite(float(close)):
            continue
        records.append(
            {
                "date": datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat(),
                "close": close,
                "volume": volume,
            }
        )
    return records


def build_reactions(payload: dict[str, Any]) -> dict[str, Any]:
    today = date.today()
    reactions = []
    failures = []
    eligible = [
        row
        for row in payload.get("events", [])
        if row.get("majorIpo")
        and row.get("termsVerified")
        and row.get("datePrecision") == "fixed"
        and row.get("lockupDate")
        and date.fromisoformat(row["lockupDate"]) < today
    ]
    for row in eligible:
        try:
            records = fetch_daily_records(row["ticker"], row["lockupDate"])
            reaction = calculate_reaction(row["ticker"], row["lockupDate"], records)
            if reaction:
                reaction["eventId"] = row["id"]
                reactions.append(reaction)
            else:
                failures.append({"ticker": row["ticker"], "reason": "insufficient-history"})
        except Exception as exc:
            failures.append({"ticker": row["ticker"], "reason": type(exc).__name__})
        time.sleep(0.12)

    return {
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "method": "직전 종가 대비 이후 최대 5거래일 수익률 및 직전 20거래일 평균 대비 거래대금",
            "eligibleCount": len(eligible),
            "reactionCount": len(reactions),
            "failureCount": len(failures),
        },
        "reactions": reactions,
        "failures": failures,
    }


def main() -> None:
    payload = json.loads(LOCKUP_PATH.read_text(encoding="utf-8"))
    output = build_reactions(payload)
    OUTPUT_PATH.write_text(
        json.dumps(output, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"Built {output['meta']['reactionCount']}/"
        f"{output['meta']['eligibleCount']} verified lockup reactions."
    )


if __name__ == "__main__":
    main()
