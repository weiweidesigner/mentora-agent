import json
from pathlib import Path
from app import artifact_upgrades as upgrades


def test_saved_bond_wrapper_upgrades_without_refetch_and_preserves_observations(monkeypatch):
    native = upgrades._native_rating('bond_scatter')
    monkeypatch.setattr(native, 'fetch_data', lambda *a, **k: (_ for _ in ()).throw(AssertionError('must not fetch')))
    payload = native.normalize({'status_code':0,'data':{
        'indicator':[{'id':'yield_to_maturity'},{'id':'end_interest_date'},{'id':'bond_ratio'}],
        'data':[{'symbol_code':'185:TEST','value':[{'v':23.47,'t':1793376120000},{'v':'2028-01-31'},{'v':6}]}]
    }})
    payload.update(language='zh-CN',theme='light',title='已保存的债券观察')
    original = json.loads(json.dumps(payload))
    old = '<html data-theme="dark"><script id="component-data" type="application/json">'+json.dumps({'payload':payload,'labels':{},'summary':{}})+'</script></html>'
    result = upgrades.upgrade_bond_scatter(old)
    assert 'data-bond-scatter-runtime="3"' in result
    assert '--qh-short:#203247' in result
    saved = json.loads(upgrades.re.search(r'id="component-data" type="application/json">(.*?)</script>',result,upgrades.re.S)[1])['payload']
    assert saved == {**original,'theme':'dark'}
    assert saved['bonds'][0]['ytm'] == 23.47
    assert upgrades.upgrade_bond_scatter(result) == result


def test_unrelated_invalid_and_direct_saved_payloads(monkeypatch):
    seen = []
    class Native:
        def render_html(self, payload):
            seen.append(payload)
            return '<html data-bond-scatter-runtime="3"></html>'
    monkeypatch.setattr(upgrades, '_native_rating', lambda name: Native())
    for document in ['<main>unrelated</main>', '<main>bond-scatter</main>', '<script id="component-data">{"type":"bond-scatter",</script>', '<script id="component-data">{"type":"other","name":"bond-scatter"}</script>']:
        assert upgrades.upgrade_bond_scatter(document) == document
    old = '<script id="component-data">{"type":"bond-scatter","bonds":[]}</script>'
    assert 'data-bond-scatter-runtime="3"' in upgrades.upgrade_bond_scatter(old)
    assert seen == [{'type':'bond-scatter','bonds':[]}]
    assert 'artifact = upgrade_bond_scatter(artifact)' in (Path(__file__).parents[1]/'app/presentation.py').read_text()
