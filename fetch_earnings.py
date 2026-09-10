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
YAHOO_FINANCIALS_URL = "https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/{ticker}"
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
        # Separate provider EPS periods must not evict statement history.
        history_key = (ticker, row.get("dateKind") == "provider-period")
        count = reported_by_ticker.get(history_key, 0)
        if count < max_quarters:
            retained.append(row)
            reported_by_ticker[history_key] = count + 1
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
                "periodEnd": event_date,
                "dateKind": "period-end",
                "epsActual": actual,
                "epsEstimate": number_or_none(row.get("estimate")),
                "status": "reported",
                "trackingTier": universe.get(ticker, "calendar"),
                "source": "Finnhub Company Earnings",
            }
        )
    return events


def normalize_yahoo_financials(payload, ticker, companies, universe, cutoff):
    values_by_date = {}
    metric_fields = {
        "quarterlyTotalRevenue": "revenueActual",
        "quarterlyNetIncome": "netIncomeActual",
    }
    result = payload.get("timeseries", {}).get("result", []) if isinstance(payload, dict) else []
    for series in result:
        for source_field, target_field in metric_fields.items():
            for point in series.get(source_field, []) or []:
                event_date = str(point.get("asOfDate") or "")[:10]
                value = number_or_none((point.get("reportedValue") or {}).get("raw"))
                if event_date and event_date >= cutoff.isoformat() and value is not None:
                    values_by_date.setdefault(event_date, {})[target_field] = value
    events = []
    for event_date, values in values_by_date.items():
        month = int(event_date[5:7])
        events.append(
            {
                "ticker": ticker,
                "company": companies[ticker],
                "date": event_date,
                "hour": "",
                "periodEnd": event_date,
                "dateKind": "period-end",
                **values,
                "status": "reported",
                "trackingTier": universe.get(ticker, "calendar"),
                "source": "Yahoo Finance quarterly fundamentals",
            }
        )
    return sorted(events, key=lambda row: row["date"])


def merge_company_financial_history(earnings_rows, financial_rows):
    if not financial_rows:
        return earnings_rows
    merged = []
    for financial in financial_rows:
        row = dict(financial)
        matches = [e for e in earnings_rows if e.get("ticker") == row.get("ticker")
                   and e["date"] == row["date"]]
        if len(matches) == 1:
            for key in ("epsActual", "epsEstimate"):
                if matches[0].get(key) is not None:
                    row[key] = matches[0][key]
        merged.append(row)
    used = {(r.get("ticker"), r["date"]) for r in financial_rows}
    merged.extend(dict(r, dateKind="provider-period") for r in earnings_rows
                  if (r.get("ticker"), r["date"]) not in used)
    return sorted(merged, key=lambda row: row["date"])


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
        # Fiscal labels alone can refer to different calendar years across
        # providers. Never attach results to an unrelated future announcement.
        if reported and row["date"] <= date.today().isoformat() and period not in used_periods and 0 <= (date.fromisoformat(row["date"]) - date.fromisoformat(
            reported.get("periodEnd", reported["date"])
        )).days <= 120:
            actuals = {
                key: value
                for key, value in reported.items()
                if key in {"epsActual", "revenueActual", "netIncomeActual"}
                and value is not None
            }
            merged.append({**reported, **row, **actuals, "status": "reported", "dateKind": "announcement"})
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
    events = reconcile_cached_history(events)
    # A future period cannot contain published actuals. Quarantine these rows
    # even when an older cached file is reused without API credentials.
    today = date.today().isoformat()
    events = [row for row in events if not (
        row.get("date", "") > today
        and any(row.get(key) is not None for key in
                ("epsActual", "revenueActual", "netIncomeActual"))
    )]
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


