# -*- coding: utf-8 -*-
"""
BVT Money Flow — 일별 데이터 수집 스크립트
S&P 500 + 나스닥 100 + 러셀2000 상위권의 거래대금(종가×거래량)을 수집하고
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
from lxml import etree

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def read_wiki_tables(url):
    resp = requests.get(url, headers=UA, timeout=30)
    resp.raise_for_status()
    return pd.read_html(StringIO(resp.text))


def read_blackrock_holdings(url, limit=None):
    """BlackRock ETF 보유종목 파일에서 러셀 유니버스를 가져온다."""
    if limit is None:
        limit = RUSSELL_MAX
    resp = requests.get(url, headers={**UA, "Accept": "application/vnd.ms-excel"}, timeout=45)
    resp.raise_for_status()
    ns = {"ss": "urn:schemas-microsoft-com:office:spreadsheet"}
    root = etree.fromstring(resp.content, parser=etree.XMLParser(recover=True))
    sheets = root.xpath("//ss:Worksheet", namespaces=ns)
    if len(sheets) < 2:
        raise ValueError("IWM holdings 파일에서 Holdings 시트를 찾지 못했습니다")
    rows = sheets[1].xpath(".//ss:Row", namespaces=ns)
    ss_index = "{urn:schemas-microsoft-com:office:spreadsheet}Index"

    def row_values(row):
        out = []
        for cell in row.xpath("./ss:Cell", namespaces=ns):
            idx = int(cell.get(ss_index, len(out) + 1)) - 1
            while len(out) <= idx:
                out.append("")
            out[idx] = "".join(cell.xpath(".//ss:Data//text()", namespaces=ns)).strip()
        return out

    header_at = next((i for i, row in enumerate(rows)
                      if row_values(row) and row_values(row)[0].lower() in ("ticker", "symbol")), None)
    if header_at is None:
        raise ValueError("IWM holdings 파일에서 Ticker 헤더를 찾지 못했습니다")
    headers = row_values(rows[header_at])
    records = [row_values(row) for row in rows[header_at + 1:]]
    width = len(headers)
    df = pd.DataFrame([(r[:width] + [""] * max(0, width - len(r))) for r in records], columns=headers)
    lower = {str(c).strip().lower(): c for c in headers}
    tcol = lower.get("ticker") or lower.get("symbol")
    ncol = lower.get("name") or lower.get("holding name")
    wcol = lower.get("weight (%)") or lower.get("weight")
    if tcol is None:
        raise ValueError("IWM holdings 파일에 ticker 컬럼이 없습니다")

    if wcol is not None:
        df["_w"] = pd.to_numeric(df[wcol], errors="coerce").fillna(0)
        df = df.sort_values("_w", ascending=False)
    if RUSSELL_MODE == "top" and limit > 0:
        df = df.head(limit)

    out = {}
    for _, r in df.iterrows():
        raw = str(r[tcol]).strip()
        if not raw or raw.lower() == "nan" or raw in ("-", "—"):
            continue
        t = raw.replace(".", "-").upper()
        if not t.isascii() or " " in t:
            continue
        name = str(r[ncol]).strip() if ncol is not None and str(r[ncol]).strip() else t
        out[t] = name
    return out


def read_iwm_holdings(limit=None):
    return read_blackrock_holdings(IWM_HOLDINGS_XLS, limit)


def read_iwb_holdings(limit=None):
    return read_blackrock_holdings(IWB_HOLDINGS_XLS, limit)


def download_prices(symbols):
    frames = []
    for i in range(0, len(symbols), YF_CHUNK_SIZE):
        chunk = symbols[i:i + YF_CHUNK_SIZE]
        print(f"  가격 데이터 묶음 {i//YF_CHUNK_SIZE + 1}: {len(chunk)}종목")
        df = yf.download(chunk, period="200d", interval="1d",
                         auto_adjust=False, group_by="ticker",
                         threads=True, progress=False)
        if len(chunk) == 1 and not isinstance(df.columns, pd.MultiIndex):
            df.columns = pd.MultiIndex.from_product([chunk, df.columns])
        frames.append(df)
        time.sleep(1)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, axis=1)

HERE = os.path.dirname(os.path.abspath(__file__))
SECTOR_MAP_PATH = os.path.join(HERE, "sector_map.json")
CUSTOM_GROUPS_PATH = os.path.join(HERE, "custom_groups.json")
DATA_PATH = os.path.join(HERE, "data.json")
HISTORY_PATH = os.path.join(HERE, "history.json")
HISTORY_DAYS = 120

WIKI_SP500 = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
WIKI_NDX = "https://en.wikipedia.org/wiki/Nasdaq-100"
IWM_HOLDINGS_XLS = "https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appSubType=ISHARES&appType=PRODUCT_PAGE&component=fundDownload&locale=en_US&portfolioId=239710&targetSite=us-ishares&userType=individual"
IWB_HOLDINGS_XLS = "https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appSubType=ISHARES&appType=PRODUCT_PAGE&component=fundDownload&locale=en_US&portfolioId=239707&targetSite=us-ishares&userType=individual"
RUSSELL_MODE = os.getenv("MONEY_FLOW_RUSSELL_MODE", "top").strip().lower()  # off / top / all
RUSSELL_MAX = int(os.getenv("MONEY_FLOW_RUSSELL_MAX", "600"))
RUSSELL1000_MAX = int(os.getenv("MONEY_FLOW_RUSSELL1000_MAX", "1000"))
YF_CHUNK_SIZE = int(os.getenv("MONEY_FLOW_YF_CHUNK_SIZE", "250"))


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def get_universe(cache):
    """위키피디아에서 S&P 500 + 나스닥 100 구성종목을 가져오고,
    옵션에 따라 IWM 보유 종목으로 러셀2000 상위권을 합친다.
    실패하면 sector_map.json 캐시에 있는 티커로 폴백."""
    tickers = {}  # ticker -> name
    universes = {}  # ticker -> set of index/universe labels
    try:
        sp = read_wiki_tables(WIKI_SP500)[0]
        for _, r in sp.iterrows():
            t = str(r["Symbol"]).strip().replace(".", "-")
            tickers[t] = str(r["Security"]).strip()
            universes.setdefault(t, set()).add("S&P 500")
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
                    universes.setdefault(t, set()).add("Nasdaq 100")
                found = True
                break
        if found:
            print(f"나스닥 100 병합 후: {len(tickers)}종목")
    except Exception as e:
        print(f"[경고] 나스닥 100 목록 로드 실패: {e}")

    if RUSSELL_MODE != "off":
        try:
            r1k = read_iwb_holdings(limit=RUSSELL1000_MAX)
            added = 0
            for t, name in r1k.items():
                if t not in tickers:
                    added += 1
                tickers.setdefault(t, name)
                universes.setdefault(t, set()).add("Russell 1000")
            print(f"러셀1000(IWB) 상위 {RUSSELL1000_MAX}개 병합: +{added}종목 → {len(tickers)}종목")

            r2k = read_iwm_holdings()
            added = 0
            for t, name in r2k.items():
                if t not in tickers:
                    added += 1
                tickers.setdefault(t, name)
                universes.setdefault(t, set()).add("Russell 2000")
            scope = "전체" if RUSSELL_MODE == "all" else f"상위 {RUSSELL_MAX}개"
            print(f"러셀2000(IWM) {scope} 병합: +{added}종목 → {len(tickers)}종목")
        except Exception as e:
            print(f"[경고] 러셀2000(IWM) 목록 로드 실패: {e}")
            raise RuntimeError("러셀2000 목록을 가져오지 못해 데이터 갱신을 중단합니다") from e

    if not tickers:
        print("[폴백] 캐시된 티커 사용")
        tickers = {t: v.get("name", t) for t, v in cache.items()}
        universes = {t: set(v.get("universe", ["기존 데이터"])) for t, v in cache.items()}

    if not tickers:
        sys.exit("유니버스를 구성할 수 없습니다 (위키 접근 실패 + 캐시 없음)")
    return tickers, universes


def update_sector_map(tickers, cache):
    """섹터/industry 정보는 캐시에 저장하고, 신규 티커만 yfinance에서 조회."""
    missing = [t for t in tickers if t not in cache or not cache[t].get("industry")
               or cache[t].get("industry") == "기타" or cache[t].get("mcap") is None]
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


def update_korean_names(tickers, universes, cache):
    """러셀 신규 종목의 영문명을 한국어로 바꾸고 캐시에 저장한다."""
    if os.getenv("MONEY_FLOW_TRANSLATE_NAMES", "1").strip().lower() in ("0", "false", "off"):
        return cache
    targets = [t for t in tickers if any(label.startswith("Russell ") for label in universes.get(t, set()))
               and not cache.get(t, {}).get("name_ko")]
    print(f"러셀 기업명 한국어 번역 대상: {len(targets)}종목")
    url = "https://translate.googleapis.com/translate_a/single"
    for i, t in enumerate(targets):
        name = cache.get(t, {}).get("name", tickers[t])
        try:
            resp = requests.get(url, params={
                "client": "gtx", "sl": "en", "tl": "ko", "dt": "t", "q": name,
            }, headers=UA, timeout=15)
            resp.raise_for_status()
            parts = resp.json()[0]
            translated = "".join(p[0] for p in parts if p and p[0]).strip()
            if translated:
                cache[t]["name_ko"] = translated
        except Exception as e:
            print(f"  [참고] {t} 기업명 번역 생략: {e}")
        if (i + 1) % 25 == 0:
            print(f"  ...{i + 1}/{len(targets)}")
        time.sleep(0.08)
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
    tickers, universes = get_universe(cache)
    cache = update_sector_map(tickers, cache)
    cache = update_korean_names(tickers, universes, cache)
    for t, labels in universes.items():
        if t in cache:
            cache[t]["universe"] = sorted(labels)
    with open(SECTOR_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)

    custom = load_json(CUSTOM_GROUPS_PATH, {"groups": {}})
    ticker_to_group = {}
    for g, lst in custom.get("groups", {}).items():
        for t in lst:
            ticker_to_group[t.replace(".", "-")] = g

    symbols = sorted(tickers.keys())
    print(f"가격 데이터 다운로드: {len(symbols)}종목")
    px = download_prices(symbols)

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
        a5 = hist.tail(5).mean()
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
            "nko": meta.get("name_ko", ""),
            "sec": meta.get("sector", "기타"),
            "ind": meta.get("industry", "기타"),
            "uni": sorted(universes.get(t, {"기존 데이터"})),
            "c": safe(close.iloc[-1]),
            "pc": safe(pc),
            "dv": safe(today, 0),
            "dvp": safe(prev, 0),
            "a5": safe(a5, 0),
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
        "universe": series_by(lambda t: " + ".join(meta.get(t, {}).get("uni", ["기존 데이터"]))),
            "custom": series_by(lambda t: meta.get(t, {}).get("grp") or meta.get(t, {}).get("ind", "기타")),
        "cap": series_by(lambda t: meta.get(t, {}).get("cap", "기타")),
        "stocks": {t: [int(v / 1e6) if v == v else 0 for v in hist[t]] for t in hist.columns},
    }
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(hist_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"히스토리: {len(dates)}거래일 → history.json")


if __name__ == "__main__":
    main()
