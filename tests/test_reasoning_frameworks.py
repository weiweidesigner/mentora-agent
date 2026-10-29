from pathlib import Path
from types import SimpleNamespace
import json
import sys
import threading

import pytest

from app.reasoning_frameworks import LocalAgentFrameworks, ReasoningFrameworkError
from app.jev_visualization_router import JevVisualizationDecision


@pytest.fixture(autouse=True)
def legacy_exec_fixtures(monkeypatch):
    # These historical fixtures emulate exec JSONL. App-server has independent
    # protocol/streaming tests and is the production default.
    monkeypatch.setenv('AICHART_CODEX_TRANSPORT','exec')


def test_deepseek_native_web_tools_are_disabled_by_environment_patch() -> None:
    patch = (Path(__file__).parents[1] / "app" / "dsh_tool_environment.cordis.yml").read_text(encoding="utf-8")
    assert "- id: tool-web" in patch
    assert "search: false" in patch
    assert "fetch: false" in patch


def test_generated_html_tool_output_becomes_an_immediate_module(tmp_path: Path) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    artifact = generated / "live-chart.html"
    artifact.write_text("<html><body>live</body></html>", encoding="utf-8")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    output = json.dumps({
        "ok": True,
        "title": "实时图表",
        "output": str(artifact),
    }, ensure_ascii=False)

    assert client._html_modules_from_tool_output(output) == [{
        "htmlUrl": "/generated/live-chart.html",
        "label": "实时图表",
        "streamvizSource": "generated-html",
    }]


def test_generated_html_is_found_inside_nested_harness_result(tmp_path: Path) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    artifact = generated / "nested-chart.html"
    artifact.write_text("<html><body>nested</body></html>", encoding="utf-8")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    wrapped = {
        "message": {
            "content": [{"type": "text", "text": json.dumps({
                "ok": True,
                "title": "嵌套图表",
                "output": str(artifact),
            }, ensure_ascii=False)}]
        }
    }

    assert client._html_modules_from_tool_output(wrapped) == [{
        "htmlUrl": "/generated/nested-chart.html",
        "label": "嵌套图表",
        "streamvizSource": "generated-html",
    }]


def test_deepseek_does_not_attach_tool_html_when_final_marker_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    artifact = generated / "deepseek-auto-chart.html"
    artifact.write_text("<html><body>chart</body></html>", encoding="utf-8")
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "shared-dsh"))

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, _prompt, *, session_id, on_notification):
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/call", "data": {
                    "callId": "render-1", "name": "bash", "arguments": "{}"
                }},
            }))
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/result", "data": {
                    "message": {"source": {"callId": "render-1"}},
                    "result": json.dumps({
                        "ok": True,
                        "title": "自动挂载图表",
                        "output": str(artifact),
                    }, ensure_ascii=False),
                }},
            }))
            return SimpleNamespace(
                session_id=session_id,
                final_response="图表已经生成完成。",
                events=[],
                notifications=[],
            )

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream("deepseek", "生成 StreamViz 图表", [], session_key="auto-artifact"))

    module = next(data for name, data in events if name == "module")
    final = next(data for name, data in events if name == "final")
    assert module["htmlUrl"] == "/generated/deepseek-auto-chart.html"
    assert final["reportArtifacts"] == []
    assert final["interpretation"] == "图表已经生成完成。"


def test_deepseek_does_not_select_newest_html_without_a_narrative_reference(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    old_artifact = generated / "old-search.html"
    old_artifact.write_text("<html><body>old</body></html>", encoding="utf-8")
    final_artifact = generated / "deepseek-final-report.html"
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "shared-dsh"))

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, _prompt, *, session_id, on_notification):
            final_artifact.write_text("<html><body>final</body></html>", encoding="utf-8")
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/call", "data": {
                    "callId": "render-plain", "name": "bash", "arguments": "{}"
                }},
            }))
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/result", "data": {
                    "message": {"source": {"callId": "render-plain"}},
                    "result": "render complete\n-rw-r--r-- deepseek-final-report.html",
                }},
            }))
            return SimpleNamespace(
                session_id=session_id,
                final_response="报告已经生成。",
                events=[],
                notifications=[],
            )

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream("deepseek", "生成 StreamViz 报告", [], session_key="snapshot-artifact"))

    final = next(data for name, data in events if name == "final")
    assert final["reportArtifacts"] == []
    assert final["interpretation"] == "报告已经生成。"


def test_codex_run_timeout_defaults_to_twenty_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AICHART_CODEX_RUN_TIMEOUT_SECONDS", raising=False)
    assert LocalAgentFrameworks._codex_run_timeout_seconds() == 1200


def test_codex_run_timeout_can_be_overridden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AICHART_CODEX_RUN_TIMEOUT_SECONDS", "900")
    assert LocalAgentFrameworks._codex_run_timeout_seconds() == 900


