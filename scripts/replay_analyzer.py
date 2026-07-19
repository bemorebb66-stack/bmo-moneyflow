#!/usr/bin/env python3
"""Analyze a BVT standard trade CSV against Replay snapshots."""

from __future__ import annotations

import argparse
import csv
import json
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {"ticker", "transaction_date", "transaction_type", "quantity", "price", "fee", "currency"}
BUY = {"buy", "b", "매수"}
SELL = {"sell", "s", "매도"}


@dataclass
class Execution:
    ticker: str
    execution_date: date
    side: str
    quantity: float
    price: float
    fee: float


def parse_executions(path: Path) -> list[Execution]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"필수 열 누락: {', '.join(sorted(missing))}")
        output = []
        for line, row in enumerate(reader, 2):
            if (row["currency"] or "").strip().upper() != "USD":
                raise ValueError(f"{line}행: MVP는 USD 거래만 지원합니다")
            raw_side = (row["transaction_type"] or "").strip().lower()
            side = "buy" if raw_side in BUY else "sell" if raw_side in SELL else None
            if side is None:
                raise ValueError(f"{line}행: 매수/매도 구분을 확인하세요")
            try:
                item = Execution(
                    (row["ticker"] or "").strip().upper().replace(".", "-"),
                    date.fromisoformat((row["transaction_date"] or "").strip()),
                    side,
                    float(row["quantity"]),
                    float(row["price"]),
                    float(row["fee"] or 0),
                )
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{line}행: 날짜 또는 숫자 형식 오류") from exc
            if not item.ticker or item.quantity <= 0 or item.price <= 0 or item.fee < 0:
                raise ValueError(f"{line}행: 티커·수량·가격·수수료를 확인하세요")
            output.append(item)
    return sorted(output, key=lambda item: item.execution_date)


def combine_completed_trades(executions: list[Execution]) -> tuple[list[dict[str, Any]], list[str]]:
    positions: dict[str, dict[str, Any]] = {}
    completed = []
    for execution in executions:
        position = positions.setdefault(execution.ticker, {
            "quantity": 0.0, "cost": 0.0, "entry_date": None, "buy_count": 0,
            "sell_count": 0, "proceeds": 0.0, "sold_quantity": 0.0, "sell_fees": 0.0,
            "total_bought": 0.0, "buy_cost": 0.0, "realized_cost": 0.0,
        })
        if execution.side == "buy":
            if position["quantity"] == 0:
                position.update({"cost": 0.0, "entry_date": execution.execution_date, "buy_count": 0, "sell_count": 0, "proceeds": 0.0, "sold_quantity": 0.0, "sell_fees": 0.0, "total_bought": 0.0, "buy_cost": 0.0, "realized_cost": 0.0})
            position["quantity"] += execution.quantity
            purchase_cost = execution.quantity * execution.price + execution.fee
            position["cost"] += purchase_cost
            position["buy_cost"] += purchase_cost
            position["total_bought"] += execution.quantity
            position["buy_count"] += 1
            continue
        if execution.quantity > position["quantity"] + 1e-9:
            raise ValueError(f"{execution.ticker}: 보유 수량보다 많은 매도입니다")
        average_cost = position["cost"] / position["quantity"]
        position["quantity"] -= execution.quantity
        position["cost"] -= average_cost * execution.quantity
        position["realized_cost"] += average_cost * execution.quantity
        position["proceeds"] += execution.quantity * execution.price
        position["sold_quantity"] += execution.quantity
        position["sell_fees"] += execution.fee
        position["sell_count"] += 1
        if abs(position["quantity"]) < 1e-9:
            invested = position["realized_cost"]
            net_proceeds = position["proceeds"] - position["sell_fees"]
            profit = net_proceeds - invested
            completed.append({
                "ticker": execution.ticker,
                "entry_date": position["entry_date"].isoformat(),
                "exit_date": execution.execution_date.isoformat(),
                "average_entry_price": round(position["buy_cost"] / position["total_bought"], 4),
                "average_exit_price": round(position["proceeds"] / position["sold_quantity"], 4),
                "quantity": round(position["sold_quantity"], 8),
                "realized_profit": round(profit, 2),
                "return_percent": round(profit / invested * 100, 2) if invested else 0,
                "holding_days": (execution.execution_date - position["entry_date"]).days,
                "buy_count": position["buy_count"],
                "sell_count": position["sell_count"],
            })
            position["quantity"] = position["cost"] = 0.0
    warnings = [f"{ticker}: 미청산 수량 {row['quantity']:g}주는 분석에서 제외" for ticker, row in positions.items() if row["quantity"] > 1e-9]
    return completed, warnings


