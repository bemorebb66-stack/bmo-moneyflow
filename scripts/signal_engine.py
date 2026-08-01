"""Versioned, reproducible signal rules and market-data validation."""

from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Iterable, Mapping

try:
    from scripts.market_calendar import CALENDAR_VERSION, is_trading_day
except ModuleNotFoundError:
    from market_calendar import CALENDAR_VERSION, is_trading_day


SIGNAL_RULE_VERSION = "bvt-signal/2.0.0"
REPLAY_RULE_VERSION = "bvt-replay/2.0.0"
DATA_CONTRACT_VERSION = "bvt-market-data/2.0.0"
BENCHMARK_VERSION = "US-SPY-total-return/1.0.0"

PIT_VERIFIED = "PIT_VERIFIED"
PIT_RECONSTRUCTED = "PIT_RECONSTRUCTED"
CURRENT_PROXY = "CURRENT_PROXY"
VALID_DATA_GRADES = frozenset({PIT_VERIFIED, PIT_RECONSTRUCTED, CURRENT_PROXY})

MIN_PRIOR_SESSIONS = 20
SURGE_RATIO_20 = 2.0
SURGE_DOLLAR_VOLUME = 50_000_000.0


@dataclass(frozen=True)
class PriceBar:
    session_date: date
    open: float
    high: float
    low: float
    close: float
    adj_close: float
    volume: float