def test_deepseek_timeout_defaults_to_twenty_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("AICHART_DEEPSEEK_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("AICHART_DEEPSEEK_RUN_TIMEOUT_SECONDS", raising=False)
    assert LocalAgentFrameworks._deepseek_timeout_seconds() == 1200
    assert LocalAgentFrameworks._deepseek_run_timeout_seconds() == 1200


def test_deepseek_timeout_can_be_overridden(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AICHART_DEEPSEEK_TIMEOUT_SECONDS", "900")
    monkeypatch.setenv("AICHART_DEEPSEEK_RUN_TIMEOUT_SECONDS", "1100")
    assert LocalAgentFrameworks._deepseek_timeout_seconds() == 900
    assert LocalAgentFrameworks._deepseek_run_timeout_seconds() == 1100


def test_artifact_payload_only_exposes_generated_html(tmp_path: Path) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    allowed = generated / "codex-chart.html"
    allowed.write_text("<html></html>", encoding="utf-8")
    outside = tmp_path / "secret.html"
    outside.write_text("secret", encoding="utf-8")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    payload = client._artifact_payload(
        "codex",
        "分析",
        f"结论\n[[AIME_CHART:{allowed}]]\n[[AIME_CHART:{outside}]]",
        "codex-run",
        "thread-id",
    )

    assert payload["reasoningFramework"] == "codex"
    assert payload["engineSessionId"] == "thread-id"
    assert payload["reportUrl"] == "/generated/codex-chart.html"
    assert payload["reportArtifacts"] == [{"path": str(allowed), "url": "/generated/codex-chart.html"}]
    assert f"[[AIME_CHART:{allowed}]]" in payload["interpretation"]
    assert str(outside) not in payload["interpretation"]


def test_artifact_payload_resolves_project_relative_generated_html(tmp_path: Path) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    chart = generated / "codex-relative.html"
    chart.write_text("<html><body>chart</body></html>", encoding="utf-8")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    payload = client._artifact_payload(
        "codex",
        "分析",
        "图表解读：[[AIME_CHART:outputs/generated/codex-relative.html]]",
        "run",
        "thread",
    )

    assert payload["reportArtifacts"] == [{"path": str(chart), "url": "/generated/codex-relative.html"}]
    assert payload["interpretation"] == f"图表解读：[[AIME_CHART:{chart}]]"


def test_artifact_payload_rejects_missing_chart_instead_of_showing_marker(tmp_path: Path) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    with pytest.raises(ReasoningFrameworkError, match="图表文件未成功生成"):
        client._artifact_payload(
            "codex",
            "分析",
            f"图表解读：[[AIME_CHART:{generated / 'missing.html'}]]",
            "run",
            "thread",
        )


def test_artifact_payload_records_and_hides_skill_marker(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    payload = client._artifact_payload(
        "codex", "分析", "结论\n\n[[AIME_SKILLS:yahoo-data,generic-chart]]", "run", "thread"
    )

    assert payload["selectedSkill"]["key"] == "yahoo-data,generic-chart"
    assert payload["interpretation"] == "结论"


def test_artifact_payload_extracts_markdown_sources_for_legacy_ui(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    payload = client._artifact_payload(
        "codex",
        "分析",
        "主要证据来自[澎湃新闻](https://www.thepaper.cn/newsDetail_forward_34043631)。\n"
        "公告见[巨潮资讯公告](http://static.cninfo.com.cn/finalpage/report.PDF)。",
        "run",
        "thread",
    )

    assert payload["interpretation"].startswith("主要证据来自澎湃新闻")
    assert [source["siteName"] for source in payload["sources"]] == ["澎湃新闻", "巨潮资讯"]
    assert payload["sources"][0]["title"] == "澎湃新闻"
    assert "主要证据" in payload["sources"][0]["summary"]


def test_artifact_payload_merges_tool_and_answer_sources_by_url(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    url = "https://example.com/story"

    payload = client._artifact_payload(
        "deepseek",
        "分析",
        f"结论见[Example]({url})。",
        "run",
        "session",
        [{"siteName": "Example News", "url": url, "title": "完整标题", "summary": "工具摘要", "iconUrl": ""}],
    )

    assert len(payload["sources"]) == 1
    assert payload["sources"][0]["siteName"] == "Example News"
    assert payload["sources"][0]["summary"] == "工具摘要"


def test_artifact_payload_removes_source_markdown_guidance_from_answer(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    payload = client._artifact_payload(
        "deepseek",
        "分析",
        "预订数据增长（来源：[观点网](https://example.com/a)、[财联社](https://example.com/b)）。",
        "run",
        "session",
    )

    assert payload["interpretation"] == "预订数据增长。"
    assert [source["title"] for source in payload["sources"]] == ["观点网", "财联社"]


def test_framework_prompt_uses_structured_sources_not_markdown_citations(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    prompt = client._prompt("codex", "分析", [], [])

    assert "[来源名称](https://原始页面地址)" not in prompt
    assert "结构化数据自动收集" in prompt
    assert "最终正文不要加入 Markdown 来源链接" in prompt


def test_framework_prompt_chooses_chart_scope_from_question(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    prompt = client._prompt("codex", "Help me screen best opportunity of the day.", [], [])

    assert "本次为默认轻量任务" not in prompt
    assert "最多考察 3 个标的" not in prompt
    assert "默认生成 1 个主图" not in prompt
    assert "按用户问题的实际范围选择" in prompt
    assert "不要仅因为问题涉及股票就固定选择业务图表" in prompt
    assert "Skill 优先、证据先行、图文协同" in prompt
    assert "不要为了“有图”而画图" in prompt
    assert "标题、单位、图例和标注使用用户语言" in prompt
    assert "代理数据、降级数据或不完整数据必须显式披露" in prompt
    assert "尝试另一个匹配来源并说明降级情况" in prompt
    assert "工具之间必须用文件路径传递数据" in prompt
    assert "普通文件组件通过绝对路径交付" in prompt
    assert "原生 visualize_show_widget" in prompt
    assert "禁止把大段数组" in prompt


def test_research_report_prompt_keeps_model_selected_skills_and_workflow(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    prompt = client._prompt(
        "deepseek",
        "分析历次中期选举对行情的影响，做显著性检验并写一个 HTML 报告",
        [],
        [],
    )

    assert "本轮是研究报告任务，宿主已预解析执行路径" not in prompt
    assert "--max-details 3" not in prompt
    assert "custom-html-widget" in prompt
    assert "按用户问题的实际范围选择" in prompt


def test_previous_report_artifact_is_exposed_for_incremental_followup(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    report = generated / "existing-report.html"
    report.write_text("<html><body>existing</body></html>", encoding="utf-8")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    prompt = client._prompt(
        "deepseek",
        "检查并修正上一版报告",
        [],
        [{"role": "assistant", "text": "报告已生成", "reportArtifacts": [{"path": str(report)}]}],
    )

    assert str(report) in prompt
    assert "直接读取并增量修改对应产物" in prompt
    assert "不要从头重做" in prompt


def test_jev_visual_plan_adds_semantic_chart_and_narrative_guidance(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    business_scripts = tmp_path / "app" / "skills" / "business-chart-recall" / "scripts"
    generic_scripts = tmp_path / "app" / "skills" / "generic-chart" / "scripts"
    business_scripts.mkdir(parents=True)
    generic_scripts.mkdir(parents=True)
    (business_scripts / "income_statement.py").write_text("", encoding="utf-8")
    (business_scripts / "revenue_sources.py").write_text("", encoding="utf-8")
    (generic_scripts / "line_chart.py").write_text("", encoding="utf-8")
    (tmp_path / "app" / "module_registry.json").write_text(
        """[
          {"script":"income_statement.py","label":"利润表","description":"营收与利润趋势"},
          {"script":"revenue_sources.py","label":"收入来源","description":"业务构成与驱动"},
          {"script":"line_chart.py","label":"折线图","description":"通用时间趋势"}
        ]""",
        encoding="utf-8",
    )

    class FakeVisualRouter:
        configured = True

        def route(self, *, question: str, candidates: list[dict[str, str]]) -> JevVisualizationDecision:
            assert question == "分析营收利润和业务构成"
            assert len(candidates) == 3
            return JevVisualizationDecision(
                selected_scripts=("income_statement.py", "revenue_sources.py"),
                primary_script="income_statement.py",
                supporting_script="revenue_sources.py",
                primary_confidence=0.92,
                supporting_confidence=0.77,
                provider_model="jev-test",
                candidate_count=3,
                semantic_lens="composition-and-drivers",
                semantic_lens_confidence=0.88,
                primary_purpose="营收与利润趋势",
                supporting_purpose="业务构成与驱动",
                visual_encoding="composition-and-contribution",
                visual_encoding_confidence=0.86,
                evidence_strategy="us-business-plus-internal-video",
                evidence_strategy_confidence=0.83,
                mark_strategy="contribution-focus",
                mark_strategy_confidence=0.8,
            )

    client = LocalAgentFrameworks(
        project_root=tmp_path,
        generated_dir=generated,
        visualization_router=FakeVisualRouter(),
    )
    guidance, metadata = client._jev_visualization_plan("分析营收利润和业务构成")
    prompt = client._prompt("codex", "分析营收利润和业务构成", [], [], guidance)

    assert metadata["selectedScripts"] == ["income_statement.py", "revenue_sources.py"]
    assert metadata["semanticLens"] == "composition-and-drivers"
    assert metadata["visualEncoding"] == "composition-and-contribution"
    assert metadata["evidenceStrategy"] == "us-business-plus-internal-video"
    assert metadata["markStrategy"] == "contribution-focus"
    assert "主图：income_statement.py" in prompt
    assert "辅助图：revenue_sources.py" in prompt
    assert "美股/美国上市标的优先保留业务图表" in prompt
    assert "端内新闻和视频" in prompt
    assert "每个 [[AIME_CHART:...]] 必须紧邻其对应解读段落" in prompt
    assert "图文一体的回答" in prompt
    assert "标记策略" in prompt


def test_local_jev_plan_preserves_grouped_series_color_semantics(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    scripts = tmp_path / "app" / "skills" / "generic-chart" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "grouped_bar.py").write_text("", encoding="utf-8")
    (scripts / "line_chart.py").write_text("", encoding="utf-8")
    (tmp_path / "app" / "module_registry.json").write_text(
        '[{"script":"grouped_bar.py","label":"分组柱状图","description":"比较"},'
        '{"script":"line_chart.py","label":"折线图","description":"趋势"}]',
        encoding="utf-8",
    )

    class FakeVisualRouter:
        configured = True

        def route(self, *, question: str, candidates: list[dict[str, str]]) -> JevVisualizationDecision:
            return JevVisualizationDecision(
                selected_scripts=("grouped_bar.py",),
                primary_script="grouped_bar.py",
                supporting_script=None,
                primary_confidence=0.9,
                supporting_confidence=0.0,
                provider_model="jev-test",
                candidate_count=len(candidates),
                mark_strategy="signed-direction",
                mark_strategy_confidence=0.6,
            )

    client = LocalAgentFrameworks(
        project_root=tmp_path,
        generated_dir=generated,
        visualization_router=FakeVisualRouter(),
    )
    guidance, metadata = client._jev_visualization_plan("比较历年节前节后涨跌幅")

    assert metadata is not None
    assert metadata["markStrategy"] == "no-mark"
    assert metadata["markStrategySource"] == "grouped-series-color-preservation"
    assert "visualStyle.markStrategy=signed-direction" not in guidance


def test_visual_route_metadata_is_attached_to_final_payload() -> None:
    events = iter([("status", {"message": "run"}), ("final", {"status": ["done"]})])
    route = {"applied": True, "selectedScripts": ["line_chart.py"]}

    result = list(LocalAgentFrameworks._with_visual_route_metadata(events, route))

    assert result[-1][1]["visualRoute"] == route
    assert result[-1][1]["status"][0] == "JEV 已应用可视化语义规划"


def test_visual_semantic_routing_only_blocks_explicit_visual_requests() -> None:
    assert LocalAgentFrameworks._requires_visual_semantic_routing("生成一份 HTML 报告") is False
    assert LocalAgentFrameworks._requires_visual_semantic_routing("画苹果的 K 线图") is True
    assert LocalAgentFrameworks._requires_visual_semantic_routing("生成市场仪表盘") is True
    assert LocalAgentFrameworks._requires_visual_semantic_routing("苹果现在能买吗") is False


def test_public_thought_summary_is_short_and_user_facing() -> None:
    assert LocalAgentFrameworks._public_thought_summary(
        "Reasoning: 正在核对节前节后的交易日口径。后续内部推导不应展示。"
    ) == "正在核对节前节后的交易日口径"

    event = LocalAgentFrameworks._codex_tool_event(
        {
            "id": "tool-1",
            "type": "command_execution",
            "command": ["pwd"],
            "title": "确认项目运行环境",
            "status": "completed",
        },
        1,
    )

    assert event["thoughtSummary"] == "确认项目运行环境"


def test_deepseek_tool_description_is_forwarded_as_thought_summary(tmp_path: Path) -> None:
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")

    assert client._jev_tool_thought_summary(
        "bash",
        {"command": "python3 tool.py", "description": "计算全市场涨跌分布"},
    ) == "计算全市场涨跌分布"


def test_skill_catalog_exposes_bridge_descriptions_without_routing(tmp_path: Path) -> None:
    bridge = tmp_path / ".agents" / "skills" / "sample-skill"
    bridge.mkdir(parents=True)
    (bridge / "SKILL.md").write_text(
        "---\nname: sample-skill\ndescription: Render a sample chart.\n---\n",
        encoding="utf-8",
    )
    scripts = tmp_path / "app" / "skills" / "sample-skill" / "scripts"
    scripts.mkdir(parents=True)
    (scripts / "example.py").write_text("", encoding="utf-8")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")

    assert client._skill_catalog() == "- sample-skill: Render a sample chart. | scripts: example.py"
    assert client._skill_catalog(include_scripts=False) == "- sample-skill: Render a sample chart."


def test_prompt_uses_bounded_capability_retrieval_instead_of_full_catalog(tmp_path: Path) -> None:
    root = Path(__file__).resolve().parents[1]
    client = LocalAgentFrameworks(project_root=root, generated_dir=tmp_path)

    prompt = client._prompt("deepseek", "Show NVDA 15 minute candlestick chart", [], [])

    assert "宿主轻量能力检索" in prompt
    assert "候选集，不是写死路由" in prompt
    assert "kline.py" in prompt
    assert "已安装 Skill 索引" not in prompt


@pytest.mark.parametrize(
    "question",
    [
        "请全面扫描全市场并给出完整报告",
        "请对所有股票做深度研究",
        "Run a comprehensive analysis of all stocks",
        "I need deep research with multi-source verification",
    ],
)
def test_framework_prompt_does_not_change_policy_for_expanded_scope(tmp_path: Path, question: str) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    prompt = client._prompt("codex", question, [], [])

    assert "本次为扩展任务" not in prompt
    assert "本次为默认轻量任务" not in prompt
    assert "按用户问题的实际范围选择" in prompt
    assert "默认优先选择 streamviz 作为“展示阶段” Skill" in prompt
    assert "不要为了比较候选而读取 generic-chart" in prompt
    assert "不能单独充当数据源、搜索或分析器" in prompt


def test_artifact_payload_filters_local_and_infrastructure_source_urls(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    payload = client._artifact_payload(
        "deepseek",
        "分析",
        "公告见[本地代理](http://127.0.0.1:8080/)，新闻见[证券时报](https://stcn.com/story)。",
        "run",
        "session",
        [
            {"siteName": "DeepSeek API", "url": "https://api.deepseek.com/v1", "title": "API", "summary": "", "iconUrl": ""},
            {"siteName": "搜狗搜索", "url": "https://www.sogou.com/web?query=test", "title": "搜索", "summary": "", "iconUrl": ""},
            {"siteName": "证券时报", "url": "https://stcn.com/story", "title": "报道", "summary": "摘要", "iconUrl": ""},
        ],
    )

    assert payload["interpretation"] == "公告见本地代理，新闻见证券时报。"
    assert [source["url"] for source in payload["sources"]] == ["https://stcn.com/story"]


def test_source_extraction_does_not_treat_tool_code_endpoints_as_evidence(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    sources = client._sources_from_value(
        "BASE_URL='https://api.moonshot.cn/v1'\n"
        "SEARCH='https://www.googleapis.com/customsearch/v1'\n"
        "证据：[澎湃](https://thepaper.cn/newsDetail_forward_1)"
    )

    assert [source["url"] for source in sources] == ["https://thepaper.cn/newsDetail_forward_1"]


def test_unknown_framework_is_rejected(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    with pytest.raises(ReasoningFrameworkError, match="不支持的推理框架"):
        list(client.stream("unknown", "hello", [], session_key="s1"))


def test_codex_tool_event_normalizes_command() -> None:
    event = LocalAgentFrameworks._codex_tool_event(
        {"type": "command_execution", "command": ["python", "chart.py"], "status": "completed"},
        2,
    )

    assert event["index"] == 2
    assert event["code"] == "CODEX"
    assert event["params"] == ["python chart.py"]
    assert event["thoughtSummary"] == ""


def test_codex_tool_event_does_not_synthesize_progress_from_commands() -> None:
    analyze = LocalAgentFrameworks._codex_tool_event(
        {"type": "command_execution", "command": "python3 app/skill_runner.py execute --script code_interpreter.py"},
        1,
    )
    report = LocalAgentFrameworks._codex_tool_event(
        {"type": "command_execution", "command": "python3 app/skill_runner.py execute --script render_streamviz.py"},
        2,
    )

    assert analyze["thoughtSummary"] == ""
    assert report["thoughtSummary"] == ""


def test_prompt_forbids_ad_hoc_network_probing(tmp_path: Path) -> None:
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / "generated")
    prompt = client._prompt("codex", "分析长期市场数据", [], [])

    assert "所有网络发现、网页读取和远程数据请求必须通过匹配的项目 Skill 执行" in prompt
    assert "禁止编写临时 Python/Node 网络脚本" in prompt
    assert "浏览器验证/CAPTCHA 页面" in prompt
    assert "dataHandoffs" in prompt
    assert "禁止再用 Python、cat、jq、sed 等重新展开完整文件" in prompt
    assert "证据即视为充分：立即进入报告生成或最终回答" in prompt


def test_codex_tool_event_compacts_network_failure_pages() -> None:
    blocked = LocalAgentFrameworks._codex_tool_event(
        {
            "type": "command_execution",
            "aggregated_output": (
                '200 text/html <!DOCTYPE html><noscript>This site requires JavaScript '
                'to verify your browser.</noscript>'
            ),
        },
        1,
    )
    missing = LocalAgentFrameworks._codex_tool_event(
        {
            "type": "command_execution",
            "aggregated_output": "^dji HTTPError HTTP Error 404: Not Found\n^spx HTTPError HTTP Error 404: Not Found",
        },
        2,
    )

    assert blocked["observation"] == "目标网站返回浏览器验证或反爬页面（可能是 HTTP 200），未获得可用数据。"
    assert missing["observation"] == "数据源返回 HTTP 404；共 2 个请求失败，未获得可用数据。"


def test_save_images_rejects_invalid_data(tmp_path: Path) -> None:
    generated = tmp_path / "generated"
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    paths = client._save_images(
        "codex",
        "../../unsafe",
        [SimpleNamespace(dataUrl="not-a-data-url", name="bad.png")],
    )

    assert paths == []


def test_codex_adapter_normalizes_jsonl_stream(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    fake_codex = tmp_path / "fake-codex"
    fake_codex.write_text(
        "#!/bin/sh\n"
        "cat >/dev/null\n"
        "printf '%s\\n' "
        "'{\"type\":\"thread.started\",\"thread_id\":\"thread-123\"}' "
        "'{\"type\":\"item.completed\",\"item\":{\"type\":\"command_execution\",\"command\":[\"echo\",\"ok\"],\"status\":\"completed\"}}' "
        "'{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"I will load the relevant skills.\"}}' "
        "'{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"channel\":\"commentary\",\"text\":\"正在检查图表设置\"}}' "
        "'{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"完成\"}}'\n",
        encoding="utf-8",
    )
    fake_codex.chmod(0o755)
    monkeypatch.setenv("AICHART_CODEX_BIN", str(fake_codex))
    monkeypatch.setenv("AICHART_CODEX_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "test-deepseek-key")
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream("codex", "测试", [], session_key="client-1"))

    names = [name for name, _data in events]
    final = next(data for name, data in events if name == "final")
    assert names == ["status", "agent_event", "tool_step", "answer_text", "answer_text", "answer_text", "agent_event", "final"]
    assert not any(name == "progress" for name, data in events)
    assert final["engineSessionId"] == "thread-123"
    assert final["interpretation"] == "完成"
    assert [data["text"] for name, data in events if name == "answer_text"] == ["I will load the relevant skills.", "正在检查图表设置", "完成"]


def test_deepseek_sdk_streams_events_and_returns_real_session_id(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    dsh_home = tmp_path / "shared-dsh"
    monkeypatch.setenv("DSH_HOME", str(dsh_home))
    created_options: list[dict] = []

    class FakeHarness:
        def __init__(self, **options):
            created_options.append(options)

        def run(self, prompt, *, session_id, on_notification):
            assert prompt.startswith("用户请求：\n测试")
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/call", "data": {
                    "callId": "call-1", "name": "bash", "arguments": '{"command":"pwd"}',
                    "thoughtSummary": "正在确认项目运行环境"
                }},
            }))
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/result", "data": {
                    "message": {"source": {"callId": "call-1"}, "content": []}
                }},
            }))
            return SimpleNamespace(
                session_id=session_id,
                final_response="完成",
                events=[],
                notifications=[],
            )

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream(
        "deepseek", "测试", [], session_key="session-real", reasoning_effort="high",
    ))

    tool_steps = [data for name, data in events if name == "tool_step"]
    final = next(data for name, data in events if name == "final")
    assert [step["tool"] for step in tool_steps] == ["bash", "bash"]
    assert [step["phase"] for step in tool_steps] == ["started", "completed"]
    assert [step["callId"] for step in tool_steps] == ["call-1", "call-1"]
    assert [step["thoughtSummary"] for step in tool_steps] == ["正在确认项目运行环境", "正在确认项目运行环境"]
    assert tool_steps[1]["params"] == ['{"command":"pwd"}']
    assert final["engineSessionId"] == "session-real"
    assert created_options[0]["dsh_home"] == str(dsh_home)
    assert created_options[0]["runtime_cwd"] == str(dsh_home / "runtime")
    assert created_options[0]["reasoning_effort"] == "high"
    assert created_options[0]["max_tokens"] == 32768


def test_deepseek_write_events_hide_content_and_emit_created_file_metadata(tmp_path, monkeypatch):
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    target = tmp_path / "outputs" / "transform.py"

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, _prompt, *, session_id, on_notification):
            arguments = json.dumps({"content":"line one\nline two\n", "file_path":str(target)})
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId":session_id, "event":{"type":"tool/call", "data":{
                    "callId":"write-1", "name":"write", "arguments":arguments,
                }},
            }))
            target.write_text("line one\nline two\n", encoding="utf-8")
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId":session_id, "event":{"type":"tool/result", "data":{
                    "message":{"source":{"callId":"write-1"}, "content":[{"type":"text", "text":f"<path>{target}</path>\n<type>file</type>\n<content>\nCreated file\n</content>"}]},
                }},
            }))
            return SimpleNamespace(session_id=session_id, final_response="完成", events=[], notifications=[])

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "dsh"))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    events = list(client.stream("deepseek", "创建文件", [], session_key="write-session"))
    steps = [data for name, data in events if name == "tool_step"]

    assert len(steps) == 2
    assert 'content' not in steps[0]['params'][0]
    assert json.loads(steps[0]['params'][0]) == {'file_path':str(target)}
    assert steps[1]['fileChanges'][0] == {
        'path':str(target), 'relativePath':'outputs/transform.py', 'name':'transform.py',
        'kind':'created', 'added':2, 'removed':0,
        'diff':'--- transform.py\n+++ transform.py\n@@ -0,0 +1,2 @@\n+line one\n+line two',
        'previewable':True,
    }


