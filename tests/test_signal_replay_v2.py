import json
import math
import unittest
from datetime import date, datetime
from pathlib import Path

from scripts.market_calendar import first_session_after, is_trading_day, session_bounds
from scripts.replay_analyzer import CorporateAction, Execution, combine_completed_trades
from scripts.signal_engine import (
    CURRENT_PROXY,
    PriceBar,
    adjusted_price,
    classify_group_signal,
    classify_stock_signal,
    compute_stock_observation,
    information_was_available,
    validate_snapshot_contract,
    validate_price_bar,
)
from scripts.signal_performance import calculate_forward_outcome, delisting_outcome, excess_return, net_long_return, summarize_outcomes


FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures" / "replay_v2" / "regression.json").read_text(encoding="utf-8")
)


class SignalReplayV2Tests(unittest.TestCase):
    def test_signal_boundaries_match_shared_fixture(self):
        for row in FIXTURE["stock_signal_boundaries"]:
            self.assertEqual(
                classify_stock_signal(row["volume_change_percent"], row["price_change_percent"]),
                row["expected"],
            )
        for row in FIXTURE["group_signal_boundaries"]:
            self.assertEqual(
                classify_group_signal(row["share_delta_bp"], row["price_change_percent"], row["volume_change_percent"]),
                row["expected"],
            )

    def test_signal_uses_exactly_twenty_prior_sessions_and_rejects_future_rows(self):
        prior = [PriceBar(date(2026, 6, index + 1), 10, 10, 10, 10, 10, 100) for index in range(20)]
        today = PriceBar(date(2026, 7, 1), 10, 10, 10, 10, 10.2, 200)
        result = compute_stock_observation(today, prior)
        self.assertEqual(result["status"], "COMPLETE")
        self.assertEqual(result["average_dollar_volume_20"], 1000)
        self.assertEqual(result["ratio_20"], 2)

        incomplete = compute_stock_observation(today, prior[:19])
        self.assertEqual(incomplete["status"], "INCOMPLETE")
        self.assertIn("INSUFFICIENT_PRIOR_SESSIONS", incomplete["reasons"])

        future = compute_stock_observation(today, prior[:-1] + [PriceBar(date(2026, 7, 2), 10, 10, 10, 10, 10, 100)])
        self.assertIn("NON_CAUSAL_HISTORY", future["reasons"])

    def test_invalid_ohlcv_and_adjustment_factor(self):
        invalid = PriceBar(date(2026, 7, 1), 10, 9, 11, 10, 10, -1)
        self.assertIn("INVALID_OHLC_RANGE", validate_price_bar(invalid))
        self.assertIn("NEGATIVE_OR_NON_FINITE_VOLUME", validate_price_bar(invalid))
        self.assertEqual(adjusted_price(6, 6, 12), 12)
        with self.assertRaises(ValueError):
            adjusted_price(0, 6, 12)

    def test_holiday_boundary_selects_next_real_session(self):
        row = FIXTURE["holiday_entry"]
        available_at = datetime.fromisoformat(row["available_at"])
        self.assertFalse(is_trading_day(date.fromisoformat(row["holiday"])))
        self.assertFalse(is_trading_day(date(2026, 6, 19)))
        self.assertFalse(is_trading_day(date(2025, 1, 9)))
        self.assertTrue(is_trading_day(date(2027, 12, 31)))
        self.assertEqual(first_session_after(available_at).isoformat(), row["expected_entry_session"])
        _, thanksgiving_friday_close = session_bounds(date(2026, 11, 27))
        self.assertEqual(thanksgiving_friday_close.hour, 18)  # 13:00 ET = 18:00 UTC
        _, christmas_eve_close = session_bounds(date(2026, 12, 24))
        self.assertEqual(christmas_eve_close.hour, 18)
        self.assertFalse(information_was_available(None, available_at)["known"])
        self.assertEqual(information_was_available(datetime(2026, 7, 2), available_at)["reasons"], ["ANNOUNCEMENT_TIMEZONE_UNKNOWN"])

    def test_cost_and_benchmark_formula_match_fixture(self):
        row = FIXTURE["costed_return"]
        side_cost = (row["commission_bp_per_side"] + row["slippage_bp_per_side"]) / 10_000
        self.assertAlmostEqual(row["entry_adjusted_open"] * (1 + side_cost), row["expected_entry_execution_price"], places=12)
        self.assertAlmostEqual(row["exit_adjusted_close"] * (1 - side_cost), row["expected_exit_execution_price"], places=12)
        result = net_long_return(row["entry_adjusted_open"], row["exit_adjusted_close"], side_cost)
        self.assertAlmostEqual(result, row["expected_net_return"], places=12)
        self.assertAlmostEqual(excess_return(result, row["benchmark_return"]), row["expected_excess_return"], places=12)
        outcome = calculate_forward_outcome(
            available_at=datetime.fromisoformat(FIXTURE["holiday_entry"]["available_at"]),
            price_rows=[{"session_date": "2026-07-06", "open": 12, "close": 12.6, "adj_close": 12.6}],
            benchmark_rows=[{"session_date": "2026-07-06", "open": 100, "close": 101, "adj_close": 101}],
            horizon=1,
        )
        self.assertEqual(outcome["entry_session"], "2026-07-06")
        self.assertAlmostEqual(outcome["net_return"], row["expected_net_return"], places=12)

    def test_current_proxy_never_becomes_official_performance(self):
        outcomes = [{"status": "COMPLETE", "net_return": index / 1000} for index in range(30)]
        summary = summarize_outcomes(outcomes, expected_count=30, data_grade=CURRENT_PROXY)
        self.assertEqual(summary["status"], "UNAVAILABLE_DATA_GRADE")
        self.assertFalse(summary["is_confirmatory"])
        self.assertEqual(summary["sample_count"], 30)
        self.assertIsNotNone(summary["median"])

    def test_split_fixture_preserves_basis_and_adjusts_quantity(self):
        row = FIXTURE["split_trade"]
        executions = [
            Execution(item["ticker"], date.fromisoformat(item["date"]), item["side"], item["quantity"], item["price"], item["fee"])
            for item in row["executions"]
        ]
        actions = [
            CorporateAction(item["ticker"], date.fromisoformat(item["effective_date"]), item["action_type"], item["ratio"])
            for item in row["actions"]
        ]
        trades, warnings = combine_completed_trades(executions, actions)
        self.assertFalse(warnings)
        self.assertEqual(trades[0]["quantity"], 20)
        self.assertEqual(trades[0]["realized_profit"], row["expected_profit"])
        self.assertAlmostEqual(trades[0]["return_percent"], row["expected_return_percent"], places=2)

    def test_split_normalizes_quantities_sold_before_the_effective_date(self):
        executions = [
            Execution("FIX", date(2026, 7, 6), "buy", 10, 10, 0),
            Execution("FIX", date(2026, 7, 6), "sell", 5, 12, 0),
            Execution("FIX", date(2026, 7, 8), "sell", 10, 7, 0),
        ]
        actions = [CorporateAction("FIX", date(2026, 7, 7), "SPLIT", 2)]
        trades, warnings = combine_completed_trades(executions, actions)
        self.assertFalse(warnings)
        self.assertEqual(trades[0]["quantity"], 20)
        self.assertEqual(trades[0]["average_entry_price"], 5)
        self.assertEqual(trades[0]["average_exit_price"], 6.5)
        self.assertEqual(trades[0]["realized_profit"], 30)

    def test_missing_and_bad_performance_data_remains_incomplete(self):
        outcomes = [
            {"status": "COMPLETE", "net_return": 0.1},
            {"status": "INCOMPLETE", "reasons": ["DELISTING_VALUE_UNKNOWN"]},
            {"status": "INCOMPLETE", "reasons": ["MISSING_EXIT_PRICE"]},
        ]
        summary = summarize_outcomes(outcomes, expected_count=3, data_grade="PIT_VERIFIED")
        self.assertEqual(summary["status"], "INCOMPLETE")
        self.assertEqual(summary["excluded_reasons"]["DELISTING_VALUE_UNKNOWN"], 1)
        self.assertEqual(summary["sample_count"], 1)
        delisting = FIXTURE["delisting"]
        self.assertAlmostEqual(delisting_outcome(delisting["entry_price"], delisting["cash_value"])["net_return"], delisting["expected_return"], places=12)
        self.assertEqual(delisting_outcome(delisting["entry_price"], None)["reasons"], ["DELISTING_VALUE_UNKNOWN"])
        with self.assertRaises(ValueError):
            net_long_return(math.nan, 10)
        bad_session = calculate_forward_outcome(
            available_at=datetime.fromisoformat("2026-07-10T22:00:00+00:00"),
            price_rows=[{"session_date": "2026-07-11", "open": 10, "close": 10, "adj_close": 10}],
            benchmark_rows=[{"session_date": "2026-07-11", "open": 10, "close": 10, "adj_close": 10}],
            horizon=1,
        )
        self.assertEqual(bad_session["reasons"], ["NON_TRADING_SESSION_ROW"])

    def test_invalid_snapshot_timestamps_and_hash_are_rejected(self):
        invalid = {
            "schema_version": 2,
            "signal_rule_version": FIXTURE["contract"]["signal_rule_version"],
            "replay_rule_version": FIXTURE["contract"]["replay_rule_version"],
            "data_grade": "PIT_VERIFIED",
            "trading_date": "2026-07-02",
            "information_cutoff_at": "2026-07-02T20:00:00+00:00",
            "available_at": "2026-07-02T19:00:00",
            "content_hash": "not-a-hash",
            "tickers": {"FIX": {"signal_status": "COMPLETE", "signal": None}},
        }
        reasons = validate_snapshot_contract(invalid)
        self.assertIn("MISSING_TIMEZONE_AVAILABLE_AT", reasons)
        self.assertIn("INVALID_CONTENT_HASH", reasons)
        self.assertIn("INVALID_COMPLETE_SIGNAL", reasons)


if __name__ == "__main__":
    unittest.main()