def reconcile_cached_history(events):
    """Remove legacy positional joins; never infer fiscal periods from months.

    Finnhub company periods can be fiscal/calendar placeholders, not actual
    closing dates. Preserve unmatched EPS as separate provider periods.
    Only consolidate after transferring their values. Official releases override
    their corresponding statement, including providers' month-end rounding.
    """
    financials = {}
    for row in events:
        if row.get("source") == "Yahoo Finance quarterly fundamentals":
            financials.setdefault(row["ticker"], []).append(row)
    official = [dict(r) for r in events if r.get("confirmed") and r.get("periodEnd")
                and r.get("dateKind") == "announcement"]
    def official_match(row):
        matches = [r for r in official if r["ticker"] == row["ticker"]
                   and row.get("year") == r.get("year") and row.get("quarter") == r.get("quarter")
                   and row.get("epsActual") is not None and row.get("epsActual") == r.get("epsActual")
                   and abs((date.fromisoformat(row["date"]) - date.fromisoformat(r["date"])).days) <= 120]
        return matches[0] if len(matches) == 1 else None
    for row in events:
        if row.get("source") == "Finnhub Company Earnings":
            match = official_match(row)
            if match is not None and row.get("epsEstimate") is not None and match.get("epsEstimate") is None:
                match["epsEstimate"] = row["epsEstimate"]
                match["epsEstimateSource"] = row["source"]
    clean = []
    for original in events:
        row = dict(original)
        source = row.get("source", "")
        if row.get("confirmed") and row.get("periodEnd") and row.get("dateKind") == "announcement":
            row = next(r for r in official if r["ticker"] == row["ticker"] and r["date"] == row["date"])
        if source == "Finnhub Company Earnings":
            # These fields may have been copied by the old index-based join.
            row.pop("revenueActual", None)
            row.pop("netIncomeActual", None)
            if official_match(row) is not None:
                continue
            if any(f["date"] == row["date"] for f in financials.get(row["ticker"], [])):
                continue
            row["dateKind"] = "provider-period"
            row.pop("periodEnd", None)
        if source == "Yahoo Finance quarterly fundamentals":
            row.pop("year", None)
            row.pop("quarter", None)
            row["periodEnd"] = row["date"]
            row["dateKind"] = "period-end"
            if any(r["ticker"] == row["ticker"] and abs((
                date.fromisoformat(r["periodEnd"]) - date.fromisoformat(row["date"])
            ).days) <= 7 for r in official):
                continue
            matches = [r for r in events if r.get("source") == "Finnhub Company Earnings"
                       and r["ticker"] == row["ticker"] and r["date"] == row["date"]]
            if len(matches) == 1:
                for key in ("epsActual", "epsEstimate"):
                    if matches[0].get(key) is not None:
                        row[key] = matches[0][key]
        clean.append(row)
    return merge_events([], clean)


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
            earnings_response = requests.get(
                FINNHUB_COMPANY_EARNINGS_URL,
                params={"symbol": ticker, "limit": MAX_REPORTED_QUARTERS, "token": api_key},
                timeout=45,
            )
            earnings_response.raise_for_status()
            symbol_rows = normalize_company_earnings(
                earnings_response.json(), ticker, companies, universe, history_cutoff
            )
        except Exception as error:
            print(f"{ticker}: company earnings lookup failed: {error}")
        try:
            financial_response = requests.get(
                YAHOO_FINANCIALS_URL.format(ticker=ticker),
                params={
                    "symbol": ticker,
                    "type": "quarterlyTotalRevenue,quarterlyNetIncome",
                    "period1": int(datetime.combine(history_cutoff, datetime.min.time(), tzinfo=timezone.utc).timestamp()),
                    "period2": int(datetime.combine(today + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc).timestamp()),
                },
                headers={"User-Agent": "Mozilla/5.0"},
                timeout=45,
            )
            financial_response.raise_for_status()
            financial_rows = normalize_yahoo_financials(
                financial_response.json(), ticker, companies, universe, history_cutoff
            )
            symbol_rows = merge_company_financial_history(symbol_rows, financial_rows)
        except Exception as error:
            print(f"{ticker}: quarterly financials lookup failed: {error}")
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
        reconcile_cached_history(merge_events(persisted_events, manual_events))
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
