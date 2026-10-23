"""Check active Harness instructions without initializing production services."""
import ast
from pathlib import Path
from types import SimpleNamespace


def test_harness_carries_market_and_never_hardcodes_direction_colors():
    root = Path(__file__).resolve().parents[1]
    source = ast.parse((root / "app/reasoning_frameworks.py").read_text())
    cls = next(node for node in source.body if isinstance(node, ast.ClassDef) and node.name == "LocalAgentFrameworks")
    method = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == "_visualization_guidance")
    method.decorator_list = []
    module = ast.fix_missing_locations(ast.Module(body=[method], type_ignores=[]))
    router = SimpleNamespace(**{key: {"evidence-led": "", "latest-vs-history": "", "structured-data-first": "", "no-mark": ""} for key in ("SEMANTIC_LENSES", "VISUAL_ENCODINGS", "EVIDENCE_STRATEGIES", "MARK_STRATEGIES")})
    namespace = {"JevVisualizationDecision": object, "JevVisualizationRouter": router, "Path": Path}
    exec(compile(module, "guidance", "exec"), namespace)
    for strategy in ("signed-direction", "distribution-polarity"):
        decision = SimpleNamespace(primary_script="bar_chart.py", supporting_script=None, selected_scripts=("bar_chart.py",), primary_purpose="", semantic_lens="evidence-led", visual_encoding="latest-vs-history", evidence_strategy="structured-data-first", mark_strategy=strategy)
        guidance = namespace["_visualization_guidance"](decision)
        assert "financialMarket" in guidance
        assert "A股=CN" in guidance and "港股=HK" in guidance and "美股=US" in guidance
        assert "var(--sv-price-up)" in guidance and "var(--sv-price-down)" in guidance
        assert "#00b899" not in guidance and "#ff2f57" not in guidance
        assert "必须通过 --style-json" not in guidance
