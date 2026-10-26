"""Saved charts upgrade only embedded evidence, not a new research request."""
import json
import re
from app.artifact_upgrades import upgrade_native_kline_runtime, _native_kline


def test_saved_v1_chart_upgrades_without_losing_line_ma_or_marks(monkeypatch):
    module=_native_kline()
    monkeypatch.setattr(module,'fetch_rows',lambda *a,**k:(_ for _ in ()).throw(AssertionError('No market requests')))
    rows=[dict(time=1700000000000+i*86400000,open=100,high=110,low=90,close=101,volume=1000) for i in range(20)]
    mark=dict(type='fib-retracement',period='1d',points=[dict(time=rows[2]['time'],price=90),dict(time=rows[10]['time'],price=110)],levels=[0,.5,1],levelColors=['#123456','#abcdef','#456789'],lineStyle='dotted')
    config=dict(code='TEST',name='Test',dataType='1d',klineType='line',ma=[5,20],annotations=[mark],themeMode='dark')
    old='<html><head></head><body><div class="kline-component"><canvas id="kline-canvas"></canvas></div><script>const config = '+json.dumps(config)+';\nconst dataByPeriod = '+json.dumps({'1d':rows})+';\n/* mentora:kline-config: old live-config renderer */</script></body></html>'
    upgraded=upgrade_native_kline_runtime(old)
    assert 'data-kline-drawings="2"' in upgraded
    updated=json.loads(re.search(r'const config = (\{[^\n]+\});',upgraded)[1])
    assert updated['klineType']=='line' and updated['ma']==[5,20]
    assert updated['annotations']==[mark]
    assert len(updated['annotationContract']['supportedTypes'])==43
    assert '<nav class="period-tabs"' not in upgraded
    assert upgrade_native_kline_runtime(upgraded)==upgraded
    assert '"close":101' in upgraded.replace(' ','')