def _finite(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def validate_price_bar(bar: PriceBar) -> tuple[str, ...]:
    reasons: list[str] = []
    prices = (bar.open, bar.high, bar.low, bar.close, bar.adj_close)
    if not all(_finite(value) and value > 0 for value in prices):
        reasons.append("NON_POSITIVE_OR_NON_FINITE_PRICE")
    if not _finite(bar.volume) or bar.volume < 0:
        reasons.append("NEGATIVE_OR_NON_FINITE_VOLUME")
    if all(_finite(value) for value in prices) and (bar.high < max(bar.open, bar.close, bar.low) or bar.low > min(bar.open, bar.close, bar.high)):
        reasons.append("INVALID_OHLC_RANGE")
    return tuple(reasons)


def adjusted_price(raw_price: float, close: float, adj_close: float) -> float:
    if not all(_finite(value) and value > 0 for value in (raw_price, close, adj_close)):
        raise ValueError("raw_price, close and adj_close must be finite and positive")
    return float(raw_price) * float(adj_close) / float(close)


def information_was_available(announced_at: datetime | None, decision_at: datetime) -> dict[str, Any]:
    if decision_at.tzinfo is None:
        raise ValueError("decision_at must include a timezone")
    if announced_at is None:
        return {"status": "INCOMPLETE", "known": False, "reasons": ["ANNOUNCEMENT_TIME_UNKNOWN"]}
    if announced_at.tzinfo is None:
        return {"status": "INCOMPLETE", "known": False, "reasons": ["ANNOUNCEMENT_TIMEZONE_UNKNOWN"]}
    return {"status": "COMPLETE", "known": announced_at <= decision_at, "reasons": []}


def classify_stock_signal(volume_change_percent: float, price_change_percent: float) -> str:
    """Strict boundaries are intentional and covered by regression fixtures."""
    if volume_change_percent > 3.0 and price_change_percent > 0.15:
        return "inflow"
    if volume_change_percent > 3.0 and price_change_percent < -0.15:
        return "outflow"
    if volume_change_percent < -3.0:
        return "attention-loss"
    return "neutral"


def classify_group_signal(share_delta_bp: float, price_change_percent: float, volume_change_percent: float) -> str:
    if share_delta_bp > 10.0 and price_change_percent >= 0.0:
        return "inflow"
    if share_delta_bp < -10.0 and price_change_percent < 0.0:
        return "outflow"
    if volume_change_percent < -15.0:
        return "attention-loss"
    return "neutral"


def volume_state(ratio_20: float | None) -> str:
    if ratio_20 is None or not _finite(ratio_20):
        return "unknown"
    if ratio_20 >= 2.0:
        return "very-strong"
    if ratio_20 >= 1.2:
        return "strong"
    if ratio_20 >= 0.8:
        return "normal"
    if ratio_20 >= 0.5:
        return "weak"
    return "very-weak"


def compute_stock_observation(today: PriceBar, prior_bars: Iterable[PriceBar]) -> dict[str, Any]:
    reasons = list(validate_price_bar(today))
    prior = sorted(prior_bars, key=lambda item: item.session_date)
    if len({bar.session_date for bar in prior}) != len(prior):
        reasons.append("DUPLICATE_SESSION_DATE")
    invalid_prior = [reason for bar in prior for reason in validate_price_bar(bar)]
    if invalid_prior:
        reasons.append("INVALID_PRIOR_BAR")
    if len(prior) < MIN_PRIOR_SESSIONS:
        reasons.append("INSUFFICIENT_PRIOR_SESSIONS")
    if prior and prior[-1].session_date >= today.session_date:
        reasons.append("NON_CAUSAL_HISTORY")
    if reasons:
        return {
            "status": "INCOMPLETE",
            "reasons": sorted(set(reasons)),
            "signal": None,
            "signal_rule_version": SIGNAL_RULE_VERSION,
        }

    baseline = prior[-MIN_PRIOR_SESSIONS:]
    dollar_volume = today.close * today.volume
    prior_dollar_volumes = [bar.close * bar.volume for bar in baseline]
    average_20 = sum(prior_dollar_volumes) / MIN_PRIOR_SESSIONS
    if average_20 <= 0:
        return {
            "status": "INCOMPLETE",
            "reasons": ["NON_POSITIVE_BASELINE"],
            "signal": None,
            "signal_rule_version": SIGNAL_RULE_VERSION,
        }
    previous = baseline[-1]
    price_change_percent = (today.adj_close / previous.adj_close - 1.0) * 100.0
    ratio_20 = dollar_volume / average_20
    volume_change_percent = (ratio_20 - 1.0) * 100.0
    return {
        "status": "COMPLETE",
        "reasons": [],
        "dollar_volume": dollar_volume,
        "average_dollar_volume_20": average_20,
        "ratio_20": ratio_20,
        "volume_change_percent": volume_change_percent,
        "price_change_percent": price_change_percent,
        "signal": classify_stock_signal(volume_change_percent, price_change_percent),
        "is_surge": ratio_20 >= SURGE_RATIO_20 and dollar_volume >= SURGE_DOLLAR_VOLUME,
        "signal_rule_version": SIGNAL_RULE_VERSION,
    }


def validate_snapshot_contract(snapshot: Mapping[str, Any]) -> tuple[str, ...]:
    reasons: list[str] = []
    if snapshot.get("schema_version") != 2:
        reasons.append("UNSUPPORTED_SCHEMA_VERSION")
    if snapshot.get("signal_rule_version") != SIGNAL_RULE_VERSION:
        reasons.append("SIGNAL_RULE_VERSION_MISMATCH")
    if snapshot.get("replay_rule_version") != REPLAY_RULE_VERSION:
        reasons.append("REPLAY_RULE_VERSION_MISMATCH")
    if snapshot.get("calendar_version") != CALENDAR_VERSION:
        reasons.append("CALENDAR_VERSION_MISMATCH")
    if snapshot.get("data_contract_version") != DATA_CONTRACT_VERSION:
        reasons.append("DATA_CONTRACT_VERSION_MISMATCH")
    if snapshot.get("data_grade") not in VALID_DATA_GRADES:
        reasons.append("INVALID_DATA_GRADE")
    for field in ("trading_date", "information_cutoff_at", "available_at", "content_hash"):
        if not snapshot.get(field):
            reasons.append(f"MISSING_{field.upper()}")
    parsed_times: dict[str, datetime] = {}
    for field in ("information_cutoff_at", "available_at"):
        raw = snapshot.get(field)
        if not raw:
            continue
        try:
            parsed = datetime.fromisoformat(str(raw))
        except ValueError:
            reasons.append(f"INVALID_{field.upper()}")
            continue
        if parsed.tzinfo is None:
            reasons.append(f"MISSING_TIMEZONE_{field.upper()}")
        else:
            parsed_times[field] = parsed
    if parsed_times.get("available_at") and parsed_times.get("information_cutoff_at") and parsed_times["available_at"] < parsed_times["information_cutoff_at"]:
        reasons.append("AVAILABLE_BEFORE_INFORMATION_CUTOFF")
    if snapshot.get("content_hash") and not re.fullmatch(r"sha256:[0-9a-f]{64}", str(snapshot["content_hash"])):
        reasons.append("INVALID_CONTENT_HASH")
    try:
        trading_date = date.fromisoformat(str(snapshot.get("trading_date")))
        if not is_trading_day(trading_date):
            reasons.append("INVALID_TRADING_DATE")
    except ValueError:
        reasons.append("INVALID_TRADING_DATE")
    market = snapshot.get("market")
    if not isinstance(market, Mapping) or not isinstance(market.get("market_regime"), str):
        reasons.append("INVALID_MARKET")
    groups = snapshot.get("groups")
    if not isinstance(groups, Mapping) or any(not isinstance(groups.get(name), Mapping) for name in ("sector", "industry", "market_cap")):
        reasons.append("INVALID_GROUPS")
    tickers = snapshot.get("tickers")
    if not isinstance(tickers, Mapping):
        reasons.append("INVALID_TICKERS")
    else:
        for ticker, row in tickers.items():
            if not ticker or not isinstance(row, Mapping):
                reasons.append("INVALID_TICKER_ROW")
                break
            required_text = ("name", "volume_state", "sector", "industry", "market_cap_group")
            required_nullable_numbers = ("dollar_volume_change_1d", "dollar_volume_ratio_5d", "dollar_volume_ratio_20d")
            if any(not isinstance(row.get(field), str) for field in required_text) or any(row.get(field) is not None and (not isinstance(row.get(field), (int, float)) or not math.isfinite(float(row[field]))) for field in required_nullable_numbers):
                reasons.append("INVALID_TICKER_ROW")
            if row.get("signal_status") == "COMPLETE" and row.get("signal") not in {"inflow", "outflow", "attention-loss", "neutral"}:
                reasons.append("INVALID_COMPLETE_SIGNAL")
                break
            if "INVALID_TICKER_ROW" in reasons:
                break
    return tuple(reasons)
