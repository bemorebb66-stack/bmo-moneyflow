import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "earnings.json"
MANUAL_INPUT = ROOT / "earnings_manual.json"
FINNHUB_URL = "https://finnhub.io/api/v1/calendar/earnings"
CORE_INDICES = {"S&P 500", "Nasdaq 100"}
THEME_TICKERS = {
    "IONQ",
    "RGTI",
    "QBTS",
    "QUBT",
    "ARQQ",
    "LAES",
    "COIN",
    "MSTR",
    "HOOD",
    "BMNR",
    "RIOT",
    "MARA",
    "CLSK",
    "WULF",
    "IREN",
    "CIFR",
    "HUT",
    "BTDR",
    "CORZ",
}
SUPPLEMENTAL_LIMIT = 160


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


def build_earnings_universe(market):
    stocks = market.get("stocks", [])
    universe = {}
    for row in stocks:
        ticker = str(row.get("t") or "").upper()
        indices = set(row.get("uni") or [])
        if indices & CORE_INDICES:
            universe[ticker] = "core-index"
        elif ticker in THEME_TICKERS:
            universe[ticker] = "theme"

    liquid = sorted(
        (
            row
            for row in stocks
            if row.get("t") and "Russell 2000" in set(row.get("uni") or [])
        ),
        key=lambda row: float(row.get("dv") or 0),
        reverse=True,
    )
    for row in liquid[:80]:
        universe.setdefault(str(row["t"]).upper(), "popular-small-cap")
    return universe


def select_supplemental_tickers(market, universe, today, limit=SUPPLEMENTAL_LIMIT):
    stocks = {str(row.get("t") or "").upper(): row for row in market.get("stocks", [])}
    themes = sorted(ticker for ticker, tier in universe.items() if tier == "theme")
    ranked = sorted(
        universe,
        key=lambda ticker: float(stocks.get(ticker, {}).get("dv") or 0),
        reverse=True,
    )
    liquid = ranked[:90]
    core = sorted(ticker for ticker, tier in universe.items() if tier == "core-index")
    rotation_size = max(0, limit - len(set(themes + liquid)))
    start = (today.toordinal() * max(rotation_size, 1)) % max(len(core), 1)
    rotated = (core + core)[start : start + rotation_size]
    selected = list(dict.fromkeys(themes + liquid + rotated))
    return selected[:limit]


def normalize_event(row, companies, universe):
    ticker = str(row.get("symbol") or row.get("ticker") or "").upper().strip()
    event_date = str(row.get("date") or "").strip()
    if ticker not in companies or not event_date:
        return None
    hour = str(row.get("hour") or "").lower()
    return {
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
        "trackingTier": universe.get(ticker, "calendar"),
        "source": row.get("source") or "Finnhub Earnings Calendar",
        "sourceUrl": row.get("sourceUrl"),
    }


def write_output(events, source, params=None, coverage=None):
    dates = [row["date"] for row in events if row.get("date")]
    output = {
        "meta": {
            "source": source,
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "status": "ok",
            "from": params["from"] if params else (min(dates) if dates else ""),
            "to": params["to"] if params else (max(dates) if dates else ""),
            "count": len(events),
            "coverage": coverage or {},
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
    universe = build_earnings_universe(market)
    params = {
        "from": (today - timedelta(days=45)).isoformat(),
        "to": (today + timedelta(days=180)).isoformat(),
        "international": "false",
        "token": api_key,
    }
    response = requests.get(FINNHUB_URL, params=params, timeout=45)
    response.raise_for_status()
    payload = response.json()
    rows = list(payload.get("earningsCalendar", []))

    supplemental_tickers = select_supplemental_tickers(market, universe, today)
    supplemental_hits = 0
    for ticker in supplemental_tickers:
        symbol_params = {**params, "symbol": ticker}
        try:
            time.sleep(1.02)
            symbol_response = requests.get(
                FINNHUB_URL, params=symbol_params, timeout=45
            )
            symbol_response.raise_for_status()
            symbol_rows = symbol_response.json().get("earningsCalendar", [])
            supplemental_hits += len(symbol_rows)
            rows.extend(symbol_rows)
        except Exception as error:
            print(f"{ticker}: supplemental earnings lookup failed: {error}")

    events = []
    seen = set()
    for row in rows:
        event = normalize_event(row, companies, universe)
        if event is None:
            continue
        key = (event["ticker"], event["date"])
        if key in seen:
            continue
        seen.add(key)
        events.append(event)

    write_output(
        merge_events(events, manual_events),
        "Finnhub Earnings Calendar + official company IR pages",
        params,
        {
            "coreIndices": sorted(CORE_INDICES),
            "trackedUniverseCount": len(universe),
            "supplementalTickerCount": len(supplemental_tickers),
            "supplementalEventCount": supplemental_hits,
            "themes": ["양자컴퓨팅", "디지털자산"],
            "rotation": "거래대금 상위 우선 + 나머지 지수 종목 일별 순환",
        },
    )


if __name__ == "__main__":
    main()
