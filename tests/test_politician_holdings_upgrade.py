import json
from pathlib import Path
from app import artifact_upgrades as m


def test_saved_holdings_upgrade_unhides_existing_rows_without_refetching(monkeypatch):
    from types import SimpleNamespace
    template=Path('app/skills/business-chart-recall/scripts/politician_holdings.py')
    import importlib.util
    spec=importlib.util.spec_from_file_location('native_holdings_upgrade_test',template);native=importlib.util.module_from_spec(spec);spec.loader.exec_module(native)
    monkeypatch.setattr(m,'_native_rating',lambda name:native)
    source='''<!doctype html><html lang="zh-CN"><head><style>old</style></head><body><main class="politician-holdings"><h2 data-business-title>Model title</h2><div class="profile-name">Person</div><div class="profile-meta">Republican / GA</div><table><tbody><tr data-row="0"><td>AMD 792</td></tr><tr data-row="1" hidden><td>NVDA 1039</td></tr></tbody></table><nav class="pagination">next</nav></main><script type="application/json" id="politician-holdings-meta">{"total":2,"fetchedAt":"2024-01-02T00:00:00+00:00"}</script><script>const config={"items":[],"labels":{"empty":"None"},"total":2};const oldCode=true;</script></body></html>'''
    result=m.upgrade_politician_holdings(source)
    assert 'class="pagination"' not in result and '<tr data-row="1">' in result
    assert 'AMD 792' in result and 'NVDA 1039' in result and 'Model title' in result
    assert '更新于：2024-01-02' in result and 'class="profile-name"' not in result
    assert 'oldCode' not in result and 'const config=' in result and 'max-height:460px' in result
    assert result==m.upgrade_politician_holdings(result)
