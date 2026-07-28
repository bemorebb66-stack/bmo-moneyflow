import json
import os
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "news.json"
BASE_URL = "https://finnhub.io/api/v1"
MAX_TICKERS = 120


def priority_tickers(market):
    stocks = market.get("stocks", [])
    ranked = sorted(
        stocks,
        key=lambda row: (
            float(row.get("dv") or 0),
            float(row.get("dv") or 0) / max(float(row.get("a20") or 1), 1),
        ),
        reverse=True,
    )
    surge = sorted(
        stocks,
        key=lambda row: float(row.get("dv") or 0)
        / max(float(row.get("a20") or 1), 1),
        reverse=True,
    )
    ordered = []
    for row in ranked[:80] + surge[:80]:
        ticker = str(row.get("t") or "").upper()
        if ticker and ticker not in ordered:
            ordered.append(ticker)
    return ordered[:MAX_TICKERS]


def request_json(path, params):
    import requests

    response = requests.get(f"{BASE_URL}/{path}", params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def clean_headline(value):
    return " ".join(str(value or "").split()).strip()


def main():
    token = os.environ.get("FINNHUB_API_KEY", "").strip()
    if not token:
        print("FINNHUB_API_KEY is not set; keeping existing news.json.")
        return

    market = json.loads((ROOT / "data.json").read_text(encoding="utf-8"))
    names = {
        row["t"]: row.get("nko") or row.get("n") or row["t"]
        for row in market.get("stocks", [])
    }
    tickers = priority_tickers(market)
    today = date.today()
    start = (today - timedelta(days=10)).isoformat()
    end = today.isoformat()
    companies = {}

    for index, ticker in enumerate(tickers):
        if index:
            time.sleep(1.05)
        try:
            headlines = request_json(
                "company-news",
                {"symbol": ticker, "from": start, "to": end, "token": token},
            )
            time.sleep(1.05)
            profile = request_json(
                "stock/profile2", {"symbol": ticker, "token": token}
            )
        except Exception as error:
            print(f"{ticker}: {error}")
            continue

        seen = set()
        news = []
        for row in sorted(
            headlines if isinstance(headlines, list) else [],
            key=lambda item: int(item.get("datetime") or 0),
            reverse=True,
        ):
            headline = clean_headline(row.get("headline"))
            url = str(row.get("url") or "").strip()
            if not headline or not url:
                continue
            key = headline.casefold()
            if key in seen:
                continue
            seen.add(key)
            news.append(
                {
                    "headline": headline,
                    "source": clean_headline(row.get("source")) or "원문",
                    "url": url,
                    "datetime": int(row.get("datetime") or 0),
                }
            )
            if len(news) >= 5:
                break

        website = str(profile.get("weburl") or "").strip()
        companies[ticker] = {
            "company": names.get(ticker) or profile.get("name") or ticker,
            "website": website if website.startswith("http") else "",
            "news": news,
        }

    payload = {
        "meta": {
            "source": "Finnhub company news and company profile",
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "from": start,
            "to": end,
            "tickerCount": len(companies),
            "priority": "거래대금 상위·20일 평균 대비 급증 종목",
        },
        "companies": companies,
    }
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Saved news for {len(companies)} tickers to {OUTPUT.name}.")


if __name__ == "__main__":
    main()
