import json
import re
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = ROOT / "stock_directory.json"
NASDAQ_SCREENER_URL = "https://api.nasdaq.com/api/screener/stocks"
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
    ),
}
EXCLUDED_NAME_PARTS = (
    " warrant",
    " warrants",
    " right",
    " rights",
    " unit",
    " units",
    " preferred stock",
    " preferred share",
    " preference share",
    " senior notes",
    " notes due",
)
SYMBOL_PATTERN = re.compile(r"^[A-Z][A-Z0-9.-]{0,9}$")


def clean_text(value):
    return " ".join(str(value or "").replace("\n", " ").split())


def is_supported_security(row):
    symbol = clean_text(row.get("symbol")).upper()
    name = f" {clean_text(row.get('name')).lower()}"
    if not SYMBOL_PATTERN.fullmatch(symbol):
        return False
    return not any(part in name for part in EXCLUDED_NAME_PARTS)


def normalize_row(row):
    market_cap = row.get("marketCap")
    try:
        market_cap = int(float(market_cap or 0))
    except (TypeError, ValueError):
        market_cap = 0
    return {
        "ticker": clean_text(row.get("symbol")).upper(),
        "name": clean_text(row.get("name")),
        "sector": clean_text(row.get("sector")),
        "industry": clean_text(row.get("industry")),
        "marketCap": market_cap,
        "ipoYear": clean_text(row.get("ipoyear")),
    }


def fetch_rows():
    query = urlencode(
        {
            "tableonly": "true",
            "limit": "10000",
            "offset": "0",
            "download": "true",
        }
    )
    request = Request(f"{NASDAQ_SCREENER_URL}?{query}", headers=HEADERS)
    with urlopen(request, timeout=60) as response:
        payload = json.loads(response.read().decode("utf-8"))
    return payload.get("data", {}).get("rows", []) or []


def build_directory(rows):
    records = {
        normalized["ticker"]: normalized
        for row in rows
        if is_supported_security(row)
        for normalized in [normalize_row(row)]
        if normalized["ticker"] and normalized["name"]
    }
    return [records[ticker] for ticker in sorted(records)]


def main():
    directory = build_directory(fetch_rows())
    if len(directory) < 3000:
        raise RuntimeError(
            f"상장 종목 목록이 비정상적으로 적어 저장하지 않습니다: {len(directory)}개"
        )
    OUTPUT_PATH.write_text(
        json.dumps(
            {"source": "Nasdaq Stock Screener", "count": len(directory), "stocks": directory},
            ensure_ascii=False,
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    print(f"상장 종목 검색 목록 저장: {len(directory)}개")


if __name__ == "__main__":
    main()
