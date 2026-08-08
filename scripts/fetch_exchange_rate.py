"""Store the latest completed USD/KRW close used by the display toggle."""
from datetime import datetime, timezone
import json
from pathlib import Path
import yfinance as yf

ROOT = Path(__file__).resolve().parents[1]

data = yf.download("KRW=X", period="10d", interval="1d", auto_adjust=False, progress=False)
close = data["Close"].dropna()
if close.empty:
    raise SystemExit("USD/KRW close is unavailable")
rate = float(close.iloc[-1].iloc[0] if hasattr(close.iloc[-1], "iloc") else close.iloc[-1])
market_date = str(close.index[-1].date())
payload = {
    "base": "USD",
    "quote": "KRW",
    "rate": round(rate, 4),
    "marketDate": market_date,
    "updated": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
    "source": "Yahoo Finance KRW=X completed daily close",
}
(ROOT / "exchange_rate.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
print(f"USD/KRW {rate:.4f} ({market_date})")
