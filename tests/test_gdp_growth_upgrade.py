import json
import re
from pathlib import Path
from app import artifact_upgrades as upgrades


def test_saved_gdp_table_spacing_upgrade_preserves_values_and_source(monkeypatch):
    native=upgrades._native_rating('gdp_growth')
    monkeypatch.setattr(native,'fetch_data',lambda *a,**k:(_ for _ in ()).throw(AssertionError('Do not refetch saved data')))
    payload={'type':'gdp-growth','title':'G20 GDP同比增长排名','theme':'light','language':'zh-CN',
        'source':{'fetchedAt':'2026-10-31T00:00:00Z'},'rows':[
            {'countryCode':'CN','country':'China','growthRate':4.5,'nominalGdp':19498039388043,'currency':'USD'}]}
    old='<html data-theme="dark"><script type="application/json" id="component-data">'+json.dumps(payload)+'</script></html>'
    result=upgrades.upgrade_gdp_growth(old)
    assert 'data-gdp-growth-ui="2"' in result
    saved=json.loads(re.search(r'id="component-data">(.*?)</script>',result,re.S)[1])
    assert saved=={**payload,'theme':'dark'}
    assert upgrades.upgrade_gdp_growth(result)==result
    assert 'artifact = upgrade_gdp_growth(artifact)' in (Path(__file__).parents[1]/'app/presentation.py').read_text()


def test_gdp_upgrade_does_not_modify_unrelated_or_invalid_artifacts():
    for document in ['<main>other</main>','<div>gdp-growth</div>',
        '<script id="component-data">{"type":"gdp-growth",</script>',
        '<script id="component-data">{"type":"other","title":"gdp-growth"}</script>',
        '<script id="component-data">{"type":"gdp-growth","rows":null}</script>']:
        assert upgrades.upgrade_gdp_growth(document)==document