def test_deepseek_uses_fresh_engine_session_after_restart_when_v4_session_exists(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    dsh_home = tmp_path / "shared-dsh"
    persisted = dsh_home / "sessions" / "project" / "session-existing"
    persisted.mkdir(parents=True)
    (persisted / "session.v4.jsonl.zstd").write_bytes(b"persisted")
    monkeypatch.setenv("DSH_HOME", str(dsh_home))
    used_sessions: list[str] = []

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, _prompt, *, session_id, on_notification):
            used_sessions.append(session_id)
            return SimpleNamespace(session_id=session_id, final_response="完成", events=[], notifications=[])

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream(
        "deepseek", "继续分析", [], session_key="session-existing", engine_session_id="session-existing"
    ))

    final = next(data for name, data in events if name == "final")
    assert used_sessions and used_sessions[0].startswith("session-")
    assert used_sessions[0] != "session-existing"
    assert final["engineSessionId"] == used_sessions[0]


def test_deepseek_continues_when_explicit_html_deliverable_is_missing(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "dsh"))
    calls: list[str] = []

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, prompt, *, session_id, on_notification):
            calls.append(prompt)
            if len(calls) == 1:
                return SimpleNamespace(
                    session_id=session_id,
                    final_response="数据校准已完成，页面将展示预测分布。",
                    events=[], notifications=[],
                )
            output = generated / "deepseek-nvda-forecast.html"
            output.write_text("<!doctype html><main>完成</main>", encoding="utf-8")
            return SimpleNamespace(
                session_id=session_id,
                final_response=(
                    f"[[AIME_CHART:{output}]]\n[[AIME_FILE:{output}]]\n"
                    "NVDA 概率预测页面已生成。\n"
                    "[[AIME_SKILLS:streamviz,custom-html-widget]]"
                ),
                events=[], notifications=[],
            )

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream(
        "deepseek",
        "生成一个完整、可交互、可独立运行的 HTML 股价预测页面",
        [],
        session_key="html-repair",
        reasoning_effort="low",
    ))

    assert len(calls) == 2
    assert "交付完整性修复" in calls[1]
    assert any(data.get("phase") == "html-deliverable-repair" for name, data in events if name == "status")
    final = next(data for name, data in events if name == "final")
    assert final["reportUrl"] == "/generated/deepseek-nvda-forecast.html"
    assert final["fileArtifacts"]


