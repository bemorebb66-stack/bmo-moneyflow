#!/usr/bin/env python3
"""Create one date-addressable BVT Replay market snapshot."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def ratio(value: float, baseline: float) -> float | None:
    return round(value / baseline, 4) if baseline else None


def change(value: float, baseline: float) -> float | None:
    value_ratio = ratio(value, baseline)
    return round((value_ratio - 1) * 100, 2) if value_ratio is not None else None


def volume_state(value: float | None) -> str:
    if value is None:
        return "데이터 부족"
    if value >= 2:
        return "매우 강함"
    if value >= 1.2:
        return "강함"
    if value >= 0.8:
        return "보통"
    if value >= 0.5:
        return "약함"
    return "매우 약함"


def flow_state(change_1d: float | None, ratio_5d: float | None) -> str:
    if change_1d is None or ratio_5d is None:
        return "데이터 부족"
    if change_1d >= 15 and ratio_5d >= 1.2:
        return "강한 유입"
    if change_1d > 0 and ratio_5d >= 1:
        return "유입"
    if 0.9 <= ratio_5d <= 1.1:
        return "중립"
    if change_1d <= -15 and ratio_5d <= 0.8:
        return "강한 유출"
    if change_1d < 0 and ratio_5d < 1:
        return "유출"
    return "혼조"


def aggregate(stocks: list[dict[str, Any]], names: Callable[[dict[str, Any]], list[str]]) -> dict[str, Any]:
    buckets: dict[str, dict[str, float]] = defaultdict(
        lambda: {"current": 0, "previous": 0, "avg5": 0, "members": 0}
    )
    for stock in stocks:
        for name in names(stock):
            bucket = buckets[name or "기타"]
            bucket["current"] += float(stock.get("dv") or 0)
            bucket["previous"] += float(stock.get("dvp") or 0)
            bucket["avg5"] += float(stock.get("a5") or 0)
            bucket["members"] += 1
    output = {}
    ordered = sorted(buckets.items(), key=lambda item: item[1]["current"], reverse=True)
    for rank, (name, raw) in enumerate(ordered, 1):
        change_1d = change(raw["current"], raw["previous"])
        ratio_5d = ratio(raw["current"], raw["avg5"])
        output[name] = {
            "dollar_volume": round(raw["current"]),
            "dollar_volume_change_1d": change_1d,
            "dollar_volume_ratio_5d": ratio_5d,
            "rank": rank,
            "members": int(raw["members"]),
            "flow_status": flow_state(change_1d, ratio_5d),
        }
    return output


def build_snapshot(data: dict[str, Any]) -> dict[str, Any]:
    trading_date = data.get("market_date")
    if not trading_date:
        raise ValueError("data.json에 market_date가 없습니다")
    stocks = data.get("stocks") or []
    tickers = {}
    for stock in stocks:
        ticker = str(stock.get("t") or "").upper()
        if not ticker:
            continue
        current = float(stock.get("dv") or 0)
        ratio_20d = ratio(current, float(stock.get("a20") or 0))
        tickers[ticker] = {
            "name": stock.get("n") or ticker,
            "name_ko": stock.get("nko") or "",
            "close_price": stock.get("c"),
            "daily_return": stock.get("pc"),
            "dollar_volume": round(current),
            "dollar_volume_change_1d": change(current, float(stock.get("dvp") or 0)),
            "dollar_volume_ratio_5d": ratio(current, float(stock.get("a5") or 0)),
            "dollar_volume_ratio_20d": ratio_20d,
            "volume_state": volume_state(ratio_20d),
            "surge_20d": bool(ratio_20d is not None and ratio_20d >= 2),
            "sector": stock.get("sec") or "기타",
            "industry": stock.get("ind") or "기타",
            "market_cap": int(stock.get("mc") or 0),
            "market_cap_group": stock.get("cap") or "기타",
            "universes": stock.get("uni") or [],
            "asset_type": stock.get("asset_type") or "COMMON_STOCK",
            "leverage_multiple": stock.get("leverage_multiple") or 1,
            "direction": stock.get("direction") or "LONG",
            "underlying_type": stock.get("underlying_type"),
            "underlying_ticker": stock.get("underlying_ticker"),
            "underlying_index": stock.get("underlying_index"),
            "underlying_industry": stock.get("underlying_industry"),
            "theme": stock.get("theme"),
            "provider": stock.get("provider"),
        }
    total = sum(row["dollar_volume"] for row in tickers.values())
    previous = sum(float(stock.get("dvp") or 0) for stock in stocks)
    market_change = change(total, previous)
    advancing = sum(float(stock.get("pc") or 0) > 0 for stock in stocks)
    declining = sum(float(stock.get("pc") or 0) < 0 for stock in stocks)
    regime = "위험선호" if market_change is not None and market_change > 5 and advancing > declining else (
        "위험회피" if market_change is not None and market_change < -5 and declining > advancing else "중립"
    )
    return {
        "schema_version": 1,
        "trading_date": trading_date,
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "source_updated_at": data.get("updated"),
        "market": {
            "total_dollar_volume": round(total),
            "dollar_volume_change_1d": market_change,
            "advancing_stocks": advancing,
            "declining_stocks": declining,
            "market_regime": regime,
            "indices": data.get("indices") or [],
        },
        "groups": {
            "sector": aggregate(stocks, lambda row: [row.get("sec") or "기타"]),
            "industry": aggregate(stocks, lambda row: [row.get("ind") or "기타"]),
            "market_cap": aggregate(stocks, lambda row: [row.get("cap") or "기타"]),
            "universe": aggregate(stocks, lambda row: row.get("uni") or ["기타"]),
        },
        "tickers": tickers,
    }


def write_snapshot(snapshot: dict[str, Any], output: Path) -> Path:
    snapshots = output / "snapshots"
    logs = output / "logs"
    snapshots.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    target = snapshots / f"{snapshot['trading_date']}.json"
    if target.exists():
        existing = read_json(target)
        comparable = ("source_updated_at", "market", "groups", "tickers")
        if all(existing.get(key) == snapshot.get(key) for key in comparable):
            return target
    target.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    dates = sorted(path.stem for path in snapshots.glob("????-??-??.json"))
    available = {date.fromisoformat(value) for value in dates}
    missing_weekdays = []
    if available:
        cursor = min(available)
        while cursor <= max(available):
            if cursor.weekday() < 5 and cursor not in available:
                missing_weekdays.append(cursor.isoformat())
            cursor += timedelta(days=1)
    manifest = {
        "schema_version": 1,
        "updated_at": snapshot["generated_at"],
        "first_date": dates[0] if dates else None,
        "last_date": dates[-1] if dates else None,
        "snapshot_count": len(dates),
        "dates": dates,
        "missing_weekdays": missing_weekdays,
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    entry = {"timestamp": snapshot["generated_at"], "trading_date": snapshot["trading_date"], "ticker_count": len(snapshot["tickers"]), "status": "stored"}
    with (logs / "ingestion.jsonl").open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "data.json")
    parser.add_argument("--output", type=Path, default=ROOT / "replay_data")
    args = parser.parse_args()
    snapshot = build_snapshot(read_json(args.data))
    target = write_snapshot(snapshot, args.output)
    print(f"Replay snapshot: {target} ({len(snapshot['tickers'])} tickers)")


if __name__ == "__main__":
    main()
