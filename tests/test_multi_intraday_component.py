from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "app/skills/business-chart-recall/scripts/multi_intraday.py"


def load_module():
    spec = importlib.util.spec_from_file_location("multi_intraday_test", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rows(day: str, base: float) -> list[dict]:
    return [
        {"time": f"{day}T09:30:00+08:00", "open": base, "high": base + 1, "low": base - 1,
         "close": base + 0.2, "volume": 1000},
        {"time": f"{day}T09:31:00+08:00", "open": base + 0.2, "high": base + 1.2, "low": base,
         "close": base + 0.6, "volume": 1200},
        {"time": f"{day}T09:32:00+08:00", "open": base + 0.6, "high": base + 1.3, "low": base + 0.1,
         "close": base + 0.4, "volume": 900},
    ]


def test_same_symbol_multiple_dates_render_as_one_horizontal_card_row(tmp_path: Path) -> None:
    module = load_module()
    payload = {
        "type": "multi-intraday",
        "title": "贵州茅台两日分时",
        "props": {"symbols": ["600519.SH"], "dates": ["2026-09-25", "2026-09-28"], "columns": 2},
        "cards": [
            {"symbol": "600519.SH", "name": "贵州茅台", "date": "2026-09-25", "data": rows("2026-09-25", 1450)},
            {"symbol": "600519.SH", "name": "贵州茅台", "date": "2026-09-28", "data": rows("2026-09-28", 1460)},
        ],
    }
    payload_path = tmp_path / "payload.json"
    output = tmp_path / "multi.html"
    summary = tmp_path / "summary.json"
    payload_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    assert module.main(["--payload", str(payload_path), "--output", str(output), "--payload-output", str(summary)]) == 0

    rendered = output.read_text(encoding="utf-8")
    assert rendered.count('class="intraday-card"') == 2
    assert "grid-auto-flow:column" in rendered
    assert "overflow-x:auto" in rendered
    assert "kline-canvas" in rendered
    assert "max-width:none!important" in rendered
    assert "2026-09-25" in rendered and "2026-09-28" in rendered
    metadata = json.loads(summary.read_text(encoding="utf-8"))
    assert metadata["mode"] == "same-symbol-multi-date"
    assert [card["barCount"] for card in metadata["cards"]] == [3, 3]


def test_multiple_symbols_one_date_render_as_parallel_cards(tmp_path: Path) -> None:
    module = load_module()
    payload = {
        "type": "multi-intraday",
        "props": {"symbols": ["600519.SH", "000001.SZ"], "dates": ["2026-09-28"]},
        "cards": [
            {"symbol": "600519.SH", "name": "贵州茅台", "date": "2026-09-28", "data": rows("2026-09-28", 1460)},
            {"symbol": "000001.SZ", "name": "平安银行", "date": "2026-09-28", "data": rows("2026-09-28", 12)},
        ],
    }
    config = module._validate_payload(payload)
    cards = module.build_cards(config)
    rendered = module.render_document("多股同日分时", cards, config)

    assert len(cards) == 2
    assert {card["symbol"] for card in cards} == {"600519.SH", "000001.SZ"}
    assert rendered.count('class="intraday-card"') == 2


def test_multiple_symbols_and_multiple_dates_are_rejected() -> None:
    module = load_module()
    payload = {"props": {"symbols": ["AAPL", "MSFT"], "dates": ["2026-09-25", "2026-09-28"]}}

    try:
        module._validate_payload(payload)
    except ValueError as exc:
        assert "多股票场景只接受一个统一日期" in str(exc)
    else:
        raise AssertionError("ambiguous cross-product input should be rejected")


def test_registry_exposes_multi_intraday_component() -> None:
    registry = json.loads((ROOT / "app/module_registry.json").read_text(encoding="utf-8"))
    entry = next(item for item in registry if item.get("script") == "multi_intraday.py")
    assert entry["label"] == "美股多股分时卡片组"


def test_us_market_timezone_is_the_default() -> None:
    module = load_module()
    config = module._validate_payload({"props": {"symbols": ["AAPL", "MSFT"]}})
    assert config["timezone"] == "America/New_York"


def test_payload_cli_locale_and_theme_override_and_native_switching(tmp_path):
    module = load_module()
    payload = {"type": "multi-intraday", "props": {"symbols": ["AAPL"], "language": "zh", "theme": "light"}, "cards": [{"symbol": "AAPL", "name": "AAPL", "date": "2026-09-28", "data": rows("2026-09-28", 100)}]}
    source = tmp_path / "source.json"
    output = tmp_path / "rendered.html"
    source.write_text(json.dumps(payload))
    assert module.main(["--payload", str(source), "--language", "en", "--theme", "dark", "--output", str(output)]) == 0
    document = output.read_text()
    assert 'lang="en" data-theme="dark"' in document
    assert 'Intraday Comparison' in document
    assert 'intraday chart' in document
    assert 'syncChildTheme' in document
    assert '--intraday-text' in document
