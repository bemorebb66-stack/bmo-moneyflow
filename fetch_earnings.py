import json
import os
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "earnings.json"
MANUAL_INPUT = ROOT / "earnings_manual.json"
FINNHUB_URL = "https://finnhub.io/api/v1/calendar/earnings"


def number_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def load_manual_events():
    if not MANUAL_INPUT.exists():
        return []
    payload = json.loads(MANUAL_INPUT.read_text(encoding="utf-8"))
    return payload.get("events", [])


def merge_events(api_events, manual_events):
    merged = {
        (row["ticker"], row["date"]): row
        for row in api_events
        if row.get("ticker") and row.get("date")
    }
    for row in manual_events:
        ticker = str(row.get("ticker") or "").upper().strip()
        event_date = str(row.get("date") or "").strip()
        if ticker and event_date:
            merged[(ticker, event_date)] = {**row, "ticker": ticker}
    return sorted(merged.values(), key=lambda row: (row["date"], row["ticker"]))


def write_output(events, source, params=None):
    dates = [row["date"] for row in events if row.get("date")]
    output = {
        "meta": {
            "source": source,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "ok",
            "from": params["from"] if params else (min(dates) if dates else ""),
            "to": params["to"] if params else (max(dates) if dates else ""),
            "count": len(events),
            "note": "Finnhub data is supplemented with confirmed dates from official company IR pages.",
        },
        "events": events,
    }
    OUTPUT.write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Saved {len(events)} earnings events to {OUTPUT.name}.")


def main():
    api_key = os.environ.get("FINNHUB_API_KEY", "").strip()
    manual_events = load_manual_events()
    if not api_key:
        existing = []
        if OUTPUT.exists():
            existing = json.loads(OUTPUT.read_text(encoding="utf-8")).get("events", [])
        write_output(
            merge_events(existing, manual_events),
            "Finnhub Earnings Calendar + official company IR pages",
        )
        return

    import requests

    market = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    companies = {
        row["t"]: row.get("nko") or row.get("n") or row["t"]
        for row in market.get("stocks", [])
    }
    today = date.today()
    params = {
        "from": (today - timedelta(days=45)).isoformat(),
        "to": (today + timedelta(days=180)).isoformat(),
        "international": "false",
        "token": api_key,
    }
    response = requests.get(FINNHUB_URL, params=params, timeout=45)
    response.raise_for_status()
    payload = response.json()
    rows = payload.get("earningsCalendar", [])

    events = []
    seen = set()
    for row in rows:
        ticker = str(row.get("symbol") or "").upper().strip()
        event_date = str(row.get("date") or "").strip()
        if ticker not in companies or not event_date:
            continue
        key = (ticker, event_date)
        if key in seen:
            continue
        seen.add(key)
        hour = str(row.get("hour") or "").lower()
        events.append(
            {
                "ticker": ticker,
                "company": companies[ticker],
                "date": event_date,
                "hour": hour if hour in {"bmo", "amc", "dmh"} else "",
                "quarter": row.get("quarter"),
                "year": row.get("year"),
                "epsActual": number_or_none(row.get("epsActual")),
                "epsEstimate": number_or_none(row.get("epsEstimate")),
                "revenueActual": number_or_none(row.get("revenueActual")),
                "revenueEstimate": number_or_none(row.get("revenueEstimate")),
            }
        )

    write_output(
        merge_events(events, manual_events),
        "Finnhub Earnings Calendar + official company IR pages",
        params,
    )


if __name__ == "__main__":
    main()
