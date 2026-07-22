#!/usr/bin/env python3
"""Build weekly market briefs from stored daily Replay snapshots."""

import json
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SNAPSHOTS = ROOT / "replay_data" / "snapshots"
OUTPUT = ROOT / "weekly_summary.json"
INDEX_NAMES = {"^GSPC": "S&P 500", "^NDX": "Nasdaq 100", "^RUT": "Russell 2000", "^DJI": "Dow Jones"}
SECTOR_NAMES = {
    "Technology": "테크놀로지", "Industrials": "산업재", "Financial Services": "금융",
    "Consumer Cyclical": "임의 소비재", "Healthcare": "헬스케어",
    "Communication Services": "커뮤니케이션 서비스", "Consumer Defensive": "필수 소비재",
    "Energy": "에너지", "Basic Materials": "소재", "Real Estate": "부동산", "Utilities": "유틸리티",
}

def week_start(value):
    return value - timedelta(days=value.weekday())

def load_snapshots():
    result = []
    for path in sorted(SNAPSHOTS.glob("*.json")):
        try:
            row = json.loads(path.read_text(encoding="utf-8"))
            if row.get("trading_date") and row.get("market"):
                result.append(row)
        except (OSError, json.JSONDecodeError):
            pass
    return result

def indices(snapshot):
    result = {}
    for row in snapshot.get("market", {}).get("indices", []):
        symbol = row.get("symbol")
        if symbol not in INDEX_NAMES:
            continue
        value = row.get("value") if row.get("value") is not None else row.get("close")
        result[symbol] = {**row, "value": value}
    return result

def sector_shares(snapshot):
    total = snapshot.get("market", {}).get("total_dollar_volume") or 0
    if not total:
        return {}
    return {key: row.get("dollar_volume", 0) / total * 100 for key, row in snapshot.get("groups", {}).get("sector", {}).items() if key in SECTOR_NAMES}

def build_week(start, days, previous, latest):
    first, last = days[0], days[-1]
    old_indices, new_indices = indices(previous) if previous else {}, indices(last)
    index_rows = []
    for symbol, name in INDEX_NAMES.items():
        current, prior = new_indices.get(symbol), old_indices.get(symbol)
        if not current:
            continue
        change = (current["value"] / prior["value"] - 1) * 100 if prior and prior.get("value") else None
        index_rows.append({"symbol": symbol, "name": name, "close": current.get("value"), "change": round(change, 2) if change is not None else None})

    old_shares = sector_shares(previous) if previous else sector_shares(first)
    new_shares = sector_shares(last)
    sector_rows = [{"id": key, "name": SECTOR_NAMES[key], "changeBp": round((share - old_shares.get(key, share)) * 100), "share": round(share, 2)} for key, share in new_shares.items()]
    sector_rows.sort(key=lambda row: row["changeBp"], reverse=True)
    gainers, losers = sector_rows[:2], list(reversed(sector_rows[-2:]))

    stocks = {}
    for snapshot in days:
        for ticker, stock in snapshot.get("tickers", {}).items():
            target = stocks.setdefault(ticker, {"ticker": ticker, "name": stock.get("name_ko") or stock.get("name") or ticker, "dollarVolume": 0})
            target["dollarVolume"] += stock.get("dollar_volume") or 0
    active = sorted(stocks.values(), key=lambda row: row["dollarVolume"], reverse=True)[:5]
    volumes = [row.get("market", {}).get("total_dollar_volume", 0) for row in days]
    prior_volume = previous.get("market", {}).get("total_dollar_volume") if previous else None
    advances = sum(row.get("market", {}).get("advancing_stocks", 0) for row in days)
    declines = sum(row.get("market", {}).get("declining_stocks", 0) for row in days)
    lead_text = "·".join(row["name"] for row in gainers) or "주도 섹터 없음"
    lag_text = "·".join(row["name"] for row in losers) or "축소 섹터 없음"
    end = start + timedelta(days=6)
    return {
        "weekId": start.isoformat(), "label": f"{start.month}월 {start.day}일 주간",
        "startDate": first["trading_date"], "endDate": last["trading_date"],
        "status": "complete" if end < latest else "in_progress", "tradingDays": len(days),
        "summary": f"{lead_text}의 거래대금 점유율이 확대됐고, {lag_text} 비중은 축소됐습니다.",
        "indices": index_rows,
        "market": {
            "averageDollarVolume": round(sum(volumes) / len(volumes)) if volumes else 0,
            "lastDayVolumeChange": round((last["market"]["total_dollar_volume"] / prior_volume - 1) * 100, 2) if prior_volume else None,
            "advancingShare": round(advances / (advances + declines) * 100, 1) if advances + declines else None,
        },
        "sectorGainers": gainers, "sectorLosers": losers, "activeStocks": active,
    }

def main():
    snapshots = load_snapshots()
    if not snapshots:
        OUTPUT.write_text('{"generatedAt":null,"weeks":[]}', encoding="utf-8")
        return
    grouped = defaultdict(list)
    for snapshot in snapshots:
        grouped[week_start(date.fromisoformat(snapshot["trading_date"]))].append(snapshot)
    previous, weeks = None, []
    latest = date.fromisoformat(snapshots[-1]["trading_date"])
    for start in sorted(grouped):
        days = sorted(grouped[start], key=lambda row: row["trading_date"])
        weeks.append(build_week(start, days, previous, latest))
        previous = days[-1]
    payload = {"generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"), "coverageStart": snapshots[0]["trading_date"], "coverageEnd": snapshots[-1]["trading_date"], "weeks": list(reversed(weeks))}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

if __name__ == "__main__":
    main()
