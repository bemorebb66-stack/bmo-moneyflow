# -*- coding: utf-8 -*-
"""
BMO Money Flow — 일별 데이터 수집 스크립트
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

UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"}


def read_wiki_tables(url):
    resp = requests.get(url, headers=UA, timeout=30)
    resp.raise_for_status()
    return pd.read_html(StringIO(resp.text))


def read_iwm_holdings(limit=None):
    """IWM ETF 보유 종목으로 러셀2000 후보군을 가져온다."""
    if limit is None:
        limit = RUSSELL_MAX
    resp = requests.get(IWM_HOLDINGS_CSV, headers=UA, timeout=45)
    resp.raise_for_status()
    text = resp.text.replace("\ufeff", "")
    lines = text.splitlines()
    start = None
    for i, line in enumerate(lines):
        first = line.split(",", 1)[0].strip().strip('"').lower()
        if first in ("ticker", "symbol"):
            start = i
            break
    if start is None:
        raise ValueError("IWM holdings CSV에서 Ticker 헤더를 찾지 못했습니다")

    df = pd.read_csv(StringIO("\n".join(lines[start:])))
    lower = {str(c).strip().lower(): c for c in df.columns}
    tcol = lower.get("ticker") or lower.get("symbol")
    ncol = lower.get("name") or lower.get("holding name")
    wcol = lower.get("weight (%)") or lower.get("weight")
    if tcol is None:
        raise ValueError("IWM holdings CSV에 ticker 컬럼이 없습니다")

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
IWM_HOLDINGS_CSV = "https://www.ishares.com/us/products/239710/ishares-russell-2000-etf/1467271812596.ajax?fileType=csv&fileName=IWM_holdings&dataType=fund"
RUSSELL_MODE = os.getenv("MONEY_FLOW_RUSSELL_MODE", "top").strip().lower()  # off / top / all
RUSSELL_MAX = int(os.getenv("MONEY_FLOW_RUSSELL_MAX", "600"))
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


KO_SEC_PY = {
    "Technology":"기술","Information Technology":"기술","Communication Services":"커뮤니케이션",
    "Consumer Cyclical":"임의소비재","Consumer Discretionary":"임의소비재",
    "Consumer Defensive":"필수소비재","Consumer Staples":"필수소비재",
    "Financial Services":"금융","Financials":"금융","Healthcare":"헬스케어","Health Care":"헬스케어",
    "Energy":"에너지","Industrials":"산업재","Utilities":"유틸리티",
    "Basic Materials":"소재","Materials":"소재","Real Estate":"부동산","기타":"기타",
}

def fmt_dv(v):
    if not v: return "—"
    if v >= 1e12: return f"${v/1e12:.2f}T"
    if v >= 1e9:  return f"${v/1e9:.1f}B"
    return f"${v/1e6:.0f}M"

def write_today_html(stocks, market_date):
    """오늘의 섹터 로테이션 정적 요약 페이지 (SEO용, 매일 자동 생성)"""
    secs = {}
    tot_now = tot_ref = 0.0
    for st in stocks:
        dv, dvp = st.get("dv"), st.get("dvp")
        if dv is None: continue
        k = KO_SEC_PY.get(st.get("sec") or "기타", st.get("sec") or "기타")
        o = secs.setdefault(k, {"now":0.0, "ref":0.0})
        o["now"] += dv
        tot_now += dv
        if dvp:
            o["ref"] += dvp
            tot_ref += dvp
    rows = []
    for k, o in secs.items():
        if not (tot_now and tot_ref and o["ref"]): continue
        rows.append((k, o["now"]/tot_now*100 - o["ref"]/tot_ref*100, o["now"]))
    rows.sort(key=lambda x: -x[1])
    inflow, outflow = rows[:3], sorted(rows[-3:], key=lambda x: x[1])
    spikes = sorted([s for s in stocks if s.get("dv") and s.get("a20") and s["dv"] >= 1.5e8 and s["dv"]/s["a20"] >= 2.0],
                    key=lambda s: -(s["dv"]/s["a20"]))[:5]
    tot_chg = (tot_now/tot_ref - 1) * 100 if tot_ref else 0.0

    def li_rows(rs, cls):
        return "\n".join(
            f'<li><b>{k}</b> <span class="{cls}">{d:+.2f}%p</span> (거래대금 {fmt_dv(n)})</li>'
            for k, d, n in rs)
    spike_txt = ", ".join(f'{s["t"]}({s["dv"]/s["a20"]:.1f}배)' for s in spikes) if spikes else "없음"
    desc = (f"{market_date} 미국 증시 섹터 자금 흐름: "
            + ", ".join(f"{k} {d:+.2f}%p" for k, d, _ in inflow[:2])
            + " 유입 · " + ", ".join(f"{k} {d:+.2f}%p" for k, d, _ in outflow[:2]) + " 이탈")
    html = f"""<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>오늘의 섹터 로테이션 ({market_date}) — 미국 주식 자금 흐름 요약 | BMO Money Flow</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="https://www.bvtmoneyflow.xyz/today.html">
