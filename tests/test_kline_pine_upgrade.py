import html
import json
import re
from pathlib import Path
from app.artifact_upgrades import upgrade_native_kline_pine


def fixture():
    return '''<html><div id="kline-canvas"></div><script>
const canvas = document.getElementById('kline-canvas');
  const tooltip = document.getElementById('kline-tooltip');
  const dataByPeriod = {"1d":[{"close":12.34}]};
    const priceScale = scale(minP, maxP, main.y + 16, main.h - 20);
    lastRenderState = { layout, all, slice, main, xOf, priceScale };
</script></html>'''


def test_legacy_upgrade_is_idempotent_and_preserves_market_data():
    updated = upgrade_native_kline_pine(fixture())
    assert "root.dataset.pineBridge = '1'" in updated
    assert 'const dataByPeriod = {"1d":[{"close":12.34}]};' in updated
    assert upgrade_native_kline_pine(updated) == updated


def test_upgrade_nested_srcdoc_and_ignore_unknown_renderers():
    nested = '<iframe srcdoc="'+html.escape(fixture(), quote=True)+'"></iframe>'
    assert 'pineBridge' in upgrade_native_kline_pine(nested)
    incomplete = fixture().replace('    lastRenderState = { layout, all, slice, main, xOf, priceScale };', '')
    assert upgrade_native_kline_pine(incomplete) == incomplete
    assert upgrade_native_kline_pine('<p>Other chart</p>') == '<p>Other chart</p>'


def test_static_inspiration_cases_get_same_bridge_and_host_editor(tmp_path):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from app.native_pine_artifacts import NativePineStaticFiles
    (tmp_path/'cases').mkdir()
    (tmp_path/'cases/chart.html').write_text(fixture())
    (tmp_path/'cases/other.html').write_text('<p>Other chart</p>')
    app=FastAPI();app.mount('/static',NativePineStaticFiles(directory=tmp_path))
    client=TestClient(app)
    chart=client.get('/static/cases/chart.html')
    assert chart.status_code==200
    assert 'root.dataset.pineBridge' in chart.text
    assert 'data-kline-pine-host' in chart.text
    assert chart.headers['cache-control']=='no-store'
    assert client.get('/static/cases/other.html').text=='<p>Other chart</p>'
    assert client.get('/static/cases/missing.html').status_code==404


def test_existing_kline_cases_keep_exact_data_and_annotations():
    root=Path(__file__).resolve().parents[1]
    records=json.loads((root/'tests/fixtures/kline-case-data.json').read_text())
    for record in records:
        original=(root/record['path']).read_text()
        updated=upgrade_native_kline_pine(original)
        assert 'root.dataset.pineBridge' in updated,record['path']
        pattern=r'^  const (?:config|dataByPeriod|lazyPagesByPeriod|labels) = .*;$'
        assert re.findall(pattern,updated,re.M)==re.findall(pattern,original,re.M)
