from __future__ import annotations

import importlib.util
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT_ROOT / "app" / "skills" / "business-chart-recall" / "scripts" / "trade_flow.py"


def load_trade_flow_module():
    spec = importlib.util.spec_from_file_location("trade_flow_under_test", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_trade_flow_uses_timestamp_scaled_x_axis_and_time_ticks() -> None:
    module = load_trade_flow_module()
    script = module._render_js()

    assert "const xForTimestamp = ts =>" in script
    assert "(Number(ts) - startTs) / timeSpan" in script
    assert "const labelTimes=[startTs, startTs + timeSpan / 2, endTs]" in script
    assert "i/Math.max(rows.length-1,1)*chartW" not in script


def test_trade_flow_uses_step_path_and_timestamp_hover_bands() -> None:
    module = load_trade_flow_module()
    script = module._render_js()

    assert "H${x(i).toFixed(2)}V${yF(next).toFixed(2)}" in script
    assert "xForTimestamp((Number(rows[index-1].timestamp)+Number(row.timestamp))/2)" in script
    assert "const targetTs = firstTs + ratio" in script
