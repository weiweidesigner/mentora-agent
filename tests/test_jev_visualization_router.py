from __future__ import annotations

from types import SimpleNamespace
from pathlib import Path

import pytest

from app import main
from app.jev_visualization_router import (
    JevVisualizationDecision,
    JevVisualizationRouter,
    JevVisualizationRouterError,
)


class FakeClient:
    primary_choice = "visual-2"
    primary_confidence = 0.91
    supporting_choice = "visual-3"
    supporting_confidence = 0.72
    semantic_lens = "composition-and-drivers"
    semantic_lens_confidence = 0.84
    visual_encoding = "composition-and-contribution"
    visual_encoding_confidence = 0.87
    evidence_strategy = "us-business-plus-internal-video"
    evidence_strategy_confidence = 0.81
    mark_strategy = "contribution-focus"
    mark_strategy_confidence = 0.79
    captured_state = None

    def __init__(self, **kwargs: object) -> None:
        self.kwargs = kwargs

    def __enter__(self) -> "FakeClient":
        return self

    def __exit__(self, *args: object) -> None:
        pass

    def system_one(self, *, state: object, questions: object) -> object:
        type(self).captured_state = state
        return SimpleNamespace(
            model="jev-1.13.0",
            answers={
                "primary_visual": SimpleNamespace(
                    choice=self.primary_choice,
                    confidence=self.primary_confidence,
                ),
                "supporting_visual": SimpleNamespace(
                    choice=self.supporting_choice,
                    confidence=self.supporting_confidence,
                ),
                "semantic_lens": SimpleNamespace(
                    choice=self.semantic_lens,
                    confidence=self.semantic_lens_confidence,
                ),
                "visual_encoding": SimpleNamespace(
                    choice=self.visual_encoding,
                    confidence=self.visual_encoding_confidence,
                ),
                "evidence_strategy": SimpleNamespace(
                    choice=self.evidence_strategy,
                    confidence=self.evidence_strategy_confidence,
                ),
                "mark_strategy": SimpleNamespace(
                    choice=self.mark_strategy,
                    confidence=self.mark_strategy_confidence,
                ),
            },
        )


VISUAL_CANDIDATES = [
    {"script": "line_chart.py", "family": "generic-chart", "label": "Line", "description": "Single trend"},
    {"script": "income_statement.py", "family": "business-chart", "label": "Income", "description": "Revenue and profit"},
    {"script": "revenue_sources.py", "family": "business-chart", "label": "Revenue sources", "description": "Business mix"},
]


def test_jev_visualization_router_selects_primary_and_distinct_support() -> None:
    router = JevVisualizationRouter(api_key="test-key", client_factory=FakeClient)
    decision = router.route(question="分析收入、利润和业务收入构成", candidates=VISUAL_CANDIDATES)

    assert decision.selected_scripts == ("income_statement.py", "revenue_sources.py")
    assert decision.primary_confidence == 0.91
    assert decision.supporting_confidence == 0.72
    assert decision.provider_model == "jev-1.13.0"
    assert decision.candidate_count == 3
    assert decision.semantic_lens == "composition-and-drivers"
    assert decision.visual_encoding == "composition-and-contribution"
    assert decision.evidence_strategy == "us-business-plus-internal-video"
    assert decision.mark_strategy == "contribution-focus"
    assert decision.primary_purpose == "Revenue and profit"
    assert decision.supporting_purpose == "Business mix"
    assert len(FakeClient.captured_state["available_visualizations"]) == 3


def test_jev_visualization_router_omits_low_confidence_support() -> None:
    class LowSupportClient(FakeClient):
        supporting_confidence = 0.2

    router = JevVisualizationRouter(api_key="test-key", client_factory=LowSupportClient)
    decision = router.route(question="只看利润趋势", candidates=VISUAL_CANDIDATES)

    assert decision.selected_scripts == ("income_statement.py",)
    assert decision.supporting_script is None


def test_jev_visualization_router_does_not_force_a_chart() -> None:
    class NoVisualClient(FakeClient):
        primary_choice = "no-visual"
        primary_confidence = 0.89

    router = JevVisualizationRouter(api_key="test-key", client_factory=NoVisualClient)
    decision = router.route(question="账户操作是否成功", candidates=VISUAL_CANDIDATES)

    assert decision.selected_scripts == ()
    assert decision.primary_script is None
    assert decision.supporting_script is None


def test_generic_visual_normalizes_business_only_evidence_strategy() -> None:
    class GenericClient(FakeClient):
        primary_choice = "visual-1"
        supporting_choice = "no-visual"
        evidence_strategy = "us-business-native"

    router = JevVisualizationRouter(api_key="test-key", client_factory=GenericClient)
    decision = router.route(question="比较三只 ETF 的累计收益", candidates=VISUAL_CANDIDATES)

    assert decision.primary_script == "line_chart.py"
    assert decision.evidence_strategy == "structured-data-first"