def test_deepseek_intermediate_turn_end_does_not_stop_the_run(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "shared-dsh"))
    closed = threading.Event()

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, _prompt, *, session_id, on_notification):
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "assistant/message", "data": {"message": {"content": [
                    {"type": "text", "text": "最终回答"}
                ]}}},
            }))
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "turn/end", "data": {"reason": {"kind": "completed"}}},
            }))
            on_notification(SimpleNamespace(method="session.event", payload={
                "sessionId": session_id,
                "event": {"type": "tool/call", "data": {
                    "callId": "after-turn", "name": "bash", "arguments": '{"command":"pwd"}'
                }},
            }))
            return SimpleNamespace(
                session_id=session_id,
                final_response="最终回答",
                events=[],
                notifications=[],
            )

        def close(self):
            closed.set()

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    events = list(client.stream("deepseek", "测试", [], session_key="session-turn-end"))

    final = next(data for name, data in events if name == "final")
    assert final["interpretation"] == "最终回答"
    assert final["engineSessionId"] == "session-turn-end"
    assert not closed.is_set()


def test_deepseek_stuck_run_times_out_and_closes_runtime(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "shared-dsh"))
    monkeypatch.setenv("AICHART_DEEPSEEK_RUN_TIMEOUT_SECONDS", "0.01")
    closed = threading.Event()

    class FakeHarness:
        def __init__(self, **_options):
            pass

        def run(self, _prompt, *, session_id, on_notification):
            closed.wait(1)
            raise RuntimeError("closed")

        def close(self):
            closed.set()

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=FakeHarness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    with pytest.raises(ReasoningFrameworkError, match="执行时限"):
        list(client.stream("deepseek", "测试", [], session_key="session-timeout"))
    assert closed.is_set()


