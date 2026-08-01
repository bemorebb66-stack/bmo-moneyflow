#!/usr/bin/env python3
"""Create one date-addressable BVT Replay market snapshot."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import tempfile
from collections import defaultdict
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any, Callable

ROOT = Path(__file__).resolve().parents[1]
INDEX_NAMES = {"^GSPC": "S&P 500", "^NDX": "Nasdaq 100", "^RUT": "Russell 2000", "^DJI": "Dow Jones"}

try:
    from scripts.market_calendar import CALENDAR_VERSION, is_trading_day, session_bounds
    from scripts.signal_engine import (
        CURRENT_PROXY,
        DATA_CONTRACT_VERSION,
        REPLAY_RULE_VERSION,
        SIGNAL_RULE_VERSION,
        VALID_DATA_GRADES,
        classify_stock_signal,
        validate_snapshot_contract,
    )
except ModuleNotFoundError:
    from market_calendar import CALENDAR_VERSION, is_trading_day, session_bounds
    from signal_engine import (
        CURRENT_PROXY,
        DATA_CONTRACT_VERSION,
        REPLAY_RULE_VERSION,
        SIGNAL_RULE_VERSION,
        VALID_DATA_GRADES,
        classify_stock_signal,
        validate_snapshot_contract,
    )


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def atomic_write_json(path: Path, payload: dict[str, Any], *, indent: int | None = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            temporary_name = handle.name
            json.dump(payload, handle, ensure_ascii=False, indent=indent, separators=None if indent else (",", ":"))
            handle.write("\n" if indent else "")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, path)
        temporary_name = None
    finally:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)


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


def parse_source_timestamp(value: Any) -> datetime | None:
    if not value:
        return None
    raw = str(value).strip().replace(" UTC", "+00:00")
    try:
        parsed = datetime.fromisoformat(raw)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def content_hash(snapshot: dict[str, Any]) -> str:
    stable = {key: value for key, value in snapshot.items() if key not in {"content_hash", "generated_at"}}
    payload = json.dumps(stable, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"sha256:{hashlib.sha256(payload).hexdigest()}"


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
    session_date = date.fromisoformat(trading_date)
    if not is_trading_day(session_date):
        raise ValueError(f"market_date가 XNYS 거래일이 아닙니다: {trading_date}")
    stocks = data.get("stocks") or []
    if not isinstance(stocks, list):
        raise ValueError("stocks는 배열이어야 합니다")
    tickers = {}
    for stock in stocks:
        ticker = str(stock.get("t") or "").upper()
        if not ticker:
            continue
        if ticker in tickers:
            raise ValueError(f"중복 ticker: {ticker}")
        current = float(stock.get("dv") or 0)
        ratio_20d = ratio(current, float(stock.get("a20") or 0))
        price_change = stock.get("pc")
        source_signal_status = stock.get("sig_status")
        can_reconstruct_signal = (
            source_signal_status is None
            and ratio_20d is not None
            and isinstance(price_change, (int, float))
            and math.isfinite(float(price_change))
        )
        reconstructed_signal = classify_stock_signal((ratio_20d - 1) * 100, float(price_change)) if can_reconstruct_signal else None
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
            "surge_20d": bool(ratio_20d is not None and ratio_20d >= 2 and current >= 50_000_000),
            "signal": stock.get("sig") if source_signal_status == "COMPLETE" else reconstructed_signal,
            "signal_status": source_signal_status or ("COMPLETE" if can_reconstruct_signal else "INCOMPLETE"),
            "signal_reasons": stock.get("sig_reasons") or (["RECONSTRUCTED_FROM_VERSIONED_LEGACY_BASELINE"] if can_reconstruct_signal else ["LEGACY_SOURCE_WITHOUT_VALIDATION"]),
            "signal_rule_version": stock.get("sig_ver") or SIGNAL_RULE_VERSION,
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
    indices = []
    for row in data.get("indices") or []:
        if row.get("date") and row.get("date") != trading_date:
            continue
        symbol = row.get("symbol")
        close = row.get("close", row.get("value"))
        if not symbol or close is None:
            continue
        indices.append({
            "symbol": symbol,
            "name": row.get("name") or INDEX_NAMES.get(symbol, symbol),
            "close": close,
            "change_percent": row.get("change_percent", row.get("change")),
        })
    _, cutoff = session_bounds(session_date)
    source_updated = parse_source_timestamp(data.get("updated"))
    generated_at = datetime.now(timezone.utc).replace(microsecond=0)
    # A reconstructed artifact cannot claim it was available before this exact
    # revision was generated, even if the upstream data timestamp is older.
    available_at = max(cutoff, source_updated or generated_at, generated_at)
    data_grade = data.get("data_grade") if data.get("data_grade") in VALID_DATA_GRADES else CURRENT_PROXY
    snapshot = {
        "schema_version": 2,
        "trading_date": trading_date,
        "generated_at": generated_at.isoformat(),
        "source_updated_at": data.get("updated"),
        "source_content_hash": f"sha256:{hashlib.sha256(json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')).hexdigest()}",
        "information_cutoff_at": cutoff.isoformat(),
        "available_at": available_at.isoformat(),
        "calendar_version": CALENDAR_VERSION,
        "data_contract_version": data.get("data_contract_version") or DATA_CONTRACT_VERSION,
        "signal_rule_version": data.get("signal_rule_version") or SIGNAL_RULE_VERSION,
        "replay_rule_version": REPLAY_RULE_VERSION,
        "data_grade": data_grade,
        "data_grade_reasons": data.get("data_grade_reasons") or ["LEGACY_OR_UNVERSIONED_SOURCE"],
        "price_policy": data.get("price_policy") or {
            "dollar_volume": "raw_close_x_contemporaneous_volume",
            "returns": "adjusted_close_total_return",
            "rolling_baseline": "20_prior_sessions_excluding_signal_session",
        },
        "runtime_versions": data.get("runtime_versions") or {},
        "market": {
            "total_dollar_volume": round(total),
            "dollar_volume_change_1d": market_change,
            "advancing_stocks": advancing,
            "declining_stocks": declining,
            "market_regime": regime,
            "indices": indices,
        },
        "groups": {
            "sector": aggregate(stocks, lambda row: [row.get("sec") or "기타"]),
            "industry": aggregate(stocks, lambda row: [row.get("ind") or "기타"]),
            "market_cap": aggregate(stocks, lambda row: [row.get("cap") or "기타"]),
            "universe": aggregate(stocks, lambda row: row.get("uni") or ["기타"]),
        },
        "tickers": tickers,
    }
    snapshot["content_hash"] = content_hash(snapshot)
    return snapshot


def build_manifest(output: Path) -> dict[str, Any]:
    snapshots = output / "snapshots"
    dates = sorted(path.stem for path in snapshots.glob("????-??-??.json"))
    for value in dates:
        snapshot = read_json(snapshots / f"{value}.json")
        if snapshot.get("trading_date") != value:
            raise ValueError(f"snapshot trading_date differs from filename: {value}")
    available = {date.fromisoformat(value) for value in dates}
    missing_trading_days = []
    if available:
        cursor = min(available)
        while cursor <= max(available):
            if is_trading_day(cursor) and cursor not in available:
                missing_trading_days.append(cursor.isoformat())
            cursor = date.fromordinal(cursor.toordinal() + 1)
    entries = []
    for path in sorted((output / "revisions").glob("????-??-??/*.json")):
        row = read_json(path)
        entries.append({
            "trading_date": row.get("trading_date"),
            "available_at": row.get("available_at"),
            "data_grade": row.get("data_grade"),
            "content_hash": row.get("content_hash"),
            "file_hash": f"sha256:{hashlib.sha256(path.read_bytes()).hexdigest()}",
            "data_contract_version": row.get("data_contract_version"),
            "signal_rule_version": row.get("signal_rule_version"),
            "replay_rule_version": row.get("replay_rule_version"),
            "calendar_version": row.get("calendar_version"),
            "path": path.relative_to(output).as_posix(),
            "selectable": bool(row.get("available_at")),
        })
    selectable_entries = [
        entry
        for entry in entries
        if entry["selectable"]
        and entry["data_contract_version"] == DATA_CONTRACT_VERSION
        and entry["signal_rule_version"] == SIGNAL_RULE_VERSION
        and entry["replay_rule_version"] == REPLAY_RULE_VERSION
        and entry["calendar_version"] == CALENDAR_VERSION
        and entry["data_grade"] in VALID_DATA_GRADES
    ]
    selectable_dates = sorted({entry["trading_date"] for entry in selectable_entries})
    latest_snapshot = read_json(snapshots / f"{dates[-1]}.json") if dates else {}
    return {
        "schema_version": 2,
        "updated_at": latest_snapshot.get("generated_at"),
        "first_date": dates[0] if dates else None,
        "last_date": dates[-1] if dates else None,
        "snapshot_count": len(dates),
        "revision_count": len(entries),
        "selectable_revision_count": len(selectable_entries),
        "first_selectable_date": selectable_dates[0] if selectable_dates else None,
        "last_selectable_date": selectable_dates[-1] if selectable_dates else None,
        "dates": dates,
        "missing_trading_days": missing_trading_days,
        "entries": entries,
        "data_contract_version": DATA_CONTRACT_VERSION,
        "signal_rule_version": SIGNAL_RULE_VERSION,
        "replay_rule_version": REPLAY_RULE_VERSION,
        "calendar_version": CALENDAR_VERSION,
    }


def write_manifest(output: Path) -> dict[str, Any]:
    manifest = build_manifest(output)
    atomic_write_json(output / "manifest.json", manifest, indent=2)
    return manifest


def write_snapshot(snapshot: dict[str, Any], output: Path) -> Path:
    contract_errors = validate_snapshot_contract(snapshot)
    if contract_errors:
        raise ValueError(f"invalid snapshot contract: {', '.join(contract_errors)}")
    if snapshot.get("content_hash") != content_hash(snapshot):
        raise ValueError("snapshot content_hash mismatch")
    snapshots = output / "snapshots"
    logs = output / "logs"
    snapshots.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    target = snapshots / f"{snapshot['trading_date']}.json"
    stored = True
    active_snapshot = snapshot
    if target.exists():
        existing = read_json(target)
        same_source_contract = (
            existing.get("schema_version") == 2
            and existing.get("source_content_hash") == snapshot.get("source_content_hash")
            and existing.get("data_contract_version") == snapshot.get("data_contract_version")
            and existing.get("signal_rule_version") == snapshot.get("signal_rule_version")
            and existing.get("replay_rule_version") == snapshot.get("replay_rule_version")
            and existing.get("calendar_version") == snapshot.get("calendar_version")
            and existing.get("data_grade") == snapshot.get("data_grade")
        )
        if same_source_contract or existing.get("content_hash") == snapshot.get("content_hash"):
            stored = False
            active_snapshot = existing
    if stored:
        revision = output / "revisions" / snapshot["trading_date"] / snapshot["content_hash"].removeprefix("sha256:")
        revision = revision.with_suffix(".json")
        atomic_write_json(revision, snapshot)
        atomic_write_json(target, snapshot)
    write_manifest(output)
    if stored:
        entry = {
            "timestamp": snapshot["generated_at"],
            "trading_date": snapshot["trading_date"],
            "ticker_count": len(snapshot["tickers"]),
            "status": "stored",
            "content_hash": snapshot["content_hash"],
            "data_grade": snapshot["data_grade"],
            "data_contract_version": snapshot["data_contract_version"],
            "signal_rule_version": snapshot["signal_rule_version"],
            "replay_rule_version": snapshot["replay_rule_version"],
            "calendar_version": snapshot["calendar_version"],
        }
        with (logs / "ingestion.jsonl").open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, default=ROOT / "data.json")
    parser.add_argument("--output", type=Path, default=ROOT / "replay_data")
    parser.add_argument("--manifest-only", action="store_true")
    args = parser.parse_args()
    if args.manifest_only:
        manifest = write_manifest(args.output)
        print(f"Replay manifest: {manifest['snapshot_count']} snapshots through {manifest['last_date']}")
        return
    snapshot = build_snapshot(read_json(args.data))
    target = write_snapshot(snapshot, args.output)
    print(f"Replay snapshot: {target} ({len(snapshot['tickers'])} tickers)")


if __name__ == "__main__":
    main()
