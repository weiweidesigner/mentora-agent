import json
from pathlib import Path
from unittest.mock import patch

from app import main


ROOT = Path(__file__).parents[1]


def test_removed_yahoo_tool_is_not_installed_or_registered():
    assert not (ROOT / 'app/skills/yahoo-data').exists()
    assert not (ROOT / '.agents/skills/yahoo-data/SKILL.md').exists()
    assert not (ROOT / '.agents/skills/yahoo-data').exists()
    assert 'yahoo-market-data' not in (ROOT / 'requirements.txt').read_text()
    assert not (ROOT / 'yahoo-market-data.lock.json').exists()
    registry = json.loads((ROOT / 'app/module_registry.json').read_text())
    assert all(item['script'] != 'yahoo_data.py' for item in registry)
    assert 'yahoo_data.py' not in main.ALLOWED_COMPONENTS_BY_FILE
    assert not main.script_path_for_filename('yahoo_data.py').exists()


def test_legacy_security_lookup_never_requests_yahoo():
    main.yahoo_security_search_candidates.cache_clear()
    with patch.object(main.requests, 'get', side_effect=AssertionError('Yahoo must not be contacted')):
        assert main.yahoo_security_search_candidates('AAPL') == ()


def test_old_skill_selection_cannot_restore_yahoo():
    skills = main.enforce_skill_market_scope('AAPL K线', ['business-chart-recall', 'yahoo-data'])
    assert 'yahoo-data' not in skills


def test_advertised_tool_metadata_and_fallback_do_not_offer_removed_source():
    tool = next(item for item in main.AGENT_TOOL_METADATA if item.name == main.CHART_RECALL_TOOL)
    assert 'Yahoo' not in tool.description + tool.when_to_use
    for question in ['英国股票市值对比', '分析腾讯股价走势', '累计收益和单日涨跌', 'Yahoo 全球宏观数据']:
        assert 'yahoo-data' not in main.fallback_relevant_skill_names(question)
        assert 'yahoo-data' not in main.non_us_replacement_skill_names(question)


def test_general_agent_catalog_excludes_retired_tool_and_explains_only_real_failures(tmp_path):
    from app.reasoning_frameworks import LocalAgentFrameworks
    client = LocalAgentFrameworks(project_root=ROOT, generated_dir=tmp_path)
    assert 'yahoo-data:' not in client._skill_catalog()
    prompt = client._prompt('deepseek', '研究美债收益率', [], [])
    assert '不得把工具移除' in prompt
    assert '本轮真实工具回执' in prompt