def test_jev_visualization_router_falls_back_on_low_primary_confidence() -> None:
    class LowPrimaryClient(FakeClient):
        primary_confidence = 0.2

    router = JevVisualizationRouter(api_key="test-key", client_factory=LowPrimaryClient)
    with pytest.raises(JevVisualizationRouterError, match="主可视化置信度"):
        router.route(question="画图", candidates=VISUAL_CANDIDATES)


def test_signed_bar_semantics_upgrade_no_mark_and_compile_color_rules() -> None:
    class SignedBarRouter:
        configured = True

        def route(self, *, question: str, candidates: list[dict[str, str]]) -> JevVisualizationDecision:
            return JevVisualizationDecision(
                selected_scripts=("bar_chart.py",),
                primary_script="bar_chart.py",
                supporting_script=None,
                primary_confidence=0.9,
                supporting_confidence=0.0,
                provider_model="jev-test",
                candidate_count=len(candidates),
                mark_strategy="no-mark",
                mark_strategy_confidence=0.62,
            )

    modules = [
        {"script": "bar_chart.py", "label": "Bar", "description": "Bar chart"},
        {"script": "line_chart.py", "label": "Line", "description": "Line chart"},
    ]
    _, metadata = main.scope_visualization_modules_with_jev(
        "用柱状图展示每日涨跌幅",
        modules,
        router=SignedBarRouter(),
    )

    assert metadata is not None
    assert metadata["markStrategy"] == "signed-direction"
    assert metadata["markStrategySource"] == "signed-bar-semantic-backstop"

    route = {"steps": [{"script": "bar_chart.py", "cli_args": []}], "reason": "展示涨跌"}
    enhanced = main.apply_jev_mark_strategy_to_route(route, metadata)
    args = enhanced["steps"][0]["cli_args"]
    style = __import__("json").loads(args[args.index("--style-json") + 1])

    assert style["markStrategy"] == "signed-direction"
    assert style["colorRules"][0]["color"] == "var(--sv-price-up)"
    assert style["colorRules"][1]["color"] == "var(--sv-price-down)"


def test_signed_distribution_semantics_take_precedence_over_signed_bar_height() -> None:
    class DistributionRouter:
        configured = True

        def route(self, *, question: str, candidates: list[dict[str, str]]) -> JevVisualizationDecision:
            return JevVisualizationDecision(
                selected_scripts=("bar_chart.py",),
                primary_script="bar_chart.py",
                supporting_script=None,
                primary_confidence=0.9,
                supporting_confidence=0.0,
                provider_model="jev-test",
                candidate_count=len(candidates),
                mark_strategy="signed-direction",
                mark_strategy_confidence=0.7,
            )

    modules = [
        {"script": "bar_chart.py", "label": "Bar", "description": "Bar chart"},
        {"script": "line_chart.py", "label": "Line", "description": "Line chart"},
    ]
    _, metadata = main.scope_visualization_modules_with_jev(
        "用柱状图展示每日收益率分布和频次",
        modules,
        router=DistributionRouter(),
    )

    assert metadata is not None
    assert metadata["markStrategy"] == "distribution-polarity"
    assert metadata["markStrategySource"] == "signed-distribution-semantic-backstop"

    route = {"steps": [{"script": "bar_chart.py", "cli_args": []}], "reason": "展示分布"}
    enhanced = main.apply_jev_mark_strategy_to_route(route, metadata)
    args = enhanced["steps"][0]["cli_args"]
    style = __import__("json").loads(args[args.index("--style-json") + 1])

    assert style["markStrategy"] == "distribution-polarity"
    assert style["distributionColor"]["source"] == "x"
    assert style["distributionColor"]["negative"] == "var(--sv-price-down)"
    assert style["distributionColor"]["positive"] == "var(--sv-price-up)"
    assert "showZeroReference" not in style["distributionColor"]
    assert "colorRules" not in style


def test_route_semantic_backstop_injects_distribution_style_without_jev_metadata() -> None:
    route = {
        "steps": [
            {
                "script": "code_interpreter.py",
                "cli_args": ["--question", "生成个股涨跌幅分布", "--chart-type", "bar"],
            },
            {"script": "bar_chart.py", "cli_args": []},
        ],
        "reason": "先统计区间频次，再渲染柱状图",
    }

    enhanced = main.apply_jev_mark_strategy_to_route(
        route,
        None,
        "复盘全市场涨跌幅分布",
    )
    assert enhanced["steps"][0]["cli_args"] == route["steps"][0]["cli_args"]
    args = enhanced["steps"][1]["cli_args"]
    style = __import__("json").loads(args[args.index("--style-json") + 1])
    assert style["markStrategy"] == "distribution-polarity"
    assert style["distributionColor"]["source"] == "x"
    assert enhanced["_jev_mark_strategy_source"] == "route-semantic-backstop"


