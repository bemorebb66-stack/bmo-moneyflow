import csv
import json
import tempfile
import unittest
from pathlib import Path

import pandas as pd

from scripts.build_replay_snapshot import build_snapshot, write_snapshot
from scripts.backfill_replay_snapshots import build_historical_snapshots
from scripts.replay_analyzer import analyze, combine_completed_trades, parse_executions


class ReplayTests(unittest.TestCase):
    def test_backfill_builds_requested_dates_with_rolling_context(self):
        dates = pd.to_datetime(["2026-07-14", "2026-07-15", "2026-07-16", "2026-07-17"])
        history = {
            "NVDA": pd.DataFrame(
                {"Close": [100, 102, 101, 105], "Volume": [10, 20, 15, 30]},
                index=dates,
            )
        }
        source = {
            "market_date": "2026-07-17",
            "stocks": [{"t": "NVDA", "n": "NVIDIA", "sec": "Technology", "ind": "Semiconductors", "cap": "Mega", "mc": 1000, "uni": ["S&P 500"]}],
        }
        snapshots, skipped = build_historical_snapshots(source, history, 2)
        self.assertFalse(skipped)
        self.assertEqual([row["trading_date"] for row in snapshots], ["2026-07-16", "2026-07-17"])
        self.assertEqual(snapshots[-1]["tickers"]["NVDA"]["dollar_volume"], 3150)
        self.assertAlmostEqual(snapshots[-1]["tickers"]["NVDA"]["dollar_volume_ratio_5d"], 1.6353)
        self.assertEqual(snapshots[-1]["backfill"]["classification_mode"], "current-proxy")

    def test_backfill_preserves_etf_metadata(self):
        dates = pd.to_datetime(["2026-07-16", "2026-07-17"])
        history = {"SOXL": pd.DataFrame({"Close": [40, 42], "Volume": [100, 200]}, index=dates)}
        source = {"market_date": "2026-07-17", "stocks": [{"t": "SOXL", "n": "SOXL", "asset_type": "LEVERAGED_ETF", "leverage_multiple": 3, "direction": "LONG", "underlying_type": "SECTOR", "underlying_industry": "Semiconductors", "theme": "반도체", "provider": "Direxion"}]}
        snapshots, _ = build_historical_snapshots(source, history, 1)
        etf = snapshots[0]["tickers"]["SOXL"]
        self.assertEqual(etf["asset_type"], "LEVERAGED_ETF")
        self.assertEqual(etf["leverage_multiple"], 3)
        self.assertEqual(etf["underlying_industry"], "Semiconductors")

    def test_snapshot_is_idempotent(self):
        data = {"market_date": "2026-07-17", "updated": "2026-07-18 06:00 UTC", "indices": [], "stocks": [{"t": "NVDA", "n": "NVIDIA", "c": 170, "pc": 2, "dv": 200, "dvp": 100, "a5": 125, "a20": 100, "sec": "Technology", "ind": "Semiconductors", "cap": "메가캡", "mc": 1000, "uni": ["S&P 500"]}]}
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            snapshot = build_snapshot(data)
            first = write_snapshot(snapshot, output)
            first_log_count = len((output / "logs" / "ingestion.jsonl").read_text(encoding="utf-8").splitlines())
            second = write_snapshot(snapshot, output)
            self.assertEqual(first, second)
            manifest = json.loads((output / "manifest.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["snapshot_count"], 1)
            self.assertEqual(len((output / "logs" / "ingestion.jsonl").read_text(encoding="utf-8").splitlines()), first_log_count)
            self.assertEqual(snapshot["tickers"]["NVDA"]["volume_state"], "매우 강함")

    def test_average_cost_completed_trade(self):
        with tempfile.TemporaryDirectory() as temp:
            csv_path = Path(temp) / "trades.csv"
            with csv_path.open("w", encoding="utf-8", newline="") as handle:
                writer = csv.writer(handle)
                writer.writerow(["ticker", "transaction_date", "transaction_type", "quantity", "price", "fee", "currency"])
                writer.writerow(["NVDA", "2026-07-01", "매수", 5, 100, 0, "USD"])
                writer.writerow(["NVDA", "2026-07-03", "매수", 5, 120, 0, "USD"])
                writer.writerow(["NVDA", "2026-07-10", "매도", 10, 121, 0, "USD"])
            trades, warnings = combine_completed_trades(parse_executions(csv_path))
            self.assertFalse(warnings)
            self.assertEqual(trades[0]["average_entry_price"], 110)
            self.assertEqual(trades[0]["return_percent"], 10)
            self.assertEqual(trades[0]["buy_count"], 2)

    def test_partial_sell_then_rebuy_keeps_realized_cost(self):
        with tempfile.TemporaryDirectory() as temp:
            csv_path = Path(temp) / "trades.csv"
            csv_path.write_text(
                "ticker,transaction_date,transaction_type,quantity,price,fee,currency\n"
                "NVDA,2026-07-01,매수,10,100,0,USD\n"
                "NVDA,2026-07-02,매도,5,120,0,USD\n"
                "NVDA,2026-07-03,매수,5,200,0,USD\n"
                "NVDA,2026-07-04,매도,10,180,0,USD\n",
                encoding="utf-8",
            )
            trades, _ = combine_completed_trades(parse_executions(csv_path))
            self.assertEqual(trades[0]["average_entry_price"], 133.3333)
            self.assertEqual(trades[0]["realized_profit"], 400)
            self.assertEqual(trades[0]["return_percent"], 20)

    def test_analysis_uses_previous_trading_day(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            snapshots = root / "replay_data" / "snapshots"
            snapshots.mkdir(parents=True)
            snapshot = {"trading_date": "2026-07-17", "tickers": {"NVDA": {"volume_state": "강함", "industry": "Semiconductors", "sector": "Technology", "market_cap_group": "메가캡"}}, "groups": {"industry": {"Semiconductors": {"flow_status": "유입"}}, "sector": {"Technology": {}}, "market_cap": {"메가캡": {}}}, "market": {"market_regime": "위험선호"}}
            (snapshots / "2026-07-17.json").write_text(json.dumps(snapshot), encoding="utf-8")
            csv_path = root / "trades.csv"
            csv_path.write_text("ticker,transaction_date,transaction_type,quantity,price,fee,currency\nNVDA,2026-07-18,매수,1,100,0,USD\nNVDA,2026-07-19,매도,1,110,0,USD\n", encoding="utf-8")
            result = analyze(csv_path, root / "replay_data")
            self.assertEqual(result["trades"][0]["context_status"], "직전 거래일 2026-07-17")


if __name__ == "__main__":
    unittest.main()