def test_deepseek_streams_only_root_public_text_before_final(tmp_path, monkeypatch):
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "dsh"))

    class Harness:
        def __init__(self, **kwargs): pass
        def run(self, prompt, *, session_id, on_notification):
            for owner, blocks in [
                ("subagent-session", [{"type":"text","text":"private child message"}]),
                (session_id, [{"type":"thinking","text":"private reasoning"},{"type":"text","text":"公开分析正文"}]),
            ]:
                on_notification(SimpleNamespace(method="session.event", payload={"sessionId":owner,"event":{"type":"assistant/message","data":{"message":{"content":blocks}}}}))
            return SimpleNamespace(session_id=session_id, final_response="公开分析正文", events=[], notifications=[])
        def close(self): pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=Harness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    events = list(client.stream("deepseek", "测试", [], session_key="stream-public-text"))
    snapshots = [data for kind,data in events if kind=="answer_text"]
    assert [data["delta"] for data in snapshots] == ["公开分析正文"]
    assert next(i for i,(kind,_) in enumerate(events) if kind=="answer_text") < next(i for i,(kind,_) in enumerate(events) if kind=="final")


def test_execution_receipts_never_become_modules_fallbacks_or_explicit_charts(tmp_path):
    generated=tmp_path/'outputs'/'generated';generated.mkdir(parents=True)
    receipt=generated/'ds_review_artifact.html'
    receipt.write_text('<html><main data-artifact-type="data-transform"><h1>数据处理完成</h1></main></html>')
    chart=generated/'real-chart.html';chart.write_text('<html><body><svg></svg></body></html>')
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    output=[{'ok':True,'output':str(receipt)},{'ok':True,'output':str(chart)}]
    modules=client._html_modules_from_tool_output(output)
    assert len(modules)==1 and modules[0]['htmlUrl']=='/generated/real-chart.html'
    assert receipt.resolve() not in client._generated_html_snapshot()
    answer=f'正文\n[[AIME_CHART:{receipt}]]\n[[AIME_CHART:{chart}]]'
    final=client._artifact_payload('deepseek','测试',answer,'run','session')
    assert len(final['reportArtifacts'])==1 and final['reportArtifacts'][0]['url']=='/generated/real-chart.html'
    assert str(receipt) not in final['interpretation'] and '正文' in final['interpretation']
    only=client._artifact_payload('deepseek','测试',f'正文\n[[AIME_CHART:{receipt}]]','run','session')
    assert only['reportArtifacts']==[] and only['interpretation']=='正文'


