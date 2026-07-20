#!/usr/bin/env python3
"""Backfill BVT Replay snapshots from historical daily price and volume data."""

from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd

try:
    from scripts.build_replay_snapshot import build_snapshot, write_snapshot
except ModuleNotFoundError:
    from build_replay_snapshot import build_snapshot, write_snapshot

ROOT = Path(__file__).resolve().parents[1]
INDEX_SYMBOLS = {
    "^GSPC": "S&P 500",
    "^NDX": "Nasdaq 100",
    "^RUT": "Russell 2000",
    "^DJI": "Dow Jones",
}


def chunks(values: list[str], size: int) -> list[list[str]]:
    return [values[index:index + size] for index in range(0, len(values), size)]


def ticker_frame(download: pd.DataFrame, ticker: str) -> pd.DataFrame:
    if download.empty:
        return pd.DataFrame()
    if isinstance(download.columns, pd.MultiIndex):
        level_zero = set(download.columns.get_level_values(0))
        if ticker in level_zero:
            return download[ticker]
        level_one = set(download.columns.get_level_values(1))
        if ticker in level_one:
            return download.xs(ticker, axis=1, level=1)
    return download


def download_history(
    tickers: list[str], start: str, end: str, batch_size: int = 150, retries: int = 3
) -> tuple[dict[str, pd.DataFrame], list[str]]:
    import yfinance as yf

    history: dict[str, pd.DataFrame] = {}
    failed: list[str] = []
    for batch_number, batch in enumerate(chunks(tickers, batch_size), 1):
        result = pd.DataFrame()
        for attempt in range(retries):
            try:
                result = yf.download(
                    batch,
                    start=start,
                    end=end,
                    auto_adjust=False,
                    actions=False,
                    group_by="ticker",
                    threads=True,
                    progress=False,
                    timeout=30,
                )
                if not result.empty:
                    break
            except Exception:
                if attempt == retries - 1:
                    result = pd.DataFrame()
                else:
                    time.sleep(2 ** attempt)
        for ticker in batch:
            frame = ticker_frame(result, ticker)
            if frame.empty or "Close" not in frame or "Volume" not in frame:
                failed.append(ticker)
                continue
            clean = frame[["Close", "Volume"]].copy()
            clean.index = pd.to_datetime(clean.index).tz_localize(None).normalize()
            clean = clean.dropna(subset=["Close", "Volume"])
            if clean.empty:
                failed.append(ticker)
            else:
                history[ticker] = clean
        print(f"Downloaded batch {batch_number}/{len(chunks(tickers, batch_size))}: {len(history)} tickers ready")
    unresolved = []
    for ticker in failed:
        try:
            result = yf.download(
                ticker, start=start, end=end, auto_adjust=False, actions=False,
                group_by="ticker", threads=False, progress=False, timeout=30,
            )
            frame = ticker_frame(result, ticker)
            if frame.empty or "Close" not in frame or "Volume" not in frame:
                unresolved.append(ticker)
                continue
            clean = frame[["Close", "Volume"]].copy()
            clean.index = pd.to_datetime(clean.index).tz_localize(None).normalize()
            clean = clean.dropna(subset=["Close", "Volume"])
            if clean.empty:
                unresolved.append(ticker)
            else:
                history[ticker] = clean
        except Exception:
            unresolved.append(ticker)
    return history, unresolved


def index_rows(index_history: dict[str, pd.DataFrame], trading_day: pd.Timestamp) -> list[dict[str, Any]]:
    rows = []
    for symbol, name in INDEX_SYMBOLS.items():
        frame = index_history.get(symbol)
        if frame is None or trading_day not in frame.index:
            continue
        position = frame.index.get_loc(trading_day)
        close = float(frame.iloc[position]["Close"])
        previous = float(frame.iloc[position - 1]["Close"]) if position > 0 else 0
        rows.append({
            "symbol": symbol,
            "name": name,
            "close": round(close, 2),
            "change_percent": round((close / previous - 1) * 100, 2) if previous else None,
        })
    return rows