def test_grouped_distribution_route_preserves_series_colors() -> None:
    route = {
        "steps": [{"script": "grouped_bar.py", "cli_args": []}],
        "reason": "比较节前与节后一周的涨跌幅分布和频次",
    }

    enhanced = main.apply_jev_mark_strategy_to_route(route, None, "国庆前后一周涨跌幅分布")
    args = enhanced["steps"][0]["cli_args"]
    style = __import__("json").loads(args[args.index("--style-json") + 1])

    assert style["markStrategy"] == "distribution-polarity"
    assert "showZeroReference" not in style["distributionColor"]
    assert style["distributionColor"]["preserveSeriesColors"] is True
    assert "colorRules" not in style


def test_visualization_scope_preserves_data_tools_and_filters_renderers() -> None:
    class FakeRouter:
        configured = True

        def route(self, *, question: str, candidates: list[dict[str, str]]) -> JevVisualizationDecision:
            assert question == "比较营收趋势和业务构成"
            assert {item["script"] for item in candidates} == {
                "line_chart.py",
                "income_statement.py",
                "revenue_sources.py",
            }
            return JevVisualizationDecision(
                selected_scripts=("income_statement.py", "revenue_sources.py"),
                primary_script="income_statement.py",
                supporting_script="revenue_sources.py",
                primary_confidence=0.94,
                supporting_confidence=0.78,
                provider_model="jev-1.13.0",
                candidate_count=3,
            )

    modules = [
        {"script": "external_info_search.py", "label": "External Search", "description": "data"},
        {"script": "line_chart.py", "label": "Line", "description": "trend"},
        {"script": "income_statement.py", "label": "Income", "description": "profit"},
        {"script": "revenue_sources.py", "label": "Sources", "description": "mix"},
    ]
    scoped, metadata = main.scope_visualization_modules_with_jev(
        "比较营收趋势和业务构成",
        modules,
        router=FakeRouter(),
    )

    assert [item["script"] for item in scoped] == [
        "external_info_search.py",
        "income_statement.py",
        "revenue_sources.py",
    ]
    assert metadata["selectedScripts"] == ["income_statement.py", "revenue_sources.py"]
    assert main.jev_visual_semantics_prompt(metadata).startswith("Laya 可视化语义计划")
    assert "主图 income_statement.py" in main.jev_visual_semantics_prompt(metadata)
    assert "辅助图 revenue_sources.py" in main.jev_visual_semantics_prompt(metadata)
    assert "标记策略" in main.jev_visual_semantics_prompt(metadata)
    assert "禁止猜测" in main.jev_visual_semantics_prompt(metadata)


def test_visualization_scope_keeps_existing_modules_when_jev_fails() -> None:
    class FailingRouter:
        configured = True

        def route(self, **kwargs: object) -> JevVisualizationDecision:
            raise JevVisualizationRouterError("temporary failure")

    modules = [
        {"script": "line_chart.py", "label": "Line", "description": "trend"},
        {"script": "income_statement.py", "label": "Income", "description": "profit"},
    ]
    scoped, metadata = main.scope_visualization_modules_with_jev("画图", modules, router=FailingRouter())

    assert scoped == modules
    assert metadata["applied"] is False
    assert metadata["fallback"] == "model"


def test_intraday_grid_density_reaches_both_agent_planners():
    from app.reasoning_frameworks import LocalAgentFrameworks
    decision = JevVisualizationDecision(selected_scripts=("multi_intraday.py",), primary_script="multi_intraday.py", supporting_script=None, primary_confidence=.9, supporting_confidence=0, provider_model="test", candidate_count=1, mobile_columns=4)
    guidance = LocalAgentFrameworks._visualization_guidance(decision)
    assert "--mobile-columns 4" in guidance
    metadata = LocalAgentFrameworks._visualization_route_metadata(decision)
    assert metadata["mobileColumns"] == 4
    assert "--mobile-columns 4" in main.jev_visual_semantics_prompt(metadata)


def test_multi_kline_is_discoverable_and_keeps_reasoning_driven_placement():
    from app.reasoning_frameworks import LocalAgentFrameworks
    root = Path(__file__).resolve().parents[1]
    client = LocalAgentFrameworks(project_root=root, generated_dir=root / 'outputs/generated')
    candidates = client._visualization_candidates()
    candidate = next(c for c in candidates if c['script'] == 'multi_kline.py')
    assert candidate['family'] == 'business-chart'
    assert JevVisualizationRouter._explicit_requested_script('多K线图对比', candidates) == 'multi_kline.py'
    decision = JevVisualizationDecision(selected_scripts=('multi_kline.py',), primary_script='multi_kline.py', supporting_script=None, primary_confidence=.9, supporting_confidence=0, provider_model='test', candidate_count=1, mobile_columns=1)
    guidance = client._visualization_guidance(decision)
    assert '--mobile-columns 1' in guidance
    assert '未在正文引用的图表不会自动展示' in guidance
    assert '--mobile-columns 1' in main.jev_visual_semantics_prompt(client._visualization_route_metadata(decision))
