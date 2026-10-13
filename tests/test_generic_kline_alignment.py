import json
import subprocess
import sys
from pathlib import Path

import pytest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SKILLS_ROOT = Path.home() / ".codex" / "skills"
RENDERERS = [
    SKILLS_ROOT / "custom-chart-library" / "scripts" / "render_aime_chart.py",
    SKILLS_ROOT / "aime-chart-renderer" / "scripts" / "render_chart.py",
]


@pytest.mark.parametrize("renderer", RENDERERS)
def test_generic_kline_reuses_business_renderer_and_field_mapping(renderer: Path, tmp_path: Path) -> None:
    payload = {
        "chartName": "kline",
        "title": "通用数据 K 线",
        "symbol": "BTCUSDT",
        "market": "crypto",
        "period": {"span": 1, "type": "day"},
        "themeMode": "dark",
        "mainChart": {
            "fieldMapping": {
                "time": "trade_date",
                "open": "o",
                "high": "h",
                "low": "l",
                "close": "c",
                "volume": "v",
            },
            "ma": [5, 20, 60],
        },
        "subCharts": ["volume", "macd"],
        "data": [
            {"trade_date": "2026-09-14", "o": 100, "h": 112, "l": 98, "c": 108, "v": 1200},
            {"trade_date": "2026-09-15", "o": 108, "h": 116, "l": 105, "c": 114, "v": 1800},
        ],
    }
    payload_path = tmp_path / "payload.json"
    output_path = tmp_path / "chart.html"
    payload_path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")

    subprocess.run(
        [sys.executable, str(renderer), "--payload", str(payload_path), "--output", str(output_path)],
        cwd=PROJECT_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )

    html = output_path.read_text(encoding="utf-8")
    assert 'class="kline-component"' in html
    assert 'class="period-tabs"' in html
    assert 'id="kline-canvas"' in html
    assert 'data-period="1d"' in html
    assert '"close": 114.0' in html
    assert "klinecharts.min.js" not in html
