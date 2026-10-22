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