def build_historical_snapshots(
    source: dict[str, Any], history: dict[str, pd.DataFrame], days: int,
    index_history: dict[str, pd.DataFrame] | None = None,
) -> tuple[list[dict[str, Any]], list[str]]:
    metadata = {str(row.get("t") or "").upper(): row for row in source.get("stocks", []) if row.get("t")}
    all_dates = sorted({day for frame in history.values() for day in frame.index})
    target_dates = all_dates[-days:]
    snapshots = []
    skipped_dates = []
    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    for trading_day in target_dates:
        stocks = []
        for ticker, frame in history.items():
            if ticker not in metadata or trading_day not in frame.index:
                continue
            position = frame.index.get_loc(trading_day)
            if not isinstance(position, int) or position < 1:
                continue
            current = frame.iloc[position]
            previous = frame.iloc[position - 1]
            close = float(current["Close"])
            volume = float(current["Volume"])
            dollar_volume = close * volume
            previous_dollar_volume = float(previous["Close"]) * float(previous["Volume"])
            recent5 = frame.iloc[max(0, position - 4):position + 1]
            recent20 = frame.iloc[max(0, position - 19):position + 1]
            average5 = float((recent5["Close"] * recent5["Volume"]).mean())
            average20 = float((recent20["Close"] * recent20["Volume"]).mean())
            meta = metadata[ticker]
            stocks.append({
                "t": ticker,
                "n": meta.get("n") or ticker,
                "nko": meta.get("nko") or "",
                "c": round(close, 4),
                "pc": round((close / float(previous["Close"]) - 1) * 100, 2) if previous["Close"] else 0,
                "dv": dollar_volume,
                "dvp": previous_dollar_volume,
                "a5": average5,
                "a20": average20,
                "sec": meta.get("sec"),
                "ind": meta.get("ind"),
                "cap": meta.get("cap"),
                "mc": meta.get("mc"),
                "uni": meta.get("uni") or [],
                "asset_type": meta.get("asset_type") or "COMMON_STOCK",
                "leverage_multiple": meta.get("leverage_multiple") or 1,
                "direction": meta.get("direction") or "LONG",
                "underlying_type": meta.get("underlying_type"),
                "underlying_ticker": meta.get("underlying_ticker"),
                "underlying_index": meta.get("underlying_index"),
                "underlying_industry": meta.get("underlying_industry"),
                "theme": meta.get("theme"),
                "provider": meta.get("provider"),
            })
        if not stocks:
            skipped_dates.append(trading_day.date().isoformat())
            continue
        payload = {
            "market_date": trading_day.date().isoformat(),
            "updated": f"historical:{trading_day.date().isoformat()}",
            "indices": index_rows(index_history or {}, trading_day),
            "stocks": stocks,
        }
        snapshot = build_snapshot(payload)
        snapshot["backfill"] = {
            "price_volume_source": "Yahoo Finance daily OHLCV",
            "classification_basis": source.get("market_date"),
            "classification_mode": "current-proxy",
        }
        snapshots.append(snapshot)
    return snapshots, skipped_dates


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill recent BVT Replay market snapshots")
    parser.add_argument("--days", type=int, default=90)
    parser.add_argument("--data", type=Path, default=ROOT / "data.json")
    parser.add_argument("--output", type=Path, default=ROOT / "replay_data")
    parser.add_argument("--batch-size", type=int, default=150)
    parser.add_argument("--etf-metadata", type=Path, default=ROOT / "replay_data" / "etf_metadata.json")
    args = parser.parse_args()
    if not 1 <= args.days <= 260:
        raise ValueError("--days must be between 1 and 260")

    source = json.loads(args.data.read_text(encoding="utf-8"))
    if args.etf_metadata.exists():
        etfs = json.loads(args.etf_metadata.read_text(encoding="utf-8"))
        existing = {str(row.get("t") or "").upper() for row in source.get("stocks", [])}
        source.setdefault("stocks", []).extend(row for row in etfs if str(row.get("t") or "").upper() not in existing)
    tickers = sorted({str(row.get("t") or "").upper() for row in source.get("stocks", []) if row.get("t")})
    end = datetime.now(timezone.utc).date() + timedelta(days=2)
    start = end - timedelta(days=max(180, args.days * 2 + 45))
    history, failed = download_history(tickers, start.isoformat(), end.isoformat(), args.batch_size)
    indices, failed_indices = download_history(list(INDEX_SYMBOLS), start.isoformat(), end.isoformat(), 4)
    snapshots, skipped_dates = build_historical_snapshots(source, history, args.days, indices)
    for snapshot in snapshots:
        write_snapshot(snapshot, args.output)

    report = {
        "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "requested_trading_days": args.days,
        "stored_dates": [snapshot["trading_date"] for snapshot in snapshots],
        "stored_count": len(snapshots),
        "source_ticker_count": len(tickers),
        "downloaded_ticker_count": len(history),
        "failed_tickers": failed,
        "failed_indices": failed_indices,
        "skipped_dates": skipped_dates,
        "classification_basis": source.get("market_date"),
    }
    logs = args.output / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    (logs / "backfill-latest.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Replay backfill complete: {len(snapshots)} dates, {len(history)}/{len(tickers)} tickers")


if __name__ == "__main__":
    main()
