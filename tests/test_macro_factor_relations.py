import importlib.util
import json
from pathlib import Path
import subprocess
import sys

import pytest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / 'app/skills/macro-factor-relations/scripts/read_macro_relations.py'
spec = importlib.util.spec_from_file_location('macro_relations', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def source():
    return {'status_code': 0, 'data': {'factor_data': {
        'id': 'real:center', 'name': 'Inflation', 'category': 'db_indicator',
        'influencing': [{'id': 'abstract:1', 'name': 'Policy'}],
        'influenced': [{'id': 'abstract:2', 'name': 'Policy'}],
        'history': [[{'date': '2026-01-01', 'raw': 3, 'norm': .5}]],
        'forecast': [[{'date': '2027-01-01', 'raw': 999}]],
        'edges': [
            {'from': 'abstract:1', 'to': 'real:center', 'corr_sign': 'unknown', 'pass_score': None, 'relation_desc': 'source annotation'},
            {'from': 'real:center', 'to': 'abstract:2', 'corr_sign': '-', 'pass_score': .9, 'impact_delay_days': 30},
        ],
    }}}


def test_preserve_identity_signs_scores_and_exclude_numeric_series():
    result = module.normalize('relations', source(), 'real:center')
    assert [f['id'] for f in result['factors']] == ['real:center', 'abstract:1', 'abstract:2']
    assert result['edges'][0]['sourceLabel'] == 'unspecified'
    assert result['edges'][0]['pass_score'] is None
    assert result['edges'][0]['description'] == 'source annotation'
    assert result['edges'][1]['sourceLabel'] == 'negative_influence'
    assert result['edges'][1]['impact_delay_days'] == 30
    assert result['factors'][0]['category'] == 'db_indicator'
    assert '999' not in json.dumps(result)
    assert 'history' not in json.dumps(result)
    assert 'confidence' not in json.dumps(result)


@pytest.mark.parametrize('direction,index', [('influencing', 0), ('influenced', 1)])
def test_direction_uses_real_endpoints(direction, index):
    result = module.normalize('relations', source(), 'real:center', direction)
    assert len(result['edges']) == 1
    assert result['edges'][0]['from'] == source()['data']['factor_data']['edges'][index]['from']
    assert len(result['factors']) == 2


def test_dangling_edges_and_duplicate_names_are_not_repaired_with_invented_data():
    result = module.normalize('directory', {'status_code': 0, 'data': {
        'factors': [{'id': 'a', 'name': 'Same'}, {'id': 'b', 'name': 'Same'}],
        'edges': [{'from': 'a', 'to': 'missing', 'pass_score': .8}, {'from': 'a', 'to': 'missing', 'pass_score': 1}],
    }})
    assert len(result['factors']) == 2
    assert len(result['edges']) == 2
    assert result['quality']['danglingEdges'] == 2


@pytest.mark.parametrize('bad', [{'status_code': 5030}, {'status_code': 0, 'data': {}}, source()])
def test_source_errors_and_wrong_identity_fail(bad):
    with pytest.raises(ValueError):
        module.normalize('relations', bad, 'wrong-id')


def test_search_reuses_directory_offline_and_keeps_pagination(tmp_path):
    directory = tmp_path / 'directory.json'
    directory.write_text(json.dumps({'operation': 'directory', 'factors': [{'id': 'a', 'name': 'CPI'}, {'id': 'b', 'name': 'CPI'}], 'source': {'url': 'original', 'fetchedAt': 'then'}}))
    output = tmp_path / 'result.json'
    run = subprocess.run([sys.executable, str(SCRIPT), '--operation', 'search', '--query', 'cpi', '--directory-input', str(directory), '--limit', '1', '--output', str(output)], capture_output=True, text=True)
    assert run.returncode == 0, run.stdout + run.stderr
    result = json.loads(output.read_text())
    assert result['hasMore'] and result['total'] == 2
    assert result['source']['fetchedAt'] == 'then'
    assert result['factors'] == [{'id': 'a', 'name': 'CPI'}]


def test_live_registry_contract_and_semantic_discovery():
    from app.capability_index import CapabilityIndex
    from app.skill_runner import _registered_script
    assert _registered_script('read_macro_relations.py', ROOT)[0] == SCRIPT
    index = CapabilityIndex(ROOT)
    for query in ('哪些宏观因子影响通胀', '查询宏观因子的上下游关系', 'AInvest macro landscape'):
        assert 'read_macro_relations.py' in [m['script'] for m in index.shortlist(query).modules]


def test_malformed_edge_fails_before_direction_filtering():
    bad = source()
    bad['data']['factor_data']['edges'] = [None]
    with pytest.raises(ValueError, match='endpoint identity'):
        module.normalize('relations', bad, 'real:center', 'influencing')
