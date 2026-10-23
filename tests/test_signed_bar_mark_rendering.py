from __future__ import annotations

import importlib.util
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_script(name: str):
    path = ROOT / "app" / "skills" / "generic-chart" / "scripts" / name
    spec = importlib.util.spec_from_file_location(f"signed_{path.stem}", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SIGNED_STYLE = json.dumps(
    {
        "version": 1,
        "markStrategy": "signed-direction",
        "colorRules": [
            {"condition": ">0", "color": "#00b899"},
            {"condition": "<0", "color": "#ff2f57"},
            {"condition": "=0", "color": "#94a3b8"},
        ],
    }
)


def test_bar_chart_consumes_signed_color_rules_for_every_bar() -> None:
    module = load_script("bar_chart.py")
    component = {
        "type": "bar",
        "xField": "day",
        "series": [{"field": "returnPct", "label": "涨跌幅"}],
        "data": [
            {"day": "周一", "returnPct": 2.1},
            {"day": "周二", "returnPct": -1.4},
            {"day": "周三", "returnPct": 0},
        ],
    }

    normalized = module.normalize_xy_series(component, "bar", "柱状图", "bar", SIGNED_STYLE)

    assert [row["__markColors"]["returnPct"] for row in normalized["data"]] == [
        "#00b899",
        "#ff2f57",
        "#94a3b8",
    ]
    assert normalized["legend"]["visible"] is False


def test_single_bar_legend_can_be_explicitly_enabled() -> None:
    module = load_script("bar_chart.py")
    component = {
        "type": "bar",
        "xField": "bucket",
        "legend": {"visible": True},
        "series": [{"field": "share", "label": "交易日占比"}],
        "data": [{"bucket": "0%~1%", "share": 40}],
    }

    normalized = module.normalize_xy_series(component, "bar", "分布", "bar")

    assert normalized["legend"]["visible"] is True


def test_grouped_bar_hides_legend_when_only_one_series_survives_normalization() -> None:
    module = load_script("grouped_bar.py")
    component = {
        "type": "grouped-bar",
        "xField": "bucket",
        "series": [{"field": "share", "label": "交易日占比"}],
        "data": [{"bucket": "0%~1%", "share": 40}],
    }

    normalized = module.normalize_xy_series(component, "grouped-bar", "分布", "bar")

    assert normalized["legend"]["visible"] is False


def test_grouped_bar_consumes_field_scoped_signed_color_rules() -> None:
    module = load_script("grouped_bar.py")
    style = json.dumps(
        {
            "colorRules": [
                {"field": "change", "condition": ">0", "color": "#00b899"},
                {"field": "change", "condition": "<0", "color": "#ff2f57"},
            ]
        }
    )
    component = {
        "type": "grouped-bar",
        "xField": "asset",
        "series": [
            {"field": "change", "label": "涨跌幅"},
            {"field": "volume", "label": "成交量", "color": "#4387f5"},
        ],
        "data": [{"asset": "A", "change": -2.0, "volume": 10}],
    }

    normalized = module.normalize_xy_series(component, "grouped-bar", "分组柱状图", "bar", style)

    assert normalized["data"][0]["__markColors"] == {"change": "#ff2f57"}


def test_grouped_bar_preserves_series_colors_for_signed_values() -> None:
    module = load_script("grouped_bar.py")
    component = {
        "type": "grouped-bar",
        "title": "国庆前后各5个交易日表现",
        "xField": "year",
        "axis": {"label": "区间涨跌幅（%）"},
        "series": [
            {"field": "pre5Pct", "label": "节前5个交易日"},
            {"field": "post5Pct", "label": "节后5个交易日"},
        ],
        "data": [
            {"year": "2024年", "pre5Pct": 21.37, "post5Pct": -1.56},
            {"year": "2025年", "pre5Pct": 1.59, "post5Pct": 0.76},
        ],
    }

    normalized = module.normalize_xy_series(component, "grouped-bar", "分组柱状图", "bar")

    assert normalized["visualStyle"] == {}
    assert "__markColors" not in normalized["data"][0]
    assert [item["color"] for item in normalized["series"]] == ["#4387f5", "#4bc3d5"]


def test_signed_direction_auto_detection_respects_explicit_series_colors() -> None:
    module = load_script("grouped_bar.py")
    component = {
        "type": "grouped-bar",
        "xField": "year",
        "axis": {"label": "区间涨跌幅（%）"},
        "series": [
            {"field": "pre5Pct", "label": "节前", "color": "#123456"},
            {"field": "post5Pct", "label": "节后", "color": "#abcdef"},
        ],
        "data": [{"year": "2024年", "pre5Pct": 2.0, "post5Pct": -1.0}],
    }

    normalized = module.normalize_xy_series(component, "grouped-bar", "分组柱状图", "bar")

    assert normalized["visualStyle"] == {}
    assert "__markColors" not in normalized["data"][0]


def test_bar_line_renderer_applies_signed_rules_to_bar_and_tooltip() -> None:
    source = (ROOT / "app" / "skills" / "generic-chart" / "scripts" / "bar_line.py").read_text(encoding="utf-8")

    assert "function barMarkColor" in source
    assert "fill:barMarkColor(row, series, value)" in source
    assert "color:barMarkColor(row, series, value)" in source


def test_bar_chart_colors_signed_distribution_from_x_bins_not_positive_frequency() -> None:
    module = load_script("bar_chart.py")
    style = json.dumps(
        {
            "markStrategy": "distribution-polarity",
            "distributionColor": {
                "source": "x",
                "negative": "#ff2f57",
                "positive": "#00b899",
                "neutral": "#94a3b8",
            },
        }
    )
    component = {
        "type": "bar",
        "xField": "returnBin",
        "series": [{"field": "frequency", "label": "频次"}],
        "data": [
            {"returnBin": "<-3%", "frequency": 4},
            {"returnBin": "-3%~0%", "frequency": 12},
            {"returnBin": "-1%~1%", "frequency": 28},
            {"returnBin": "0%~3%", "frequency": 15},
            {"returnBin": ">3%", "frequency": 6},
        ],
    }

    normalized = module.normalize_xy_series(component, "bar", "涨跌分布", "bar", style)

    assert [row["__distributionSign"] for row in normalized["data"]] == [-1, -1, 0, 1, 1]
    assert [row["__markColors"]["frequency"] for row in normalized["data"]] == [
        "#ff2f57",
        "#ff2f57",
        "#94a3b8",
        "#00b899",
        "#00b899",
    ]
    html = module.render_svg_chart(normalized, "bar")
    assert "distribution-zero-line" not in html
    assert "distribution-zero-label" not in html


def test_grouped_bar_distribution_colors_all_series_by_same_x_bin() -> None:
    module = load_script("grouped_bar.py")
    style = json.dumps({"distributionColor": {"source": "x"}})
    component = {
        "type": "grouped-bar",
        "xField": "bin",
        "series": [
            {"field": "stockA", "label": "A"},
            {"field": "stockB", "label": "B"},
        ],
        "data": [
            {"bin": "-2%~-1%", "stockA": 5, "stockB": 7},
            {"bin": "0%", "stockA": 9, "stockB": 8},
            {"bin": "1%~2%", "stockA": 6, "stockB": 4},
        ],
    }

    normalized = module.normalize_xy_series(component, "grouped-bar", "分组分布", "bar", style)

    assert normalized["data"][0]["__markColors"] == {
        "stockA": "var(--sv-price-down)", "stockB": "var(--sv-price-down)"
    }
    assert normalized["data"][1]["__markColors"] == {"stockA": "#94a3b8", "stockB": "#94a3b8"}
    assert normalized["data"][2]["__markColors"] == {
        "stockA": "var(--sv-price-up)", "stockB": "var(--sv-price-up)"
    }


def test_grouped_bar_auto_distribution_preserves_series_colors_and_zero_boundary() -> None:
    module = load_script("grouped_bar.py")
    component = {
        "type": "grouped-bar",
        "title": "国庆前后一周涨跌幅分布",
        "xField": "bin",
        "series": [
            {"field": "preWeek", "label": "节前一周"},
            {"field": "postWeek", "label": "节后一周"},
        ],
        "data": [
            {"bin": "-4%~-2%", "preWeek": 5, "postWeek": 4},
            {"bin": "2%~4%", "preWeek": 6, "postWeek": 8},
        ],
    }

    normalized = module.normalize_xy_series(component, "grouped-bar", "分组分布", "bar")

    distribution = normalized["visualStyle"]["distributionColor"]
    assert distribution["preserveSeriesColors"] is True
    assert "showZeroReference" not in distribution
    assert [row["__distributionSign"] for row in normalized["data"]] == [-1, 1]
    assert all("__markColors" not in row for row in normalized["data"])
    assert [item["color"] for item in normalized["series"]] == ["#4387f5", "#4bc3d5"]


def test_bar_chart_auto_detects_chinese_signed_distribution_without_style_json() -> None:
    module = load_script("bar_chart.py")
    component = {
        "type": "bar",
        "title": "个股涨跌幅分布",
        "financialMarket": "CN",
        "xField": "bucket",
        "series": [{"field": "count", "label": "个股家数"}],
        "data": [
            {"bucket": "跌超7%", "count": 61},
            {"bucket": "跌1%~3%", "count": 1653},
            {"bucket": "平盘", "count": 101},
            {"bucket": "涨0%~1%", "count": 828},
            {"bucket": "涨超7%", "count": 133},
        ],
    }

    normalized = module.normalize_xy_series(component, "bar", "柱状图", "bar")

    assert normalized["visualStyle"]["markStrategy"] == "distribution-polarity"
    assert normalized["visualStyle"]["distributionColor"]["autoDetected"] is True
    assert [row["__distributionSign"] for row in normalized["data"]] == [-1, -1, 0, 1, 1]
    assert [row["__markColors"]["count"] for row in normalized["data"]] == [
        "var(--sv-price-down)",
        "var(--sv-price-down)",
        "#94a3b8",
        "var(--sv-price-up)",
        "var(--sv-price-up)",
    ]
    assert normalized["financialMarket"] == "CN"
    html = module.render_svg_chart(normalized, "bar")
    assert 'data-financial-market="CN"' in html
    assert ':root[data-financial-market="CN"]' in html


def test_bar_chart_us_distribution_uses_same_semantics_with_us_market_mapping() -> None:
    module = load_script("bar_chart.py")
    component = {
        "type": "bar",
        "title": "US stocks return distribution",
        "financialMarket": "US",
        "xField": "bucket",
        "series": [{"field": "count", "label": "stocks"}],
        "data": [
            {"bucket": "-2%~-1%", "count": 10},
            {"bucket": "1%~2%", "count": 8},
        ],
    }

    normalized = module.normalize_xy_series(component, "bar", "Bar chart", "bar")

    assert normalized["financialMarket"] == "US"
    assert normalized["data"][0]["__markColors"]["count"] == "var(--sv-price-down)"
    assert normalized["data"][1]["__markColors"]["count"] == "var(--sv-price-up)"
    html = module.render_svg_chart(normalized, "bar")
    assert 'data-financial-market="US"' in html
    assert ':root[data-financial-market="US"]' in html


def test_bar_chart_does_not_auto_mark_ordinary_positive_categories() -> None:
    module = load_script("bar_chart.py")
    component = {
        "type": "bar",
        "title": "季度收入",
        "xField": "quarter",
        "series": [{"field": "revenue", "label": "收入"}],
        "data": [
            {"quarter": "Q1", "revenue": 10},
            {"quarter": "Q2", "revenue": 12},
        ],
    }

    normalized = module.normalize_xy_series(component, "bar", "柱状图", "bar")

    assert "distributionColor" not in normalized["visualStyle"]
    assert all("__markColors" not in row for row in normalized["data"])