def test_visualization_catalog_keeps_routing_bounded_and_semantic(tmp_path: Path) -> None:
    app = tmp_path / 'app'
    scripts = app / 'skills' / 'generic-chart' / 'scripts'
    schemas = scripts.parent / 'schemas'
    scripts.mkdir(parents=True)
    schemas.mkdir()
    registry = []
    for index in range(45):
        stem = f'chart_{index}'
        (scripts / f'{stem}.py').write_text('')
        (schemas / f'{stem}.schema.json').write_text(json.dumps({
            'purpose': 'Compare revenue over time',
            'semanticChannels': [{'channel': 'x', 'semantics': 'fiscal quarter'}, {'channel': 'y', 'semantics': 'reported revenue'}],
            'payloadShape': {'data': 'x' * 5000},
        }))
        registry.append({'script': f'{stem}.py', 'label': stem, 'description': 'verbose documentation ' * 300})
    (app / 'module_registry.json').write_text(json.dumps(registry))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'outputs')
    candidates = client._visualization_candidates()
    assert len(candidates) == 45
    assert sum(len(item['description']) for item in candidates) < 45 * 400
    assert all('fiscal quarter' in item['description'] and 'reported revenue' in item['description'] for item in candidates)


@pytest.mark.parametrize('bundled_tool', [False, True])
def test_deepseek_routes_execution_commentary_to_progress(tmp_path, monkeypatch, bundled_tool):
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    summary='我先读取 TradingView 组件规范，再加载苹果日线。'
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data,owner=None):
                on_notification(SimpleNamespace(method='session.event',payload={'sessionId':owner or session_id,'event':{'type':kind,'data':data}}))
            emit('assistant/message',{'message':{'channel':'analysis','content':[{'type':'text','text':'private reasoning'}]}})
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'child private text'}]}},owner='child-session')
            blocks=[{'type':'text','text':summary}]
            if bundled_tool:blocks.append({'type':'tool_use','id':'load','name':'bash','input':{'command':'cat SKILL.md'}})
            emit('assistant/message',{'message':{'content':blocks}})
            emit('tool/call',{'callId':'load','name':'bash','arguments':{'command':'cat SKILL.md'}})
            emit('assistant/message',{'message':{'content':[{'type':'text','text':'苹果日线已生成。'}]}})
            return SimpleNamespace(session_id=session_id,final_response='苹果日线已生成。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    events=list(LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated).stream('deepseek','用 TradingView 看苹果日线',[],session_key='progress-test'))
    progress=[d['text'] for k,d in events if k=='progress']
    assert progress==[]
    assert [d['delta'] for k,d in events if k=='answer_text']==[summary,'苹果日线已生成。']
    final=next(d for k,d in events if k=='final')
    assert summary in final['interpretation']
    assert 'private reasoning' not in str(events) and 'child private text' not in str(events)


def test_progress_never_invokes_an_auxiliary_model(tmp_path, monkeypatch):
    def forbidden(*args, **kwargs):
        pytest.fail('progress labeling must not call a model')
    monkeypatch.setenv('DEEPSEEK_API_KEY', 'fixture-not-secret')
    monkeypatch.setitem(sys.modules, 'openai', SimpleNamespace(OpenAI=forbidden))
    router = SimpleNamespace(configured=True, route=forbidden)
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path/'outputs', tool_activity_router=router)
    assert client._localized_progress('正在核对数据。', '分析市场') == '正在核对数据'
    assert client._localized_progress('Loading the chart.', '展示日线') == ''
    assert client._localized_progress('Loading the chart.', 'Show the chart') == 'Loading the chart.'
    assert client._jev_tool_thought_summary('bash', {'command': 'python tool.py'}) == ''
    assert client._jev_tool_thought_summary('bash', '{"thoughtSummary":"正在读取报价"}') == '正在读取报价'
    assert client._jev_tool_thought_summary('bash', 'invalid transport') == ''


