from pathlib import Path
from app.reasoning_frameworks import LocalAgentFrameworks

def test_html_report_skill_is_discoverable_and_prompt_preserves_deliverable(tmp_path):
    root=Path(__file__).resolve().parents[1]
    client=LocalAgentFrameworks(project_root=root,generated_dir=tmp_path)
    catalog=client._skill_catalog(include_scripts=False)
    assert 'custom-html-widget:' in catalog
    prompt=client._prompt('deepseek','分析后写一个html报告',[],[])
    assert 'custom-html-widget' in prompt
    assert '静态报告同样适用' in prompt
    assert '不能只交付 Markdown' in prompt
    skill=(root/'app/skills/custom-html-widget/SKILL.md').read_text()
    assert 'app/skills/streamviz/scripts/render_streamviz.py' in skill
    assert (root/'app/skills/streamviz/scripts/render_streamviz.py').is_file()

def test_host_retrieval_candidates_do_not_become_fixed_research_steps(tmp_path):
    root=Path(__file__).resolve().parents[1]
    client=LocalAgentFrameworks(project_root=root, generated_dir=tmp_path)
    prompt=client._prompt('deepseek', '美股盘前催化剂，给我生成一个html', [], [])
    assert '候选集，不是写死路由' in prompt
    assert '你仍负责选择、组合或放弃' in prompt

def test_source_readiness_reports_available_search_routes(tmp_path, monkeypatch):
    skill=tmp_path/'app/skills/external-search/SKILL.md'
    skill.parent.mkdir(parents=True)
    skill.write_text('Provider route')
    monkeypatch.delenv('MOONSHOT_API_KEY', raising=False)
    monkeypatch.setenv('TAVILY_API_KEY', 'configured-fixture')
    monkeypatch.setenv('SERPER_API_KEY', 'configured-fixture')
    client=LocalAgentFrameworks(project_root=tmp_path, generated_dir=tmp_path/'outputs/generated')
    guidance=client._source_readiness_guidance()
    assert 'Tavily、Serper' in guidance
    assert 'external-search Skill' in guidance
    monkeypatch.setenv('MOONSHOT_API_KEY', 'fixture-not-a-secret')
    assert 'Tavily、Serper、Kimi' in client._source_readiness_guidance()
