"""Causal forward-return calculations and conservative summary statuses."""

from __future__ import annotations

import math
import statistics
from collections import Counter
from datetime import date, datetime
from typing import Any, Iterable, Mapping

try:
    from scripts.market_calendar import first_session_after, is_trading_day
    from scripts.signal_engine import CURRENT_PROXY, adjusted_price
except ModuleNotFoundError:
    from market_calendar import first_session_after, is_trading_day
    from signal_engine import CURRENT_PROXY, adjusted_price


PERFORMANCE_RULE_VERSION = "bvt-performance/2.0.0"
COMMISSION_BP_PER_SIDE = 5.0
SLIPPAGE_BP_PER_SIDE = 10.0
ROUND_TRIP_SIDE_COST = (COMMISSION_BP_PER_SIDE + SLIPPAGE_BP_PER_SIDE) / 10_000.0
MIN_SAMPLE_SIZE = 30
MIN_COVERAGE = 0.90


def net_long_return(entry_adjusted_open: float, exit_adjusted_close: float, side_cost: float = ROUND_TRIP_SIDE_COST) -> float:
    if not all(math.isfinite(value) and value > 0 for value in (entry_adjusted_open, exit_adjusted_close)):
        raise ValueError("entry and exit prices must be finite and positive")
    if not math.isfinite(side_cost) or side_cost < 0 or side_cost >= 1:
        raise ValueError("side_cost must satisfy 0 <= side_cost < 1")
    return exit_adjusted_close * (1.0 - side_cost) / (entry_adjusted_open * (1.0 + side_cost)) - 1.0


def excess_return(strategy_return: float, benchmark_return: float) -> float:
    if benchmark_return <= -1.0:
        raise ValueError("benchmark return must be greater than -100%")
    return (1.0 + strategy_return) / (1.0 + benchmark_return) - 1.0


def delisting_outcome(entry_value: float, cash_or_terminal_value: float | None) -> dict[str, Any]:
    if not math.isfinite(entry_value) or entry_value <= 0:
        return {"status": "INCOMPLETE", "reasons": ["INVALID_ENTRY_PRICE"]}
    if cash_or_terminal_value is None:
        return {"status": "INCOMPLETE", "reasons": ["DELISTING_VALUE_UNKNOWN"]}
    if not math.isfinite(cash_or_terminal_value) or cash_or_terminal_value < 0:
        return {"status": "INCOMPLETE", "reasons": ["INVALID_DELISTING_VALUE"]}
    return {"status": "COMPLETE", "reasons": [], "net_return": cash_or_terminal_value / entry_value - 1.0}


def calculate_forward_outcome(
    *,
    available_at: datetime,
    price_rows: Iterable[Mapping[str, Any]],
    benchmark_rows: Iterable[Mapping[str, Any]],
    horizon: int,
) -> dict[str, Any]:
    if horizon not in {1, 5, 20}:
        raise ValueError("horizon must be one of 1, 5, 20")
    entry_session = first_session_after(available_at).isoformat()
    raw_prices = list(price_rows)
    raw_benchmark = list(benchmark_rows)
    try:
        price_dates = [date.fromisoformat(str(row.get("session_date"))) for row in raw_prices]
        benchmark_dates = [date.fromisoformat(str(row.get("session_date"))) for row in raw_benchmark]
    except ValueError:
        return {"status": "INCOMPLETE", "reasons": ["INVALID_SESSION_DATE"], "entry_session": entry_session}
    if any(not is_trading_day(day) for day in price_dates + benchmark_dates):
        return {"status": "INCOMPLETE", "reasons": ["NON_TRADING_SESSION_ROW"], "entry_session": entry_session}
    if len(set(price_dates)) != len(price_dates) or len(set(benchmark_dates)) != len(benchmark_dates):
        return {"status": "INCOMPLETE", "reasons": ["DUPLICATE_SESSION_DATE"], "entry_session": entry_session}
    prices = sorted((row for row in raw_prices if str(row.get("session_date")) >= entry_session), key=lambda row: str(row["session_date"]))
    if len(prices) < horizon:
        return {"status": "INCOMPLETE", "reasons": ["MISSING_EXIT_SESSION"], "entry_session": entry_session}
    entry = prices[0]
    exit_row = prices[horizon - 1]
    if str(entry["session_date"]) != entry_session:
        return {"status": "INCOMPLETE", "reasons": ["MISSING_ENTRY_SESSION"], "entry_session": entry_session}
    try:
        entry_price = adjusted_price(float(entry["open"]), float(entry["close"]), float(entry["adj_close"]))
        exit_price = float(exit_row["adj_close"])
        strategy_return = net_long_return(entry_price, exit_price)
    except (KeyError, TypeError, ValueError):
        return {"status": "INCOMPLETE", "reasons": ["INVALID_PRICE_INPUT"], "entry_session": entry_session}
    benchmark_by_date = {str(row.get("session_date")): row for row in raw_benchmark}
    benchmark_entry = benchmark_by_date.get(entry_session)
    benchmark_exit = benchmark_by_date.get(str(exit_row["session_date"]))
    if not benchmark_entry or not benchmark_exit:
        return {"status": "INCOMPLETE", "reasons": ["MISSING_BENCHMARK_SESSION"], "entry_session": entry_session}
    try:
        benchmark_entry_price = adjusted_price(float(benchmark_entry["open"]), float(benchmark_entry["close"]), float(benchmark_entry["adj_close"]))
        benchmark_return = float(benchmark_exit["adj_close"]) / benchmark_entry_price - 1.0
    except (KeyError, TypeError, ValueError):
        return {"status": "INCOMPLETE", "reasons": ["INVALID_BENCHMARK_INPUT"], "entry_session": entry_session}
    return {
        "status": "COMPLETE",
        "reasons": [],
        "entry_session": entry_session,
        "exit_session": str(exit_row["session_date"]),
        "entry_adjusted_open": entry_price,
        "exit_adjusted_close": exit_price,
        "net_return": strategy_return,
        "benchmark_return": benchmark_return,
        "excess_return": excess_return(strategy_return, benchmark_return),
    }


