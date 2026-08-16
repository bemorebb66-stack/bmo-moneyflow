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

from scripts.signal_engine import (
    CURRENT_PROXY,
    DATA_CONTRACT_VERSION,
    SIGNAL_RULE_VERSION,
    PriceBar,
    compute_stock_observation,
)

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def read_wiki_tables(url):
    resp = requests.get(url, headers=UA, timeout=30)
    resp.raise_for_status()
    return pd.read_html(StringIO(resp.text))


def read_wiki_api_tables(page):
    resp = requests.get(
        "https://en.wikipedia.org/w/api.php",
        headers=UA,
        params={"action": "parse", "page": page, "prop": "text", "format": "json"},
        timeout=30,
    )
    resp.raise_for_status()
    html = resp.json()["parse"]["text"]["*"]
    return pd.read_html(StringIO(html))


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
        if not t.isascii() or " " in t or t in NON_EQUITY_TICKERS:
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
                         auto_adjust=False, actions=True, repair=True, group_by="ticker",
                         threads=True, progress=False)
        if len(chunk) == 1 and not isinstance(df.columns, pd.MultiIndex):
            df.columns = pd.MultiIndex.from_product([chunk, df.columns])
        frames.append(df)
        time.sleep(1)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, axis=1)


def select_complete_market_date(prices, symbols, minimum_ratio=0.8):
    """Return the newest session populated for most of the tracked universe."""
    coverage = {}
    for symbol in symbols:
        try:
            frame = prices[symbol].dropna(subset=["Close", "Volume"])
        except (KeyError, TypeError):
            continue
        for value in frame.index:
            session = str(value.date())
            coverage[session] = coverage.get(session, 0) + 1

    if not coverage:
        return None, {}

    recent_sessions = sorted(coverage)[-10:]
    peak_coverage = max(coverage[session] for session in recent_sessions)
    minimum_coverage = max(1, math.ceil(peak_coverage * minimum_ratio))
    complete_sessions = [
        session
        for session in recent_sessions
        if coverage[session] >= minimum_coverage
    ]
    if not complete_sessions:
        return None, coverage
    return complete_sessions[-1], coverage


HERE = os.path.dirname(os.path.abspath(__file__))
SECTOR_MAP_PATH = os.path.join(HERE, "sector_map.json")
CUSTOM_GROUPS_PATH = os.path.join(HERE, "custom_groups.json")
DATA_PATH = os.path.join(HERE, "data.json")
HISTORY_PATH = os.path.join(HERE, "history.json")
KOREAN_NAMES_PATH = os.path.join(HERE, "korean_names.json")
HISTORY_DAYS = 120
MARKET_INDEX_SYMBOLS = ["^GSPC", "^RUT", "^DJI", "^NDX"]

WIKI_SP500 = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
WIKI_NDX = "https://en.wikipedia.org/wiki/Nasdaq-100"
WIKI_DOW = "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"
NASDAQ_100_API = "https://api.nasdaq.com/api/quote/list-type/nasdaq100"
IWM_HOLDINGS_XLS = "https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appSubType=ISHARES&appType=PRODUCT_PAGE&component=fundDownload&locale=en_US&portfolioId=239710&targetSite=us-ishares&userType=individual"
IWB_HOLDINGS_XLS = "https://www.blackrock.com/varnish-api/blk-one01-product-data/product-data/api/v1/get-fund-document?appSubType=ISHARES&appType=PRODUCT_PAGE&component=fundDownload&locale=en_US&portfolioId=239707&targetSite=us-ishares&userType=individual"
RUSSELL_MODE = os.getenv("MONEY_FLOW_RUSSELL_MODE", "all").strip().lower()  # off / top / all
RUSSELL_MAX = int(os.getenv("MONEY_FLOW_RUSSELL_MAX", "600"))
RUSSELL1000_MAX = int(os.getenv("MONEY_FLOW_RUSSELL1000_MAX", "1000"))
YF_CHUNK_SIZE = int(os.getenv("MONEY_FLOW_YF_CHUNK_SIZE", "250"))
METADATA_ENRICH_MAX = int(os.getenv("MONEY_FLOW_METADATA_ENRICH_MAX", "150"))
NAME_TRANSLATE_MAX = int(os.getenv("MONEY_FLOW_NAME_TRANSLATE_MAX", "200"))
NON_EQUITY_TICKERS = {"USD"}
NEW_LISTING_TICKERS = {
    "SPCX": "Space Exploration Technologies Corp.",
}

