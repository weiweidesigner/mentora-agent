from datetime import datetime
import importlib.util
from pathlib import Path
from types import SimpleNamespace

import pytest
import requests
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import ashare_live as service
from app import kline_history


def upstream():
    return {'code':'000001','name':'上证指数','trends':[
        f'2026-10-{day} {hour},10,11,12,9,2,220,11' for day in (22,23,26,27,28) for hour in ('09:31','09:32','13:01','15:00')]}


def test_index_identity_and_bare_shenzhen_stock_are_distinct():
    for code in ['000001.SH','000001.SS','SSE:000001','SH:000001']:
        assert service.normalize_symbol(code)=='000001.SH'
    assert service.normalize_symbol('000001')=='000001.SZ'
    assert service.normalize_symbol('399001.SZ')=='399001.SZ'
    with pytest.raises(ValueError):service.normalize_symbol('0700.HK')


def test_five_sessions_preserved_and_aggregation_never_crosses_dates_or_lunch():
    rows=service.normalize_trends(upstream(),datetime(2026,10,28,16,tzinfo=service.SHANGHAI),5)
    assert len(rows)==20 and rows[0]['volume']==200
    bars=service.aggregate(rows,60)
    days={datetime.fromtimestamp(b['time']/1000,service.SHANGHAI).date() for b in bars}
    assert len(days)==5
    assert all(b['volume']<=400 for b in bars)
    assert len(service.normalize_trends(upstream(),datetime(2026,10,28,16,tzinfo=service.SHANGHAI),5,'2026-10-23'))==4


def test_each_call_requests_upstream_no_stale_cache_and_parameters_are_exact(monkeypatch):
    calls=[]
    def get(url,**kwargs):
        calls.append((url,kwargs));return SimpleNamespace(raise_for_status=lambda:None,json=lambda:{'data':upstream()})
    monkeypatch.setattr(service.requests,'get',get)
    a=service.minute_snapshot('000001.SH',5);b=service.minute_snapshot('000001.SH',5)
    assert len(calls)==2 and a['dates']==b['dates']==['2026-10-22','2026-10-23','2026-10-26','2026-10-27','2026-10-28']
    assert calls[0][1]['params']['secid']=='1.000001'
    assert calls[0][1]['params']['ndays']=='5'
    assert a['cachePolicy']=='no-store'
    monkeypatch.setattr(service.requests,'get',lambda *a,**k:(_ for _ in ()).throw(requests.ConnectionError('down')))
    with pytest.raises(RuntimeError):service.minute_snapshot('000001.SH',5)


def test_partial_coverage_and_missing_dates_are_explicit(monkeypatch):
    data=upstream();data['trends']=data['trends'][-4:]
    monkeypatch.setattr(service,'fetch_source',lambda *args:data)
    result=service.minute_snapshot('000001.SH',5,interval='1m')
    assert result['dates']==['2026-10-28'] and result['coverageWarning']
    with pytest.raises(ValueError):service.minute_snapshot('000001.SH',5,'2026-10-23',interval='1m')


def test_http_no_store_and_kline_route_bypasses_memory_cache(monkeypatch):
    calls=[]
    def source(*args):calls.append(args);return upstream()
    monkeypatch.setattr(service,'fetch_source',source)
    app=FastAPI();app.include_router(service.router);app.include_router(kline_history.router);client=TestClient(app)
    for _ in range(2):
        r=client.get('/api/kline/history',params={'symbol':'000001.SH','period':'1m'})
        assert r.status_code==200 and r.headers['cache-control']=='no-store'
        assert r.json()['source']=='eastmoney' and len(r.json()['rows'])==20
    assert len(calls)==2
    assert client.get('/api/widgets/ashare-minute',params={'symbol':'000001.SH','days':6}).status_code==422


def test_registered_report_uses_separate_native_days_without_refetch(monkeypatch,tmp_path):
    calls=[]
    monkeypatch.setattr(service,'fetch_source',lambda *args:(calls.append(args) or upstream()))
    path=Path(__file__).parents[1]/'app/skills/ashare-minute/scripts/ashare_intraday.py'
    spec=importlib.util.spec_from_file_location('ashare_intraday_test',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    output=tmp_path/'index.html';receipt=module.build_report('000001.SH',output,days=5)
    assert len(calls)==1 and len(receipt['dates'])==5
    text=output.read_text();assert text.count('<iframe ')==5
    for date in receipt['dates']:assert date in text
    assert receipt['cachePolicy']=='no-store'
    assert list(tmp_path.iterdir())==[output]


def test_live_widget_owns_refresh_and_skill_shortlist_includes_index_minutes():
    from app.artifact_upgrades import sync_native_kline_theme
    from app.capability_index import CapabilityIndex
    from pathlib import Path
    document=sync_native_kline_theme(service.live_document('000001.SH'),'dark')
    assert 'const historyRequests = new Map();' not in document
    assert "'&days=1'" in document
    shortlist=CapabilityIndex(Path(__file__).resolve().parents[1]).shortlist('你把上证指数这一周的每天分时走势展示给我')
    assert 'ashare_intraday.py' in [item['script'] for item in shortlist.modules]


def test_auto_fallback_keeps_actual_resolution_and_can_provide_five_dates(monkeypatch,tmp_path):
    monkeypatch.setattr(service,'fetch_source',lambda *a:(_ for _ in ()).throw(requests.ConnectionError('closed')))
    calls=[]
    monkeypatch.setattr(service,'fetch_five_minute_source',lambda symbol:(calls.append(symbol) or upstream()))
    data=service.minute_snapshot('000001.SH',5)
    assert data['interval']=='5m' and '1m' not in data['dataByPeriod']
    assert len(data['dates'])==5 and data['resolutionNotice'] and len(calls)==1
    path=Path(__file__).parents[1]/'app/skills/ashare-minute/scripts/ashare_intraday.py'
    spec=importlib.util.spec_from_file_location('ashare_fallback_test',path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    receipt=module.build_report('000001.SH',tmp_path/'five.html')
    text=(tmp_path/'five.html').read_text();assert receipt['interval']=='5m' and '五分钟走势' in text
    import html,re,json
    children=[html.unescape(m) for m in re.findall(r'srcdoc="(.*?)"',text,re.S)]
    assert len(children)==5
    for child in children:
        config=json.JSONDecoder().raw_decode(child.split('const config = ',1)[1])[0]
        bars=json.JSONDecoder().raw_decode(child.split('const dataByPeriod = ',1)[1])[0]
        assert config['dataType']=='5m' and set(bars)=={'5m'}
    with pytest.raises(RuntimeError):service.minute_snapshot('000001.SH',5,interval='1m')


def test_auto_fallback_only_replaces_partial_minutes_when_more_dates_exist(monkeypatch):
    partial=upstream();partial['trends']=partial['trends'][-4:]
    monkeypatch.setattr(service,'fetch_source',lambda *a:partial)
    monkeypatch.setattr(service,'fetch_five_minute_source',lambda *a:upstream())
    assert service.minute_snapshot('000001.SH',5)['interval']=='5m'
    assert service.minute_snapshot('000001.SH',5,'2026-10-23')['dates']==['2026-10-23']
