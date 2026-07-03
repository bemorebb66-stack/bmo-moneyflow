# -*- coding: utf-8 -*-
"""
BMO Money Flow — 일별 데이터 수집 스크립트
S&P 500 + 나스닥 100 전 종목의 거래대금(종가×거래량)을 수집하고
전일/20일/60일/120일 평균 대비 지표를 계산해 data.json으로 저장.
GitHub Actions에서 매일 자동 실행되는 것을 전제로 작성됨.
"""
import json
import math
import os
import sys
import time

import pandas as pd
import requests
import yfinance as yf
from io import StringIO

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def read_wiki_tables(url):
    resp = requests.get(url, headers=UA, timeout=30)
    resp.raise_for_status()
    return pd.read_html(StringIO(resp.text))

HERE = os.path.dirname(os.path.abspath(__file__))
SECTOR_MAP_PATH = os.path.join(HERE, "sector_map.json")
CUSTOM_GROUPS_PATH = os.path.join(HERE, "custom_groups.json")
DATA_PATH = os.path.join(HERE, "data.json")
HISTORY_PATH = os.path.join(HERE, "history.json")
HISTORY_DAYS = 120

WIKI_SP500 = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
WIKI_NDX = "https://en.wikipedia.org/wiki/Nasdaq-100"


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def get_universe(cache):
    """위키피디아에서 S&P 500 + 나스닥 100 구성종목을 가져온다.
    실패하면 sector_map.json 캐시에 있는 티커로 폴백."""
    tickers = {}  # ticker -> name
    try:
        sp = read_wiki_tables(WIKI_SP500)[0]
        for _, r in sp.iterrows():
            t = str(r["Symbol"]).strip().replace(".", "-")
            tickers[t] = str(r["Security"]).strip()
        print(f"S&P 500: {len(tickers)}종목")
    except Exception as e:
        print(f"[경고] S&P 500 목록 로드 실패: {e}")

    try:
        found = False
        for tbl in read_wiki_tables(WIKI_NDX):
            cols = [str(c).lower() for c in tbl.columns]
            if any("ticker" in c or "symbol" in c for c in cols):
                tcol = tbl.columns[[i for i, c in enumerate(cols) if "ticker" in c or "symbol" in c][0]]
                ncol = None
                for i, c in enumerate(cols):
                    if "company" in c or "security" in c:
                        ncol = tbl.columns[i]
                        break
                for _, r in tbl.iterrows():
                    t = str(r[tcol]).strip().replace(".", "-")
                    if not t or t.lower() == "nan":
                        continue
                    name = str(r[ncol]).strip() if ncol is not None else tickers.get(t, t)
                    tickers.setdefault(t, name)
                found = True
                break
        if found:
            print(f"나스닥 100 병합 후: {len(tickers)}종목")
    except Exception as e:
        print(f"[경고] 나스닥 100 목록 로드 실패: {e}")

    if not tickers:
        print("[폴백] 캐시된 티커 사용")
        tickers = {t: v.get("name", t) for t, v in cache.items()}

    if not tickers:
        sys.exit("유니버스를 구성할 수 없습니다 (위키 접근 실패 + 캐시 없음)")
    return tickers


def update_sector_map(tickers, cache):
    """섹터/industry 정보는 캐시에 저장하고, 신규 티커만 yfinance에서 조회."""
    missing = [t for t in tickers if t not in cache or not cache[t].get("industry") or cache[t].get("mcap") is None]
    print(f"섹터 정보 신규 조회 대상: {len(missing)}종목")
    for i, t in enumerate(missing):
        try:
            info = yf.Ticker(t).info
            cache[t] = {
                "name": tickers[t],
                "sector": info.get("sector") or "기타",
                "industry": info.get("industry") or "기타",
                "mcap": info.get("marketCap") or 0,
            }
        except Exception as e:
            print(f"  [경고] {t} 정보 실패: {e}")
            cache.setdefault(t, {"name": tickers[t], "sector": "기타", "industry": "기타", "mcap": 0})
            cache[t].setdefault("mcap", 0)
        if (i + 1) % 25 == 0:
            print(f"  ...{i + 1}/{len(missing)}")
            time.sleep(1)
    with open(SECTOR_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)
    return cache


def cap_bucket(m):
    if not m:
        return "기타"
    if m >= 200e9:
        return "메가캡 ($200B+)"
    if m >= 50e9:
        return "대형주 ($50B~200B)"
    if m >= 10e9:
        return "중형주 ($10B~50B)"
    return "소형주 (<$10B)"


def safe(x, nd=2):
    if x is None or (isinstance(x, float) and (math.isnan(x) or math.isinf(x))):
        return None
    return round(float(x), nd)