# 자동 번역이 영문을 그대로 반환하거나 기업명답지 않게 번역한 종목은
# 국내 투자자가 일반적으로 읽는 표기로 고정한다.
KOREAN_NAME_OVERRIDES = {
    "SPCX": "스페이스X",
    "ADT": "에이디티",
    "ALLE": "알레지온",
    "APLE": "애플 호스피탈리티 리츠",
    "ARQT": "아르쿠티스 바이오테라퓨틱스",
    "ATI": "에이티아이",
    "ATMU": "애트머스 필트레이션 테크놀로지스",
    "ATR": "앱타그룹",
    "AUPH": "오리니아 파마슈티컬스",
    "AVT": "애브넷",
    "AVTR": "아반토",
    "AXGN": "액소젠",
    "AXS": "액시스 캐피털 홀딩스",
    "AXSM": "액섬 테라퓨틱스",
    "AXTI": "에이엑스티",
    "AYI": "어큐이티",
    "BAH": "부즈 앨런 해밀턴",
    "BCRX": "바이오크리스트 파마슈티컬스",
    "BE": "블룸 에너지",
    "BF-B": "브라운포맨",
    "BRK-B": "버크셔 해서웨이",
    "CLMT": "칼루멧",
    "CORT": "코셉트 테라퓨틱스",
    "CRH": "씨알에이치",
    "CRDO": "크레도 테크놀로지",
    "CRSP": "크리스퍼 테라퓨틱스",
    "DNTH": "다이앤서스 테라퓨틱스",
    "DOCN": "디지털오션 홀딩스",
    "DOX": "암독스",
    "ERIE": "이리 인뎀니티",
    "ETSY": "엣시",
    "FISV": "파이서브",
    "FLNC": "플루언스 에너지",
    "FROG": "제이프로그",
    "FTI": "테크닙FMC",
    "GNRC": "제너락",
    "HAPN": "해픈",
    "HQY": "헬스에쿼티",
    "IBM": "아이비엠",
    "IDA": "아이다코프",
    "IESC": "아이이에스",
    "IOVA": "아이오반스 바이오테라퓨틱스",
    "IRDM": "이리디움 커뮤니케이션스",
    "ITT": "아이티티",
    "MD": "페디아트릭스 메디컬 그룹",
    "MHO": "엠아이 홈스",
    "MKSI": "엠케이에스 인스트루먼츠",
    "MMM": "쓰리엠",
    "NHI": "내셔널 헬스 인베스터스",
    "NNN": "엔엔엔 리츠",
    "NRIX": "누릭스 테라퓨틱스",
    "NVR": "엔브이알",
    "NXPI": "엔엑스피 세미컨덕터",
    "ONTO": "온투 이노베이션",
    "PCVX": "백사이트",
    "PSKY": "파라마운트 스카이댄스",
    "PTGX": "프로태거니스트 테라퓨틱스",
    "QXO": "큐엑스오",
    "RH": "알에이치",
    "RXO": "알엑스오",
    "SEZL": "시즐",
    "SFBS": "서비스퍼스트 뱅크셰어스",
    "SNDX": "신닥스 파마슈티컬스",
    "SRPT": "사렙타 테라퓨틱스",
    "STX": "씨게이트 테크놀로지",
    "SYRE": "스파이어 테라퓨틱스",
    "T": "에이티앤티",
    "TEL": "티이 커넥티비티",
    "TGTX": "티지 테라퓨틱스",
    "UNM": "유넘 그룹",
    "VVX": "브이투엑스",
    "WAFD": "와에프디",
    "WDFC": "더블유디-40",
    "AES": "에이이에스",
    "AIR": "에이에이알",
    "APA": "에이피에이",
    "AZZ": "에이지지",
    "BXP": "비엑스피",
    "CBZ": "씨비즈",
    "CDW": "씨디더블유",
    "CSX": "씨에스엑스",
    "EQT": "이큐티",
    "ESAB": "이삽",
    "FFIV": "에프파이브",
    "FNB": "에프엔비",
    "GATX": "지에이티엑스",
    "GPGI": "지피지아이",
    "HNI": "에이치엔아이",
    "HPQ": "에이치피",
    "JBS": "제이비에스",
    "KBR": "케이비알",
    "KKR": "케이케이알",
    "KLAC": "케이엘에이",
    "LKQ": "엘케이큐",
    "MSCI": "엠에스씨아이",
    "PPL": "피피엘",
    "PTC": "피티씨",
    "RTX": "알티엑스",
    "SGHC": "에스지에이치씨",
    "SLB": "에스엘비",
    "SLM": "에스엘엠",
    "SOLS": "솔스",
    "TPG": "티피지",
    "UDR": "유디알",
    "UGI": "유지아이",
    "VFC": "브이에프",
    "VSEC": "브이섹",
}