def test_all_efforts_load_runtime_guard_and_effort_changes_use_separate_harnesses(tmp_path, monkeypatch):
    generated = tmp_path / 'outputs' / 'generated'
    generated.mkdir(parents=True)
    monkeypatch.setenv('DSH_HOME', str(tmp_path / 'dsh'))
    options = []

    class Harness:
        def __init__(self, **kwargs): options.append(kwargs)
        def run(self, prompt, *, session_id, on_notification):
            return SimpleNamespace(session_id=session_id, final_response='完成', events=[], notifications=[])
        def close(self): pass

    monkeypatch.setitem(sys.modules, 'deepseek_harness', SimpleNamespace(DeepSeekHarness=Harness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    for effort in ('high', 'low', 'low', 'high'):
        list(client.stream('deepseek', '复盘A股', [], session_key='same-session', reasoning_effort=effort))
    assert len(options) == 2
    assert options[0]['reasoning_effort'] == 'high'
    environment_patch = str(tmp_path / 'app' / 'dsh_tool_environment.cordis.yml')
    guard_patch = str(tmp_path / 'app' / 'dsh_lightweight.cordis.yml')
    assert options[0]['patches'] == (environment_patch, guard_patch)
    assert options[1]['reasoning_effort'] == 'low'
    assert options[1]['patches'] == (environment_patch, guard_patch)
    assert options[1]['env']['MENTORA_PROJECT_ROOT'] == str(tmp_path)
    client.close()


@pytest.mark.parametrize(
    ("requested_effort", "harness_effort"),
    (
        ("low", "low"),
        ("medium", "high"),
        ("high", "high"),
        ("xhigh", "high"),
        ("ultra", "max"),
    ),
)
def test_deepseek_flash_maps_ui_effort_to_supported_harness_effort(
    tmp_path, monkeypatch, requested_effort, harness_effort
):
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "dsh"))
    options = []

    class Harness:
        def __init__(self, **kwargs):
            options.append(kwargs)

        def run(self, prompt, *, session_id, on_notification):
            return SimpleNamespace(session_id=session_id, final_response="完成", events=[], notifications=[])

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=Harness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)

    list(
        client.stream(
            "deepseek",
            "复盘A股",
            [],
            session_key=f"effort-{requested_effort}",
            inference_model="deepseek-flash",
            reasoning_effort=requested_effort,
        )
    )

    assert options[0]["reasoning_effort"] == harness_effort
    client.close()


