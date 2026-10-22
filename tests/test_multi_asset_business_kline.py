from __future__ import annotations

import importlib.util
from pathlib import Path

import app.main as main


PROJECT_ROOT = Path(__file__).resolve().parents[1]
KLINE_SCRIPT = PROJECT_ROOT / "app" / "skills" / "business-chart-recall" / "scripts" / "kline.py"


def load_kline_module():
    spec = importlib.util.spec_from_file_location("aime_test_kline", KLINE_SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_multi_asset_skill_selection_keeps_business_kline() -> None:
    assert "business-chart-recall" in main.fallback_relevant_skill_names("分析 BTCUSDT 最近走势")
    assert "business-chart-recall" in main.fallback_relevant_skill_names("分析 SPY ETF 的K线")
    assert "business-chart-recall" in main.fallback_relevant_skill_names(
        "分析 AAPL260918C00200000 期权价格走势"
    )


def test_non_us_etf_keeps_business_skill_but_non_us_stock_does_not() -> None:
    skills = ["business-chart-recall", "internal-search", "video-search"]

    etf = main.enforce_skill_market_scope("分析 2800.HK ETF 的K线走势", skills)
    stock = main.enforce_skill_market_scope("分析 0700.HK 股票K线走势", skills)

    assert "business-chart-recall" in etf
    assert "internal-search" not in etf
    assert "video-search" not in etf
    assert "business-chart-recall" not in stock


def test_option_contract_is_extracted_and_accepted_by_business_kline() -> None:
    symbol = "AAPL260918C00200000"

    assert main.extract_stock_code(f"分析 {symbol} 期权K线") == symbol
    assert main.is_business_kline_symbol(symbol, f"分析 {symbol} 期权K线")


def test_multi_asset_policy_prefers_kline_and_removes_company_modules() -> None:
    route = {
        "steps": [
            {"script": "yahoo_data.py", "code": "BTCUSDT", "cli_args": ["--metric", "close"]},
            {"script": "valuation.py", "code": "BTCUSDT", "cli_args": []},
        ],
        "reason": "initial",
    }

    updated = main.apply_multi_asset_business_kline_policy("分析 BTCUSDT 最近走势", route)

    assert [step["script"] for step in updated["steps"]] == ["kline.py"]
    assert updated["steps"][0]["code"] == "BTCUSDT"
    assert updated["steps"][0]["cli_args"] == ["--period", "1d"]


def test_kline_does_not_restore_yahoo_when_etf_or_option_data_is_missing(monkeypatch) -> None:
    kline = load_kline_module()
    expected = [{"time": 1, "open": 1, "high": 2, "low": 1, "close": 2, "volume": 10}]
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(kline, "fetch_ainvest_rows", lambda *_args, **_kwargs: [])

    def fake_provider(provider, _props, symbol, _frequency, _limit, _timeout):
        calls.append((provider, symbol))
        return expected

    monkeypatch.setattr(kline, "fetch_provider_rows", fake_provider)

    for symbol in ("SPY", "AAPL260918C00200000"):
        rows, source = kline.fetch_rows({}, symbol, "1d", 100)
        assert rows == []
        assert source != "yahoo"
    assert calls == []


def test_default_candle_colors_follow_market_not_ui_language() -> None:
    kline = load_kline_module()
    for code, market, expected in [
        ('600519.SH', '', 'red_up_green_down'),
        ('000001.SZ', '', 'red_up_green_down'),
        ('0700.HK', '', 'red_up_green_down'),
        ('00700', 'HK', 'red_up_green_down'),
        ('NVDA', 'US', 'green_up_red_down'),
    ]:
        config = kline.build_config({'props': {'symbol': code, 'market': market, 'language': 'zh'}})
        assert config['candleColorMode'] == expected
    explicit = kline.build_config({'props': {'symbol': '0700.HK', 'candleColors': 'green_up_red_down'}})
    assert explicit['candleColorMode'] == 'green_up_red_down'