def has_hangul(value):
    return any("가" <= char <= "힣" for char in str(value or ""))


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
        try:
            resp = requests.get(NASDAQ_100_API, headers=UA, timeout=30)
            resp.raise_for_status()
            rows = resp.json().get("data", {}).get("data", {}).get("rows", [])
            for row in rows:
                t = str(row.get("symbol", "")).strip().replace(".", "-")
                if not t:
                    continue
                name = str(row.get("companyName", "")).strip() or tickers.get(t, t)
                tickers.setdefault(t, name)
                universes.setdefault(t, set()).add("Nasdaq 100")
            found = len(rows) >= 90
        except Exception as api_error:
            print(f"[경고] 나스닥 공식 API 로드 실패, 대체 경로 사용: {api_error}")

        for tbl in ([] if found else read_wiki_tables(WIKI_NDX)):
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
        if not found:
            tables = read_wiki_api_tables("Nasdaq-100")
            for tbl in tables:
                cols = [str(c).lower() for c in tbl.columns]
                ticker_indexes = [
                    i for i, c in enumerate(cols) if "ticker" in c or "symbol" in c
                ]
                if not ticker_indexes:
                    continue
                tcol = tbl.columns[ticker_indexes[0]]
                ncol = None
                for i, c in enumerate(cols):
                    if "company" in c or "security" in c:
                        ncol = tbl.columns[i]
                        break
                rows_added = 0
                for _, r in tbl.iterrows():
                    t = str(r[tcol]).strip().replace(".", "-")
                    if not t or t.lower() == "nan":
                        continue
                    name = str(r[ncol]).strip() if ncol is not None else tickers.get(t, t)
                    tickers.setdefault(t, name)
                    universes.setdefault(t, set()).add("Nasdaq 100")
                    rows_added += 1
                if rows_added >= 90:
                    found = True
                    break
        if found:
            print(f"나스닥 100 병합 후: {len(tickers)}종목")
        else:
            print("[경고] 나스닥 100 구성종목 표를 찾지 못했습니다")
    except Exception as e:
        print(f"[경고] 나스닥 100 목록 로드 실패: {e}")

    try:
        found = False
        for tbl in read_wiki_tables(WIKI_DOW):
            cols = [str(c).lower() for c in tbl.columns]
            ticker_indexes = [
                i for i, c in enumerate(cols) if "ticker" in c or "symbol" in c
            ]
            if not ticker_indexes:
                continue
            tcol = tbl.columns[ticker_indexes[0]]
            ncol = None
            for i, c in enumerate(cols):
                if "company" in c or "security" in c:
                    ncol = tbl.columns[i]
                    break
            rows_added = 0
            for _, r in tbl.iterrows():
                t = str(r[tcol]).strip().replace(".", "-")
                if not t or t.lower() == "nan":
                    continue
                name = str(r[ncol]).strip() if ncol is not None else tickers.get(t, t)
                tickers.setdefault(t, name)
                universes.setdefault(t, set()).add("Dow Jones")
                rows_added += 1
            if rows_added >= 25:
                found = True
                break
        if found:
            print(f"Dow Jones 30 merged: {len(tickers)} stocks")
        else:
            print("[warning] Dow Jones 30 constituent table was not found")
    except Exception as e:
        print(f"[warning] Failed to load Dow Jones 30 constituents: {e}")

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

    # 지수·ETF 편입이 늦는 대형 신규 상장 종목도 상장일부터 바로 추적한다.
    for ticker, name in NEW_LISTING_TICKERS.items():
        tickers.setdefault(ticker, name)
        universes.setdefault(ticker, set()).add("신규 상장")

    if not tickers:
        print("[폴백] 캐시된 티커 사용")
        tickers = {t: v.get("name", t) for t, v in cache.items()}
        universes = {t: set(v.get("universe", ["기존 데이터"])) for t, v in cache.items()}

    if not tickers:
        sys.exit("유니버스를 구성할 수 없습니다 (위키 접근 실패 + 캐시 없음)")
    return tickers, universes


