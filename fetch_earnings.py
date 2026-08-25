import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "earnings.json"
MANUAL_INPUT = ROOT / "earnings_manual.json"
FINNHUB_URL = "https://finnhub.io/api/v1/calendar/earnings"
FINNHUB_REPORTED_FINANCIALS_URL = "https://finnhub.io/api/v1/stock/financials-reported"
FINNHUB_COMPANY_EARNINGS_URL = "https://finnhub.io/api/v1/stock/earnings"
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
HISTORICAL_LOOKBACK_DAYS = 550
MAX_REPORTED_QUARTERS = 8
REVENUE_CONCEPTS = (
    "RevenueFromContractWithCustomerExcludingAssessedTax",
    "Revenues",
    "SalesRevenueNet",
    "SalesRevenueGoodsNet",
)
NET_INCOME_CONCEPTS = (
    "NetIncomeLoss",
    "ProfitLoss",
    "NetIncomeLossAvailableToCommonStockholdersBasic",
)
EPS_CONCEPTS = (
    "EarningsPerShareDiluted",
    "EarningsPerShareBasicAndDiluted",
    "EarningsPerShareBasic",
)


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


def merge_events(base_events, override_events):
    merged = {}
    for row in [*base_events, *override_events]:
        ticker = str(row.get("ticker") or "").upper().strip()
        event_date = str(row.get("date") or "").strip()
        if ticker and event_date:
            key = (ticker, event_date)
            current = merged.get(key, {})
            # A manually confirmed date/source should win, while blank manual
            # metrics must not erase actual results later supplied by Finnhub.
            updates = {
                field: value
                for field, value in row.items()
                if value is not None and value != ""
            }
            merged[key] = {**current, **updates, "ticker": ticker, "date": event_date}
    return sorted(merged.values(), key=lambda row: (row["date"], row["ticker"]))


def merge_with_existing(existing_events, fresh_events, today):
    fresh_periods = {
        (
            str(row.get("ticker") or "").upper(),
            row.get("year"),
            row.get("quarter"),
        )
        for row in fresh_events
        if row.get("ticker") and row.get("year") and row.get("quarter")
    }
    retained = []
    for row in existing_events:
        ticker = str(row.get("ticker") or "").upper()
        event_date = str(row.get("date") or "")
        period = (ticker, row.get("year"), row.get("quarter"))
        has_result = row.get("epsActual") is not None or row.get("revenueActual") is not None
        is_future = event_date >= today.isoformat()
        if has_result or (is_future and period not in fresh_periods):
            retained.append(row)
    return merge_events(retained, fresh_events)


def limit_reported_history(events, max_quarters=MAX_REPORTED_QUARTERS):
    reported_by_ticker = {}
    retained = []
    for row in sorted(events, key=lambda item: (item.get("date", ""), item.get("ticker", "")), reverse=True):
        has_result = row.get("epsActual") is not None or row.get("revenueActual") is not None
        if not has_result:
            retained.append(row)
            continue
        ticker = str(row.get("ticker") or "").upper()
        count = reported_by_ticker.get(ticker, 0)
        if count < max_quarters:
            retained.append(row)
            reported_by_ticker[ticker] = count + 1
    return sorted(retained, key=lambda row: (row.get("date", ""), row.get("ticker", "")))


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


def select_supplemental_tickers(
    market, universe, today, limit=SUPPLEMENTAL_LIMIT, priority_tickers=None
):
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
    selected = list(
        dict.fromkeys(
            [
                ticker
                for ticker in (priority_tickers or [])
                if ticker in universe
            ]
            + themes
            + liquid
            + rotated
        )
    )
    return selected[:limit]


def normalize_event(row, companies, universe):
    ticker = str(row.get("symbol") or row.get("ticker") or "").upper().strip()
    event_date = str(row.get("date") or "").strip()
    if ticker not in companies or not event_date:
        return None
    hour = str(row.get("hour") or "").lower()
    eps_actual = number_or_none(row.get("epsActual"))
    revenue_actual = number_or_none(row.get("revenueActual"))
    return {
        "ticker": ticker,
        "company": companies[ticker],
        "date": event_date,
        "hour": hour if hour in {"bmo", "amc", "dmh"} else "",
        "quarter": row.get("quarter"),
        "year": row.get("year"),
        "epsActual": eps_actual,
        "epsEstimate": number_or_none(row.get("epsEstimate")),
        "revenueActual": revenue_actual,
        "revenueEstimate": number_or_none(row.get("revenueEstimate")),
        "status": (
            "reported"
            if eps_actual is not None or revenue_actual is not None
            else "scheduled"
        ),
        "trackingTier": universe.get(ticker, "calendar"),
        "source": row.get("source") or "Finnhub Earnings Calendar",
        "sourceUrl": row.get("sourceUrl"),
    }


def reported_metric(report, concepts):
    rows = report.get("ic", []) if isinstance(report, dict) else []
    by_concept = {
        str(row.get("concept") or ""): row
        for row in rows
        if isinstance(row, dict)
    }
    for concept in concepts:
        row = by_concept.get(concept)
        value = number_or_none(row.get("value")) if row else None
        if value is not None:
            return value
    return None


