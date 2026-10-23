from pathlib import Path
from app import main

ROOT=Path(__file__).parents[1]


def test_independent_text_skill_is_not_installed_or_advertised():
    assert not (ROOT/'app/skills/advisor-text-generation/SKILL.md').exists()
    assert not (ROOT/'.agents/skills/advisor-text-generation/SKILL.md').exists()
    assert 'advisor_text_generation' not in {tool.name for tool in main.AGENT_TOOL_METADATA}
    assert 'advisor-text-generation' not in main.read_skill_metadata_catalog()
    assert 'advisor-text-generation' not in (ROOT/'AGENTS.md').read_text()


def test_skill_selection_and_tool_plan_do_not_add_a_text_generation_step():
    for question in ('分析 AAPL 最近走势','研究今天的市场新闻'):
        assert 'advisor-text-generation' not in main.fallback_relevant_skill_names(question)
    route={'steps':[{'script':'external_info_search.py','query':'market news','reason':'查询真实资讯'}]}
    plan=main.build_agent_plan('研究今天的市场新闻',route)
    assert plan.tool_calls
    assert all(call['tool']!='advisor_text_generation' for call in plan.tool_calls)


def test_current_agent_prompt_does_not_discover_the_retired_skill(tmp_path):
    from app.reasoning_frameworks import LocalAgentFrameworks
    client=LocalAgentFrameworks(project_root=ROOT,generated_dir=tmp_path)
    assert 'advisor-text-generation' not in client._skill_catalog()

