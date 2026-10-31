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
        def render_html(self,value):calls.append(value);return '<html data-macro-indicator-runtime="2"></html>'
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
        def render_html(self,payload):calls.append(payload);return '<html data-macro-indicator-runtime="2"></html>'
    monkeypatch.setattr(upgrades,'_native_rating',lambda name:Native())
    payload={'type':'macro-indicator','symbol':'AUINTR','history':[],'interactiveSource':True,'catalog':{'indicators':[{'code':'INTR'}]}}
    html='<html data-macro-indicator-runtime="1"><script id="component-data" type="application/json">'+json.dumps(payload)+'</script></html>'
    assert upgrades.upgrade_macro_indicator(html)!=html
    assert calls[0]['interactiveSource'] and calls[0]['catalog']==payload['catalog']