def update_sector_map(tickers, cache):
    """섹터/industry 정보는 캐시에 저장하고, 신규 티커만 yfinance에서 조회."""
    for t, name in tickers.items():
        cache.setdefault(t, {"name": name, "sector": "기타", "industry": "기타", "mcap": 0})
        cache[t]["name"] = name

    missing = [t for t in tickers if t not in cache or not cache[t].get("industry")
               or cache[t].get("industry") == "기타" or cache[t].get("mcap") is None]
    missing.sort(key=lambda t: (bool(cache[t].get("metadata_attempted")), t))
    targets = missing if METADATA_ENRICH_MAX <= 0 else missing[:METADATA_ENRICH_MAX]
    print(f"섹터 정보 신규 조회 대상: {len(missing)}종목 (이번 실행 {len(targets)}종목)")
    for i, t in enumerate(targets):
        try:
            info = yf.Ticker(t).info
            cache[t].update({
                "sector": info.get("sector") or "기타",
                "industry": info.get("industry") or "기타",
                "mcap": info.get("marketCap") or 0,
                "metadata_attempted": True,
            })
        except Exception as e:
            print(f"  [경고] {t} 정보 실패: {e}")
            cache[t].setdefault("mcap", 0)
            cache[t]["metadata_attempted"] = True
        if (i + 1) % 25 == 0:
            print(f"  ...{i + 1}/{len(targets)}")
            time.sleep(1)
    if len(missing) > len(targets):
        print(f"  상세정보 {len(missing) - len(targets)}종목은 다음 실행에서 순차 보강")
    # 구성 종목 파일의 최신 기업명을 매일 반영해 사명 변경과 오탈자를 따라간다.
    for t, name in tickers.items():
        cache[t]["name"] = name
    with open(SECTOR_MAP_PATH, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=1)
    return cache


