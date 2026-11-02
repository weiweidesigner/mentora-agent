import json
from pathlib import Path

from app.reasoning_frameworks import LocalAgentFrameworks
from app import skill_runner


SOURCES = [{'title': 'AInvest Screener', 'url': 'https://www.ainvest.com/screener/'}]


def test_skill_documentation_links_are_not_tool_evidence():
    document = '<skill_content>The upstream client is [TradingView-Screener](https://github.com/shner-elmo/TradingView-Screener).</skill_content>'
    assert LocalAgentFrameworks._sources_from_value({'message': document}, include_markdown=False) == []


def test_successful_query_receipt_sources_survive_tool_envelopes():
    receipt = {'ok': True, 'observation': {'ok': True, 'sources': SOURCES}}
    envelope = {'message': {'content': [{'type': 'text', 'text': json.dumps(receipt)}]}}
    sources = LocalAgentFrameworks._sources_from_value(envelope, include_markdown=False)
    assert [s['url'] for s in sources] == ['https://www.ainvest.com/screener/']


def test_contract_examples_inputs_and_failed_reads_are_not_evidence():
    for receipt in [
        {'ok': True, 'agentContract': {'sources': SOURCES}, 'schema': {'examples': SOURCES}},
        {'arguments': {'url': 'https://www.ainvest.com/screener/'}},
        {'ok': False, 'sources': SOURCES},
        {'status': 'failed', 'output': {'sources': SOURCES}},
    ]:
        assert LocalAgentFrameworks._sources_from_value(receipt, include_markdown=False) == []


def test_explicit_answer_citations_remain_supported():
    sources = LocalAgentFrameworks._sources_from_value('[报道](https://example.com/article)')
    assert sources[0]['url'] == 'https://example.com/article'


def test_screener_contract_delivers_query_arguments_inline(capsys):
    assert skill_runner.main(['contract', '--script', 'screen.py']) == 0
    contract = json.loads(capsys.readouterr().out)
    agent = contract['agentContract']
    assert '--filters-json' in agent['arguments']
    assert '--asset' in agent['arguments']
    assert 'ranking-top-gainers' in agent['examples']['gainers']
    assert 'scope' in agent and 'provenance' in agent