def load_snapshot(directory: Path, entry_date: str) -> tuple[dict[str, Any] | None, str | None]:
    candidates = sorted(path for path in directory.glob("????-??-??.json") if path.stem <= entry_date)
    if not candidates:
        return None, None
    chosen = candidates[-1]
    return json.loads(chosen.read_text(encoding="utf-8")), chosen.stem


def attach_context(trades: list[dict[str, Any]], directory: Path) -> list[dict[str, Any]]:
    output = []
    for trade in trades:
        snapshot, context_date = load_snapshot(directory, trade["entry_date"])
        ticker = snapshot.get("tickers", {}).get(trade["ticker"]) if snapshot else None
        if not snapshot or not ticker:
            output.append({**trade, "context_status": "데이터 없음", "market_context": None})
            continue
        groups = snapshot["groups"]
        output.append({**trade,
            "context_status": "정상" if context_date == trade["entry_date"] else f"직전 거래일 {context_date}",
            "market_context": {
                "trading_date": context_date,
                "ticker": ticker,
                "industry": groups["industry"].get(ticker["industry"]),
                "sector": groups["sector"].get(ticker["sector"]),
                "market_cap": groups["market_cap"].get(ticker["market_cap_group"]),
                "market": snapshot["market"],
            },
        })
    return output


def summarize(trades: list[dict[str, Any]]) -> dict[str, Any]:
    if not trades:
        return {"total_trades": 0, "win_rate": None, "average_return": None, "conditions": []}
    conditions: dict[str, list[float]] = {}
    for trade in trades:
        context = trade.get("market_context")
        if not context:
            continue
        labels = [f"종목 거래대금 {context['ticker']['volume_state']}", f"시장 상태 {context['market']['market_regime']}"]
        if context.get("industry"):
            labels.append(f"산업 흐름 {context['industry']['flow_status']}")
        for label in labels:
            conditions.setdefault(label, []).append(trade["return_percent"])
    rows = []
    for label, returns in conditions.items():
        count = len(returns)
        rows.append({"condition": label, "trades": count, "win_rate": round(sum(value > 0 for value in returns) / count * 100, 1), "average_return": round(sum(returns) / count, 2), "confidence": "숨김" if count < 3 else "참고" if count < 5 else "낮음" if count < 10 else "보통" if count < 20 else "높음"})
    return {
        "total_trades": len(trades),
        "win_rate": round(sum(trade["return_percent"] > 0 for trade in trades) / len(trades) * 100, 1),
        "average_return": round(sum(trade["return_percent"] for trade in trades) / len(trades), 2),
        "average_holding_days": round(sum(trade["holding_days"] for trade in trades) / len(trades), 1),
        "conditions": sorted(rows, key=lambda row: (row["trades"], abs(row["average_return"])), reverse=True),
    }


def analyze(csv_path: Path, replay_data: Path) -> dict[str, Any]:
    trades, warnings = combine_completed_trades(parse_executions(csv_path))
    enriched = attach_context(trades, replay_data / "snapshots")
    return {"summary": summarize(enriched), "trades": enriched, "warnings": warnings}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("csv", type=Path)
    parser.add_argument("--replay-data", type=Path, default=ROOT / "replay_data")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    payload = json.dumps(analyze(args.csv, args.replay_data), ensure_ascii=False, indent=2)
    args.output.write_text(payload, encoding="utf-8") if args.output else print(payload)


if __name__ == "__main__":
    main()