def _quantile(values: list[float], probability: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] * (upper - position) + ordered[upper] * (position - lower)


def summarize_outcomes(
    outcomes: Iterable[Mapping[str, Any]],
    *,
    expected_count: int,
    data_grade: str,
) -> dict[str, Any]:
    rows = list(outcomes)
    valid = [row for row in rows if row.get("status") == "COMPLETE" and isinstance(row.get("net_return"), (int, float))]
    returns = [float(row["net_return"]) for row in valid if math.isfinite(float(row["net_return"]))]
    reason_counts = Counter(
        str(reason)
        for row in rows
        if row.get("status") != "COMPLETE"
        for reason in row.get("reasons", ["UNKNOWN_INCOMPLETE_REASON"])
    )
    coverage = len(returns) / expected_count if expected_count > 0 else 0.0

    status = "ELIGIBLE"
    reasons: list[str] = []
    if coverage < MIN_COVERAGE:
        status = "INCOMPLETE"
        reasons.append("COVERAGE_BELOW_90_PERCENT")
    if len(returns) < MIN_SAMPLE_SIZE:
        if status == "ELIGIBLE":
            status = "INSUFFICIENT_SAMPLE"
        reasons.append("SAMPLE_BELOW_30")
    if data_grade == CURRENT_PROXY:
        status = "UNAVAILABLE_DATA_GRADE"
        reasons.append("CURRENT_PROXY_SURVIVORSHIP_RISK")

    result: dict[str, Any] = {
        "performance_rule_version": PERFORMANCE_RULE_VERSION,
        "status": status,
        "reasons": reasons,
        "expected_count": expected_count,
        "sample_count": len(returns),
        "coverage": coverage,
        "excluded_reasons": dict(sorted(reason_counts.items())),
        "is_confirmatory": False,
    }
    if not returns:
        result.update({"hit_rate": None, "mean": None, "median": None, "p10": None, "p25": None, "p75": None, "p90": None, "distribution": {}})
        return result

    distribution = {
        "loss_below_10pct": sum(value < -0.10 for value in returns),
        "loss_0_to_10pct": sum(-0.10 <= value < 0 for value in returns),
        "gain_0_to_10pct": sum(0 <= value < 0.10 for value in returns),
        "gain_10pct_or_more": sum(value >= 0.10 for value in returns),
    }
    result.update(
        {
            "hit_rate": sum(value > 0 for value in returns) / len(returns),
            "mean": statistics.fmean(returns),
            "median": statistics.median(returns),
            "p10": _quantile(returns, 0.10),
            "p25": _quantile(returns, 0.25),
            "p75": _quantile(returns, 0.75),
            "p90": _quantile(returns, 0.90),
            "distribution": distribution,
        }
    )
    return result