def main():
    cache = load_json(SECTOR_MAP_PATH, {})
    tickers = get_universe(cache)
    cache = update_sector_map(tickers, cache)

    custom = load_json(CUSTOM_GROUPS_PATH, {"groups": {}})
    ticker_to_group = {}
    for g, lst in custom.get("groups", {}).items():
        for t in lst:
            ticker_to_group[t.replace(".", "-")] = g

    symbols = sorted(tickers.keys())
    print(f"가격 데이터 다운로드: {len(symbols)}종목")
    px = yf.download(symbols, period="200d", interval="1d",
                     auto_adjust=False, group_by="ticker",
                     threads=True, progress=False)

    stocks = []
    market_date = None
    dv_map = {}  # 히스토리용: 티커별 일별 거래대금 시리즈
    for t in symbols:
        try:
            df = px[t].dropna(subset=["Close", "Volume"])
        except Exception:
            continue
        if len(df) < 22:  # 최소 20일 평균 계산 가능해야 포함
            continue
        close = df["Close"]
        vol = df["Volume"]
        dv = close * vol  # 거래대금 (달러) — 원주가 기준이 맞음
        # 등락률은 분할/배당 왜곡을 피하기 위해 조정종가 기준
        try:
            adj = df["Adj Close"].fillna(close)
        except Exception:
            adj = close

        today = dv.iloc[-1]
        prev = dv.iloc[-2]
        hist = dv.iloc[:-1]  # 당일 제외
        a20 = hist.tail(20).mean()
        a60 = hist.tail(60).mean() if len(hist) >= 60 else None
        a120 = hist.tail(120).mean() if len(hist) >= 120 else None

        pc = (adj.iloc[-1] / adj.iloc[-2] - 1) * 100
        market_date = str(df.index[-1].date())
        dv_map[t] = dv

        meta = cache.get(t, {})
        row = {
            "t": t,
            "n": meta.get("name", tickers.get(t, t)),
            "sec": meta.get("sector", "기타"),
            "ind": meta.get("industry", "기타"),
            "c": safe(close.iloc[-1]),
            "pc": safe(pc),
            "dv": safe(today, 0),
            "dvp": safe(prev, 0),
            "a20": safe(a20, 0),
            "a60": safe(a60, 0),
            "a120": safe(a120, 0),
        }
        row["mc"] = int(meta.get("mcap") or 0)
        row["cap"] = cap_bucket(meta.get("mcap"))
        if t in ticker_to_group:
            row["grp"] = ticker_to_group[t]
        stocks.append(row)

    if not stocks:
        sys.exit("수집된 종목이 없습니다")

    out = {
        "updated": pd.Timestamp.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "market_date": market_date,
        "count": len(stocks),
        "stocks": stocks,
    }

    # 휴장일 등 시장 데이터가 그대로면 파일 갱신 생략 (무의미한 커밋 방지)
    old = load_json(DATA_PATH, {})
    def _strip(d):
        d = dict(d); d.pop("updated", None); return d
    if _strip(old) == _strip(out):
        print(f"시장 데이터 변동 없음 (기준일 {market_date} 동일, 휴장일 추정) — 갱신 생략")
        return

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"완료: {len(stocks)}종목 → data.json (기준일 {market_date})")

    # ── 그룹별 일별 거래대금 히스토리 (비교 차트용) ──
    hist = pd.DataFrame(dv_map).tail(HISTORY_DAYS)
    dates = [str(d.date()) for d in hist.index]

    def series_by(keyfunc):
        buckets = {}
        for t in hist.columns:
            buckets.setdefault(keyfunc(t), []).append(t)
        return {k: [int(v / 1e6) if v == v else 0 for v in hist[cols].sum(axis=1)]
                for k, cols in buckets.items()}

    meta = {s["t"]: s for s in stocks}
    hist_out = {
        "dates": dates,
        "total": [int(v / 1e6) for v in hist.sum(axis=1)],
        "sector": series_by(lambda t: meta.get(t, {}).get("sec", "기타")),
        "industry": series_by(lambda t: meta.get(t, {}).get("ind", "기타")),
        "custom": series_by(lambda t: meta.get(t, {}).get("grp") or meta.get(t, {}).get("ind", "기타")),
        "cap": series_by(lambda t: meta.get(t, {}).get("cap", "기타")),
        "stocks": {t: [int(v / 1e6) if v == v else 0 for v in hist[t]] for t in hist.columns},
    }
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(hist_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"히스토리: {len(dates)}거래일 → history.json")


if __name__ == "__main__":
    main()