def test_low_effort_prompt_uses_shortest_sufficient_evidence_protocol(tmp_path, monkeypatch):
    generated = tmp_path / "outputs" / "generated"
    generated.mkdir(parents=True)
    monkeypatch.setenv("DSH_HOME", str(tmp_path / "dsh"))
    prompts = []

    class Harness:
        def __init__(self, **_kwargs):
            pass

        def run(self, prompt, *, session_id, on_notification):
            prompts.append(prompt)
            return SimpleNamespace(session_id=session_id, final_response="完成", events=[], notifications=[])

        def close(self):
            pass

    monkeypatch.setitem(sys.modules, "deepseek_harness", SimpleNamespace(DeepSeekHarness=Harness))
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    list(client.stream("deepseek", "分析市场", [], session_key="low-fast", reasoning_effort="low"))
    list(client.stream("deepseek", "分析市场", [], session_key="high-full", reasoning_effort="high"))

    assert "轻度档执行约束" in prompts[0]
    assert "最短的充分证据路径" in prompts[0]
    assert "才调用联网搜索" in prompts[0]
    assert "--transform-file" in prompts[0]
    assert "禁止让该工具再调用辅助模型" in prompts[0]
    assert "fullOutputPath" in prompts[0]
    assert "禁止 cat、read" in prompts[0]
    assert "轻度档执行约束" not in prompts[1]
    client.close()


def test_tool_metadata_uses_conversation_language_without_translation_call(tmp_path):
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path / 'outputs')
    english = 'Copy relative chart into delivery directory'
    chinese = '将图表复制到交付目录'
    assert client._localized_tool_summary('生成图表', english, chinese) == chinese
    assert client._localized_tool_summary('生成图表', english) == ''
    assert client._localized_tool_summary('Render a chart', english, chinese) == english
    prompt = client._prompt('deepseek', '生成图表', [], [])
    assert 'description、title、thoughtSummary 也是直接展示给用户的步骤标题' in prompt


def test_generated_file_stream_reaches_gateway_before_tool_result_and_final(tmp_path,monkeypatch):
    import os
    from app.streamviz_files import HtmlRenderStream
    generated=tmp_path/'outputs/generated';generated.mkdir(parents=True)
    output=generated/'report.html';finished=threading.Event()
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    class Harness:
        def __init__(self,**kwargs):self.options=kwargs
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            previous=os.environ.get('MENTORA_STREAMVIZ_EVENTS')
            os.environ['MENTORA_STREAMVIZ_EVENTS']=self.options['env']['MENTORA_STREAMVIZ_EVENTS']
            try:
                writer=HtmlRenderStream(output,'Report')
                writer.append('<section>Before complete</section>')
                on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':'tool/call','data':{'callId':'render','name':'bash','arguments':{'command':'render_streamviz.py'}}}}))
                assert finished.wait(3)
                output.write_text('<section>Before complete</section>');writer.finish();writer.close()
                return SimpleNamespace(session_id=session_id,final_response='完成',events=[],notifications=[])
            finally:
                if previous is None:os.environ.pop('MENTORA_STREAMVIZ_EVENTS',None)
                else:os.environ['MENTORA_STREAMVIZ_EVENTS']=previous
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    client=LocalAgentFrameworks(project_root=tmp_path,generated_dir=generated)
    stream=client.stream('deepseek','生成 HTML 报告',[],session_key='file-stream')
    try:
        first=[]
        for event,data in stream:
            first.append((event,data))
            if event=='visualization':break
        assert first[-1][1]['delta']=='<section>Before complete</section>'
        assert first[-1][1]['final'] is False and not output.exists()
        assert first[-1][1]['streamvizSource']=='generated-html-live'
    finally:finished.set()
    rest=list(stream)
    assert any(event=='visualization' and data.get('final') for event,data in rest)
    assert rest[-1][0]=='final'
    assert rest[-1][1]['fileArtifacts'][0]['type']=='HTML'
    client.close()


@pytest.mark.parametrize('data,message,observation,expected',[
    ({},{'isError':True},'',True),
    ({'exitCode':1},{},'',True),
    ({},{'source':{'exit_code':-9}},'',True),
    ({},{},'{"ok":false}\n[exit code: 1]',True),
    ({},{},'finished\n[exit code: 0]',False),
    ({},{},'discussion of exit code 1 is ordinary output',False),
])
def test_tool_result_failure_follows_execution_receipt(data,message,observation,expected):
    from app.reasoning_frameworks import _tool_result_failed
    assert _tool_result_failed(data,message,observation) is expected


def test_deepseek_shell_nonzero_result_closes_matching_running_tool(tmp_path,monkeypatch):
    monkeypatch.setenv('DSH_HOME',str(tmp_path/'dsh'))
    class Harness:
        def __init__(self,**kwargs):pass
        def close(self):pass
        def run(self,prompt,*,session_id,on_notification):
            def emit(kind,data):
                on_notification(SimpleNamespace(method='session.event',payload={'sessionId':session_id,'event':{'type':kind,'data':data}}))
            emit('tool/call',{'callId':'minute-test','name':'bash','arguments':{'command':'offline-minute-test'}})
            emit('tool/result',{'message':{'toolCallId':'minute-test','content':[{'type':'text','text':'{"ok":false,"error":"layout failed"}\n[exit code: 1]'}]}})
            return SimpleNamespace(session_id=session_id,final_response='执行失败，未生成图表。',events=[],notifications=[])
    monkeypatch.setitem(sys.modules,'deepseek_harness',SimpleNamespace(DeepSeekHarness=Harness))
    events=list(LocalAgentFrameworks(project_root=tmp_path,generated_dir=tmp_path/'generated').stream(
        'deepseek','离线软件测试',[],session_key='failed-tool-result'))
    phases=[d['phase'] for e,d in events if e=='tool_step' and d.get('callId')=='minute-test' and not d.get('semanticUpdate')]
    assert phases==['started','failed']


def test_prompt_current_calendar_context_overrides_stale_history(tmp_path, monkeypatch):
    import app.reasoning_frameworks as frameworks
    from datetime import datetime
    class Clock:
        @classmethod
        def now(cls, zone):
            return datetime(2026, 10, 29, 15, 0, tzinfo=zone)
    monkeypatch.setattr(frameworks, 'datetime', Clock)
    generated = tmp_path / 'generated'
    generated.mkdir()
    client = LocalAgentFrameworks(project_root=tmp_path, generated_dir=generated)
    for framework in ('codex', 'deepseek'):
        prompt = client._prompt(framework, '这个月表现最差的议员都是谁', [], [{'role':'assistant','text':'2025年排名'}])
        assert '2026-10-29T15:00:00+08:00' in prompt
        assert '本月是本月1日至今天' in prompt
        assert '保留问句的排序方向' in prompt
