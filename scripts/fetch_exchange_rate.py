"""Store a resilient USD/KRW reference rate used by the display toggle."""
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.request import Request, urlopen

import yfinance as yf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "exchange_rate.json"


def yahoo_close():
    """Return Yahoo's latest completed daily close when it is available."""
    try:
        data = yf.download(
            "KRW=X", period="10d", interval="1d", auto_adjust=False, progress=False
        )
        close = data["Close"].dropna()
        if close.empty:
            return None
        value = close.iloc[-1]
        rate = float(value.iloc[0] if hasattr(value, "iloc") else value)
        return rate, str(close.index[-1].date()), "Yahoo Finance KRW=X completed daily close"
    except Exception as exc:
        print(f"Yahoo Finance USD/KRW unavailable: {exc}")
        return None


def frankfurter_rate():
    """Use Frankfurter as a keyless fallback when Yahoo throttles requests."""
    try:
        request = Request(
            "https://api.frankfurter.app/latest?from=USD&to=KRW",
            headers={"User-Agent": "bmo-moneyflow/1.0"},
        )
        with urlopen(request, timeout=20) as response:
            data = json.load(response)
        return float(data["rates"]["KRW"]), data["date"], "Frankfurter USD/KRW reference rate"
    except Exception as exc:
        print(f"Frankfurter USD/KRW unavailable: {exc}")
        return None


def cached_rate():
    """Keep the site deployable during a temporary outage of both providers."""
    try:
        data = json.loads(OUTPUT.read_text(encoding="utf-8"))
        return (
            float(data["rate"]),
            data["marketDate"],
            f'{data.get("source", "Existing exchange rate")} (cached fallback)',
        )
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        print(f"Cached USD/KRW unavailable: {exc}")
        return None


result = yahoo_close() or frankfurter_rate() or cached_rate()
if result is None:
    raise SystemExit("USD/KRW rate is unavailable from every source")

rate, market_date, source = result
payload = {
    "base": "USD",
    "quote": "KRW",
    "rate": round(rate, 4),
    "marketDate": market_date,
    "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    "source": source,
}
OUTPUT.write_text(
    json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8"
)
print(f"USD/KRW {rate:.4f} ({market_date}; {source})")
