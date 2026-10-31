import json
from pathlib import Path

from app.capability_index import CapabilityIndex


def _index(tmp_path: Path) -> CapabilityIndex:
    skills = {
        "business-chart-recall": "Render financial statements and market charts.",
        "generic-chart": "Render charts from user supplied structured data.",
        "external-search": "Search current external information and read URLs.",
        "streamviz": "Build streaming dashboards and interactive HTML.",
        "code-interpreter": "Clean, aggregate and transform CSV or JSON data.",
        "a-share-data": "Fetch A-share snapshots and historical market data.",
        "unrelated": "An unrelated capability that should stay out of focused context.",
    }
    for name, description in skills.items():
        path = tmp_path / ".agents/skills" / name / "SKILL.md"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"---\nname: {name}\ndescription: {description}\n---\n")
    modules = [
        {"name": "kline", "script": "kline.py", "label": "Kline", "description": "Candlestick market chart."},
        {"name": "income_statement", "script": "income_statement.py", "label": "Income Statement", "description": "Company income statement."},
        {"name": "external_info_search", "script": "external_info_search.py", "label": "External Search", "description": "Current web information."},
        {"name": "code_interpreter", "script": "code_interpreter.py", "label": "Code Interpreter", "description": "Transform CSV and JSON."},
        {"name": "grouped_bar", "script": "grouped_bar.py", "label": "Grouped Bar", "description": "Grouped bar chart."},
        {"name": "a_share_price_snapshot", "script": "price_snapshot.py", "label": "A-share Snapshot", "description": "Full-market A-share breadth and quote snapshot."},
        {"name": "bar_chart", "script": "bar_chart.py", "label": "Bar Chart", "description": "Rank and compare categories."},
    ]
    registry = tmp_path / "app/module_registry.json"
    registry.parent.mkdir(parents=True)
    registry.write_text(json.dumps(modules))
    for skill, script in [
        ("business-chart-recall", "kline.py"),
        ("business-chart-recall", "income_statement.py"),
        ("external-search", "external_info_search.py"),
        ("code-interpreter", "code_interpreter.py"),
        ("generic-chart", "grouped_bar.py"),
        ("a-share-data", "price_snapshot.py"),
        ("generic-chart", "bar_chart.py"),
    ]:
        path = tmp_path / "app/skills" / skill / "scripts" / script
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("")
    return CapabilityIndex(tmp_path)


def test_retrieval_is_system_wide_and_bounded(tmp_path):
    index = _index(tmp_path)
    cases = {
        "给SPY画5分钟K线": "kline.py",
        "搜索英伟达最新新闻": "external_info_search.py",
        "分析CSV并画分组柱状图": "grouped_bar.py",
        "看苹果的利润表": "income_statement.py",
    }
    for question, expected in cases.items():
        shortlist = index.shortlist(question)
        scripts = [item["script"] for item in shortlist.modules]
        assert expected in scripts
        assert len(shortlist.modules) <= 6
        assert len(shortlist.skills) <= 4
        assert "unrelated" not in [item["name"] for item in shortlist.skills]


def test_dashboard_retrieval_keeps_agent_free_to_combine_skills(tmp_path):
    shortlist = _index(tmp_path).shortlist("用Dashboard解释今晚市场为什么反弹")
    rendered = shortlist.render()
    assert "streamviz" in rendered
    assert "external_info_search.py" in rendered
    assert "候选集，不是写死路由" in rendered
    assert "选择、组合或放弃" in rendered


def test_a_share_market_summary_resolves_data_analysis_and_chart_contracts(tmp_path):
    shortlist = _index(tmp_path).shortlist("今天上午A股表现怎么样")
    scripts = [item["script"] for item in shortlist.modules]
    assert scripts[:3] == ["price_snapshot.py", "bar_chart.py", "code_interpreter.py"]
    rendered = shortlist.render()
    assert "每个最终选定的组件最多调用 contract 一次" in rendered
    assert "不用 --help、ls、cat、sed、grep" in rendered


def test_visualization_query_exposes_layout_without_forcing_numeric_rendering(tmp_path):
    index = _index(tmp_path)
    streamviz = tmp_path / "app/skills/streamviz/scripts/render_streamviz.py"
    streamviz.parent.mkdir(parents=True, exist_ok=True)
    streamviz.write_text("")
    modules = json.loads((tmp_path / "app/module_registry.json").read_text())
    modules.append({
        "name": "streamviz_render", "script": "render_streamviz.py",
        "label": "StreamViz", "description": "Validated dashboard templates.",
    })
    (tmp_path / "app/module_registry.json").write_text(json.dumps(modules))

    shortlist = CapabilityIndex(tmp_path).shortlist("可视化中美大模型竞争情况")

    assert "streamviz" in [item["name"] for item in shortlist.skills]
    assert "render_streamviz.py" in [item["script"] for item in shortlist.modules]
    rendered = shortlist.render()
    assert "标准数值趋势" in rendered
    assert "优先使用 StreamViz" not in rendered
    assert "chart_artifacts" in rendered


def test_congress_performance_ranking_questions_retrieve_native_component():
    index = CapabilityIndex(Path(__file__).resolve().parents[1])
    for question in ('这个月表现最差的议员都是谁', '本月表现最好的议员', '今年哪些美国议员投资收益最低', '今年以来美国议员投资表现排名'):
        shortlist = index.shortlist(question)
        assert 'congress_leaderboard.py' in [item['script'] for item in shortlist.modules], question


def test_us_macro_trends_retrieve_native_components():
    index = CapabilityIndex(Path(__file__).resolve().parents[1])
    for question, expected in [
        ('看看美国失业率走势', 'us_unemployment_rate.py'),
        ('看看美国利率变化', 'us_interest_rate.py'),
        ('看看美国贸易差额', 'us_trade_balance.py'),
    ]:
        shortlist = index.shortlist(question)
        scripts = [item['script'] for item in shortlist.modules]
        assert expected in scripts
        assert 'read_macro_data.py' not in scripts
