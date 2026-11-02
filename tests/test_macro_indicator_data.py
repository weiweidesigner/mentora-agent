import copy
import json
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import macro_indicator_data as module
from app import artifact_upgrades as upgrades


def test_selection_endpoint_validation_no_cache_sanitized_failure_and_unavailable(monkeypatch):
    calls=[]
    class Native:
        def fetch_data(self,args):
            calls.append(vars(args))
            if args.indicator=='SECRET':raise RuntimeError('private-cookie')
            return {'symbol':args.country+args.indicator}
        def normalize(self,raw):return {**raw,'history':[],'unavailable':True}
        def source_metadata(self,symbol):return {'provider':'AInvest','symbol':symbol}
    monkeypatch.setattr(module,'_native_rating',lambda name:Native())
    app=FastAPI();app.include_router(module.router);client=TestClient(app)
    result=client.get('/api/macro-indicator/data?country=AU&indicator=BBS&include_catalog=true')
    assert result.status_code==200 and result.headers['cache-control']=='no-store'
    assert result.json()['symbol']=='AUBBS' and result.json()['unavailable']
    assert calls[0]['include_catalog'] is True
    for query in ['country=AU&indicator=https://unsafe','country=unsafe&indicator=BOT','country=AU','country=AU&indicator=BOT&include_catalog=unsafe']:
        assert client.get('/api/macro-indicator/data?'+query).status_code==422
    result=client.get('/api/macro-indicator/data?country=AU&indicator=SECRET')
    assert result.status_code==502 and 'private-cookie' not in result.text
    assert client.get('/api/macro-indicator/data?country=US&indicator=UR').status_code==200 # Slot released.


def test_busy_source_is_bounded(monkeypatch):
    class Busy:
        def acquire(self,blocking=False):return False
    monkeypatch.setattr(module,'_slots',Busy())
    app=FastAPI();app.include_router(module.router)
    assert TestClient(app).get('/api/macro-indicator/data?country=US&indicator=UR').status_code==429


def test_saved_legacy_chart_upgrades_without_network_or_changing_source(monkeypatch):
    payload={'type':'us-interest-rate','symbol':'USINTR','unit':'%','history':[{'t':123,'v':4.6,'period':'source-date'}],'source':{'provider':'AInvest','historySampling':'year earliest'}}
    before=copy.deepcopy(payload);calls=[]
    class Native:
        def render_html(self,value):calls.append(value);return '<html data-macro-indicator-runtime="6"></html>'
    monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
    artifact='<html data-theme="dark"><script type="application/json" id="component-data">'+json.dumps(payload)+'</script></html>'
    result=upgrades.upgrade_macro_indicator(artifact)
    assert result!=artifact and len(calls)==1
    assert calls[0]['history']==before['history'] and calls[0]['source']==before['source']
    assert not calls[0]['interactiveSource'] and payload==before
    assert upgrades.upgrade_macro_indicator(result)==result


def test_previous_unified_artifact_preserves_user_selection_permission(monkeypatch):
    calls=[]
    class Native:
        def render_html(self,payload):calls.append(payload);return '<html data-macro-indicator-runtime="6"></html>'
    monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
    payload={'type':'macro-indicator','symbol':'AUINTR','history':[],'interactiveSource':True,'catalog':{'indicators':[{'code':'INTR'}]}}
    html='<html data-macro-indicator-runtime="1"><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>'
    assert upgrades.upgrade_macro_indicator(html)!=html
    assert calls[0]['interactiveSource'] and calls[0]['catalog']==payload['catalog']


def test_saved_chart_adopts_line_standard_and_removes_identity_ui_without_refetch():
    import re
    native=upgrades._native_rating('macro_indicator')
    payload={'type':'macro-indicator','symbol':'CAINTR','countryCode':'CA','country':'Canada','indicatorCode':'INTR','indicator':'Interest Rate','unit':'%','history':[{'t':1735689600000,'v':3.25,'period':'20250101'},{'t':1767225600000,'v':2.75,'period':'20260101'}],'source':{'provider':'AInvest','fetchedAt':'original-time'},'catalog':{'countries':[],'indicators':[]}}
    old='<html data-macro-indicator-runtime="3"><div class="macro-timeline"></div><circle class="macro-point"></circle><select class="macro-country"></select><span class="symbol">CAINTR</span><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>'
    result=upgrades.upgrade_macro_indicator(old)
    assert 'data-macro-indicator-runtime="6"' in result
    assert '<select' not in result and 'class="symbol"' not in result and 'macro-parameters' not in result
    assert 'macro-timeline' not in result and 'macro-point' not in result and 'macro-focus' not in result
    assert 'macro-tooltip-arrow' in result and 'macro-localization' in result
    saved=json.loads(re.search(r'<script[^>]*id="component-data"[^>]*>(.*?)</script>',result,re.S)[1])
    assert saved['history']==payload['history'] and saved['source']==payload['source']
    assert upgrades.upgrade_macro_indicator(result)==result


def test_saved_chinese_metric_tooltip_gets_localized_label_without_changing_source():
    import re
    payload={'type':'macro-indicator','symbol':'CAINTR','countryCode':'CA','country':'Canada','indicatorCode':'INTR','indicator':'Interest Rate','language':'zh-CN','unit':'%','history':[{'t':1767225600000,'v':4.25,'period':'20260101'}],'source':{'provider':'AInvest','fetchedAt':'unchanged-time'}}
    artifact='<html data-macro-indicator-runtime="4"><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>'
    result=upgrades.upgrade_macro_indicator(artifact)
    assert 'data-macro-indicator-runtime="6"' in result
    labels=json.loads(re.search(r'<script[^>]*id="macro-localization"[^>]*>(.*?)</script>',result,re.S)[1])
    assert labels['zh-CN']['indicator']=='利率' and labels['en']['indicator']=='Interest Rate'
    saved=json.loads(re.search(r'<script[^>]*id="component-data"[^>]*>(.*?)</script>',result,re.S)[1])
    assert saved['indicator']=='Interest Rate' and saved['history']==payload['history'] and saved['source']==payload['source']


def test_saved_previous_axis_runtime_is_refreshed_from_embedded_records(monkeypatch):
    calls=[]
    class Native:
        def render_html(self,payload):
            calls.append(payload)
            return '<html data-macro-indicator-runtime="6"></html>'
    monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
    payload={'type':'macro-indicator','history':[{'t':123,'v':14.6}],'unit':'%','source':{'provider':'AInvest'}}
    artifact='<html data-macro-indicator-runtime="5"><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>'
    assert 'data-macro-indicator-runtime="6"' in upgrades.upgrade_macro_indicator(artifact)
    assert calls[0]['history']==payload['history'] and calls[0]['source']==payload['source']


def test_static_saved_macro_case_uses_current_axis_runtime(tmp_path):
    from app.native_pine_artifacts import NativePineStaticFiles
    case=tmp_path/'cases'/'macro.html'
    case.parent.mkdir()
    payload={'type':'macro-indicator','symbol':'USINTR','unit':'%','history':[{'t':123,'v':.25},{'t':456,'v':14.6}],'source':{'provider':'AInvest'}}
    case.write_text('<html data-macro-indicator-runtime="5"><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>')
    app=FastAPI();app.mount('/static',NativePineStaticFiles(directory=tmp_path))
    response=TestClient(app).get('/static/cases/macro.html')
    assert response.status_code==200
    assert 'data-macro-indicator-runtime="6"' in response.text
    assert 'niceYScale(values,payload.unit)' in response.text
    assert response.headers['cache-control']=='no-store'