<meta property="og:title" content="오늘의 섹터 로테이션 ({market_date}) — BMO Money Flow">
<meta property="og:description" content="{desc}">
<meta property="og:type" content="article">
<meta property="og:url" content="https://www.bvtmoneyflow.xyz/today.html">
<meta property="og:image" content="https://www.bvtmoneyflow.xyz/og.png">
<meta name="twitter:card" content="summary_large_image">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;1,500&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
<style>
:root{{--paper:#F8F4EC;--ink:#1E1A12;--muted:#7A7268;--red:#B83A28;--blue:#2A5868;--rule:#E4DDD0}}
*{{margin:0;padding:0;box-sizing:border-box}}
body{{background:var(--paper);color:var(--ink);font-family:'Noto Sans KR',sans-serif;font-size:15px;line-height:1.8}}
.wrap{{max-width:720px;margin:0 auto;padding:0 20px 60px}}
header{{border-bottom:2px solid var(--ink);padding:26px 0 14px;margin-bottom:24px}}
.eyebrow{{font-size:10px;letter-spacing:.3em;color:var(--red);font-weight:700;text-transform:uppercase;margin-bottom:6px}}
h1{{font-family:'Playfair Display','Noto Sans KR',serif;font-weight:700;font-size:26px;line-height:1.35}}
h2{{font-family:'Playfair Display','Noto Sans KR',serif;font-size:17px;margin:26px 0 10px;border-left:3px solid var(--red);padding-left:10px}}
p,li{{color:#3A342A}}
ul{{margin:0 0 12px 22px}}
li{{margin-bottom:7px}}
.in{{color:var(--red);font-weight:700}}
.out{{color:var(--blue);font-weight:700}}
.cta{{display:inline-block;margin-top:22px;background:var(--red);color:#fff;padding:11px 20px;border-radius:6px;text-decoration:none;font-weight:700}}
.date{{color:var(--muted);font-size:13px;margin-top:6px}}
.note{{color:var(--muted);font-size:12px;margin-top:26px;border-top:1px solid var(--rule);padding-top:12px}}
a{{color:var(--red)}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div class="eyebrow">BMO MONEY FLOW · DAILY</div>
    <h1>오늘의 섹터 로테이션 — 미국 주식 자금 흐름 요약</h1>
    <p class="date">기준일 {market_date} (미국 장마감 확정치) · 매 거래일 아침 자동 갱신</p>
  </header>
  <p>미국 증시(S&amp;P 500 + 나스닥 100 + 러셀2000 상위권, {len(stocks)}종목)의 전체 거래대금은 <b>{fmt_dv(tot_now)}</b>로 전일 대비 <b>{tot_chg:+.1f}%</b>를 기록했습니다. 시장 내 거래대금 점유율 기준으로 자금이 향한 섹터와 이탈한 섹터는 다음과 같습니다.</p>
  <h2>자금 유입 상위 섹터 (점유율 확대)</h2>
  <ul>
{li_rows(inflow, "in")}
  </ul>
  <h2>자금 이탈 상위 섹터 (점유율 축소)</h2>
  <ul>
{li_rows(outflow, "out")}
  </ul>
  <h2>거래대금 급증 종목</h2>
  <p>20일 평균 대비 2배 이상 거래된 주요 종목: <b>{spike_txt}</b></p>
  <a class="cta" href="./">→ 실시간 대시보드에서 세부 산업·종목별로 보기</a>
  <p class="note">거래대금(종가×거래량)은 매수·매도가 함께 잡히는 지표로, 점유율 변화(%p)가 "돈이 어디서 어디로 이동했는가"에 가장 가까운 신호입니다. 본 페이지는 정보 제공 목적이며 투자 권유가 아닙니다. 데이터: Yahoo Finance · <a href="about.html">방법론 안내</a></p>
</div>
</body>
</html>"""
    with open("today.html", "w", encoding="utf-8") as f:
        f.write(html)
    print(f"today.html 생성 (기준일 {market_date})")

def main():
    cache = load_json(SECTOR_MAP_PATH, {})
    tickers, universes = get_universe(cache)
    cache = update_sector_map(tickers, cache)
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

    try:
        write_today_html(stocks, market_date)
    except Exception as e:
        print(f"today.html 생성 실패(무시): {e}")

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