def update_korean_names(tickers, universes, cache):
    """전체 종목의 한글명을 검증하고 영문으로 남은 이름을 번역한다."""
    if os.getenv("MONEY_FLOW_TRANSLATE_NAMES", "1").strip().lower() in ("0", "false", "off"):
        return cache
    catalog = load_json(KOREAN_NAMES_PATH, {})
    for t, translated in catalog.items():
        if t in tickers and t in cache and has_hangul(translated):
            cache[t]["name_ko"] = translated
    for t, translated in KOREAN_NAME_OVERRIDES.items():
        if t in tickers and t in cache:
            cache[t]["name_ko"] = translated
    targets = [t for t in tickers
               if t not in KOREAN_NAME_OVERRIDES
               and not has_hangul(cache.get(t, {}).get("name_ko"))]
    targets.sort(key=lambda t: (bool(cache[t].get("translation_attempted")), t))
    all_target_count = len(targets)
    if NAME_TRANSLATE_MAX > 0:
        targets = targets[:NAME_TRANSLATE_MAX]
    print(f"전체 기업명 한글 재검사 대상: {all_target_count}종목 (이번 실행 {len(targets)}종목)")
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
            if has_hangul(translated):
                cache[t]["name_ko"] = translated
            cache[t]["translation_attempted"] = True
        except Exception as e:
            print(f"  [참고] {t} 기업명 번역 생략: {e}")
            cache[t]["translation_attempted"] = True
        if (i + 1) % 25 == 0:
            print(f"  ...{i + 1}/{len(targets)}")
        time.sleep(0.08)
    if all_target_count > len(targets):
        print(f"  기업명 번역 {all_target_count - len(targets)}종목은 다음 실행에서 순차 보강")
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
    px = download_prices(symbols + MARKET_INDEX_SYMBOLS)
    market_date, date_coverage = select_complete_market_date(px, symbols)
    if not market_date:
        sys.exit("완전한 시장 거래일을 찾지 못했습니다")

    raw_latest_date = max(date_coverage)
    if raw_latest_date > market_date:
        print(
            "불완전한 최신 거래일 제외: "
            f"{raw_latest_date} {date_coverage[raw_latest_date]}종목, "
            f"{market_date} {date_coverage[market_date]}종목 사용"
        )
    else:
        print(
            f"완전한 시장 거래일: {market_date} "
            f"({date_coverage[market_date]}종목)"
        )

    stocks = []
    dv_map = {}  # 히스토리용: 티커별 일별 거래대금 시리즈
    for t in symbols:
        try:
            df = px[t].dropna(subset=["Close", "Volume"])
        except Exception:
            continue
        df = df.loc[[str(value.date()) <= market_date for value in df.index]]
        if len(df) < 22:  # 최소 20일 평균 계산 가능해야 포함
            continue
        if str(df.index[-1].date()) != market_date:
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
        dv_map[t] = dv

        def to_bar(position):
            item = df.iloc[position]
            return PriceBar(
                session_date=df.index[position].date(),
                open=float(item["Open"]),
                high=float(item["High"]),
                low=float(item["Low"]),
                close=float(item["Close"]),
                adj_close=float(item.get("Adj Close", item["Close"])),
                volume=float(item["Volume"]),
            )

        observation = compute_stock_observation(
            to_bar(-1),
            [to_bar(position) for position in range(max(0, len(df) - 21), len(df) - 1)],
        )

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
            "sig": observation.get("signal"),
            "sig_status": observation["status"],
            "sig_reasons": observation["reasons"],
            "sig_ver": SIGNAL_RULE_VERSION,
        }
        row["mc"] = int(meta.get("mcap") or 0)
        row["cap"] = cap_bucket(meta.get("mcap"))
        if t in ticker_to_group:
            row["grp"] = ticker_to_group[t]
        stocks.append(row)

    if not stocks:
        sys.exit("수집된 종목이 없습니다")

    # A transient Yahoo chunk failure must never replace a healthy universe with
    # a much smaller payload during the afternoon delayed refresh.
    previous_payload = load_json(DATA_PATH, {})
    previous_count = int(previous_payload.get("count") or len(previous_payload.get("stocks", [])))
    minimum_safe_count = math.floor(previous_count * 0.95)
    if previous_count >= 1000 and len(stocks) < minimum_safe_count:
        sys.exit(
            "종목 수 급감으로 기존 데이터를 보호합니다: "
            f"{previous_count}개 -> {len(stocks)}개 (최소 {minimum_safe_count}개 필요)"
        )

    indices = []
    for symbol in MARKET_INDEX_SYMBOLS:
        try:
            index_df = px[symbol].dropna(subset=["Close"])
            index_df = index_df.loc[[str(value.date()) <= market_date for value in index_df.index]]
            close = index_df["Close"]
            if len(close) < 2 or str(index_df.index[-1].date()) != market_date:
                continue
            indices.append({
                "symbol": symbol,
                "date": str(index_df.index[-1].date()),
                "value": safe(close.iloc[-1]),
                "change": safe((close.iloc[-1] / close.iloc[-2] - 1) * 100),
            })
        except Exception as exc:
            print(f"  [참고] {symbol} 지수 데이터 생략: {exc}")

    out = {
        "updated": pd.Timestamp.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
        "market_date": market_date,
        "data_contract_version": DATA_CONTRACT_VERSION,
        "signal_rule_version": SIGNAL_RULE_VERSION,
        "data_grade": CURRENT_PROXY,
        "data_grade_reasons": [
            "UNIVERSE_MEMBERSHIP_NOT_POINT_IN_TIME_VERSIONED",
            "SOURCE_REVISIONS_NOT_VENDOR_TIMESTAMPED",
        ],
        "price_policy": {
            "dollar_volume": "raw_close_x_contemporaneous_volume",
            "returns": "adjusted_close_total_return",
            "rolling_baseline": "20_prior_sessions_excluding_signal_session",
        },
        "runtime_versions": {
            "python": sys.version.split()[0],
            "pandas": pd.__version__,
            "yfinance": yf.__version__,
        },
        "count": len(stocks),
        "indices": indices,
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

    def universe_series():
        buckets = {}
        for t in hist.columns:
            labels = meta.get(t, {}).get("uni") or ["기존 데이터"]
            for label in labels:
                buckets.setdefault(label, []).append(t)
        return {
            label: [int(v / 1e6) if v == v else 0 for v in hist[cols].sum(axis=1)]
            for label, cols in buckets.items()
        }

    meta = {s["t"]: s for s in stocks}
    hist_out = {
        "dates": dates,
        "total": [int(v / 1e6) for v in hist.sum(axis=1)],
            "sector": series_by(lambda t: meta.get(t, {}).get("sec", "기타")),
            "industry": series_by(lambda t: meta.get(t, {}).get("ind", "기타")),
        "universe": universe_series(),
            "custom": series_by(lambda t: meta.get(t, {}).get("grp") or meta.get(t, {}).get("ind", "기타")),
        "cap": series_by(lambda t: meta.get(t, {}).get("cap", "기타")),
        "stocks": {t: [int(v / 1e6) if v == v else 0 for v in hist[t]] for t in hist.columns},
    }
    with open(HISTORY_PATH, "w", encoding="utf-8") as f:
        json.dump(hist_out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"히스토리: {len(dates)}거래일 → history.json")


if __name__ == "__main__":
    main()
