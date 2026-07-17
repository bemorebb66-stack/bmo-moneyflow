# -*- coding: utf-8 -*-
"""네이버 증권의 미국 주식 한글명을 BVT 종목 유니버스에 맞춰 저장한다."""
import json
import math
import os
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SECTOR_MAP_PATH = os.path.join(ROOT, "sector_map.json")
OUTPUT_PATH = os.path.join(ROOT, "korean_names.json")
EXCHANGES = ("NASDAQ", "NYSE", "AMEX")
PAGE_SIZE = 100
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def load_page(exchange, page):
    query = urlencode({"page": page, "pageSize": PAGE_SIZE})
    url = f"https://api.stock.naver.com/stock/exchange/{exchange}/marketValue?{query}"
    request = Request(url, headers={"User-Agent": UA})
    with urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def main():
    with open(SECTOR_MAP_PATH, encoding="utf-8") as file:
        target_tickers = set(json.load(file))

    names = {}
    for exchange in EXCHANGES:
        first = load_page(exchange, 1)
        pages = math.ceil(int(first.get("totalCount") or 0) / PAGE_SIZE)
        for page in range(1, pages + 1):
            payload = first if page == 1 else load_page(exchange, page)
            for stock in payload.get("stocks", []):
                ticker = str(stock.get("symbolCode") or "").replace(".", "-").upper()
                korean_name = str(stock.get("stockName") or "").strip()
                if ticker in target_tickers and korean_name:
                    names[ticker] = korean_name
            if page % 10 == 0 or page == pages:
                print(f"{exchange}: {page}/{pages}페이지")
            time.sleep(0.04)

    ordered = {ticker: names[ticker] for ticker in sorted(names)}
    with open(OUTPUT_PATH, "w", encoding="utf-8") as file:
        json.dump(ordered, file, ensure_ascii=False, indent=1)
    print(f"완료: {len(ordered)}/{len(target_tickers)}종목 한글명 저장")


if __name__ == "__main__":
    main()