def normalize_reported_financials(payload, ticker, companies, universe, cutoff):
    events = []
    for row in payload.get("data", []) if isinstance(payload, dict) else []:
        year = row.get("year")
        quarter = row.get("quarter")
        event_date = str(
            row.get("filedDate") or row.get("acceptedDate") or row.get("endDate") or ""
        )[:10]
        if not year or not quarter or not event_date or event_date < cutoff.isoformat():
            continue
        report = row.get("report") or {}
        revenue = reported_metric(report, REVENUE_CONCEPTS)
        net_income = reported_metric(report, NET_INCOME_CONCEPTS)
        eps = reported_metric(report, EPS_CONCEPTS)
        if revenue is None and net_income is None and eps is None:
            continue
        events.append(
            {
                "ticker": ticker,
                "company": companies[ticker],
                "date": event_date,
                "hour": "",
                "quarter": quarter,
                "year": year,
                "epsActual": eps,
                "revenueActual": revenue,
                "netIncomeActual": net_income,
                "status": "reported",
                "trackingTier": universe.get(ticker, "calendar"),
                "source": "Finnhub Financials as Reported",
            }
        )
    return events


def normalize_company_earnings(rows, ticker, companies, universe, cutoff):
    events = []
    for row in rows if isinstance(rows, list) else []:
        event_date = str(row.get("period") or "")[:10]
        actual = number_or_none(row.get("actual"))
        if not event_date or event_date < cutoff.isoformat() or actual is None:
            continue
        events.append(
            {
                "ticker": ticker,
                "company": companies[ticker],
                "date": event_date,
                "hour": "",
                "quarter": row.get("quarter"),
                "year": row.get("year"),
                "epsActual": actual,
                "epsEstimate": number_or_none(row.get("estimate")),
                "status": "reported",
                "trackingTier": universe.get(ticker, "calendar"),
                "source": "Finnhub Company Earnings",
            }
        )
    return events


def merge_reported_history(calendar_events, reported_events):
    reported_by_period = {
        (row.get("ticker"), row.get("year"), row.get("quarter")): row
        for row in reported_events
        if row.get("ticker") and row.get("year") and row.get("quarter")
    }
    merged = []
    used_periods = set()
    for row in calendar_events:
        period = (row.get("ticker"), row.get("year"), row.get("quarter"))
        reported = reported_by_period.get(period)
        if reported:
            actuals = {
                key: value
                for key, value in reported.items()
                if key in {"epsActual", "revenueActual", "netIncomeActual"}
                and value is not None
            }
            merged.append({**reported, **row, **actuals, "status": "reported"})
            used_periods.add(period)
        else:
            merged.append(row)
    merged.extend(
        row
        for row in reported_events
        if (row.get("ticker"), row.get("year"), row.get("quarter")) not in used_periods
    )
    return merge_events([], merged)


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
    existing = []
    if OUTPUT.exists():
        existing = json.loads(OUTPUT.read_text(encoding="utf-8")).get("events", [])
    if not api_key:
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

    near_start = today - timedelta(days=7)
    near_end = today + timedelta(days=21)
    near_event_tickers = [
        str(row.get("symbol") or "").upper()
        for row in rows
        if str(row.get("date") or "") >= near_start.isoformat()
        and str(row.get("date") or "") <= near_end.isoformat()
    ]
    supplemental_tickers = select_supplemental_tickers(
        market,
        universe,
        today,
        priority_tickers=near_event_tickers,
    )
    supplemental_hits = 0
    reported_rows = []
    history_cutoff = today - timedelta(days=HISTORICAL_LOOKBACK_DAYS)
    for ticker in supplemental_tickers:
        symbol_rows = []
        try:
            time.sleep(1.02)
            symbol_response = requests.get(
                FINNHUB_REPORTED_FINANCIALS_URL,
                params={"symbol": ticker, "freq": "quarterly", "token": api_key},
                timeout=45,
            )
            symbol_response.raise_for_status()
            symbol_rows = normalize_reported_financials(
                symbol_response.json(), ticker, companies, universe, history_cutoff
            )
        except Exception as error:
            print(f"{ticker}: reported financials lookup failed: {error}")
        if not symbol_rows:
            try:
                fallback_response = requests.get(
                    FINNHUB_COMPANY_EARNINGS_URL,
                    params={"symbol": ticker, "limit": MAX_REPORTED_QUARTERS, "token": api_key},
                    timeout=45,
                )
                fallback_response.raise_for_status()
                symbol_rows = normalize_company_earnings(
                    fallback_response.json(), ticker, companies, universe, history_cutoff
                )
            except Exception as error:
                print(f"{ticker}: company earnings fallback failed: {error}")
        supplemental_hits += len(symbol_rows)
        reported_rows.extend(symbol_rows)

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

    events = merge_reported_history(events, reported_rows)
    persisted_events = merge_with_existing(existing, events, today)
    merged_events = limit_reported_history(
        merge_events(persisted_events, manual_events)
    )
    for event in merged_events:
        has_result = (
            event.get("epsActual") is not None
            or event.get("revenueActual") is not None
        )
        event["status"] = (
            "reported"
            if has_result
            else "scheduled"
            if event.get("date", "") >= today.isoformat()
            else "awaiting-results"
        )

    write_output(
        merged_events,
        "Finnhub Earnings Calendar + official company IR pages",
        params,
        {
            "coreIndices": sorted(CORE_INDICES),
            "trackedUniverseCount": len(universe),
            "supplementalTickerCount": len(supplemental_tickers),
            "supplementalEventCount": supplemental_hits,
            "reportedHistoryQuarters": MAX_REPORTED_QUARTERS,
            "reportedHistoryLookbackDays": HISTORICAL_LOOKBACK_DAYS,
            "themes": ["양자컴퓨팅", "디지털자산"],
            "rotation": "거래대금 상위 우선 + 나머지 지수 종목 일별 순환",
        },
    )


if __name__ == "__main__":
    main()
