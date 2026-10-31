import json
import re
from pathlib import Path
from app import artifact_upgrades as upgrades


def test_saved_inflation_map_preserves_data_and_theme_without_fetching(monkeypatch):
    native=upgrades._native_rating('inflation_map')
    monkeypatch.setattr(native,'fetch_data',lambda *a,**k:(_ for _ in ()).throw(AssertionError('Do not refetch saved data')))
    payload={'type':'inflation-map','title':'已保存的通胀观察','theme':'light','language':'zh-CN',
        'source':{'fetchedAt':'2026-10-31T00:00:00Z'},'countries':[
            {'countryCode':'RU','country':'Russia','inflationRate':9.92},
            {'countryCode':'FR','country':'France','inflationRate':None}]}
    old='<html data-theme="dark"><div class="note">灰色：无数据 · 低于 0% 使用最低色阶</div><script type="application/json" id="component-data">'+json.dumps(payload)+'</script></html>'
    result=upgrades.upgrade_inflation_map(old)
    assert 'data-inflation-map-ui="2"' in result
    assert 'class="note"' not in result and '灰色：无数据' not in result
    saved=json.loads(re.search(r'id="component-data">(.*?)</script>',result,re.S)[1])
    assert saved=={**payload,'theme':'dark'}
    assert upgrades.upgrade_inflation_map(result)==result
    assert 'artifact = upgrade_inflation_map(artifact)' in (Path(__file__).parents[1]/'app/presentation.py').read_text()


def test_inflation_upgrade_rejects_unrelated_or_invalid_saved_payloads():
    for document in ['<main>unrelated</main>','<div>inflation-map</div>',
        '<script id="component-data">{"type":"inflation-map",</script>',
        '<script id="component-data">{"type":"other","title":"inflation-map"}</script>',
        '<script id="component-data">{"type":"inflation-map","countries":null}</script>']:
        assert upgrades.upgrade_inflation_map(document)==document
