"""Deterministic contract checks; fixtures are not market evidence."""
import datetime as dt
import json
import threading
from types import SimpleNamespace
from copy import deepcopy
import pytest
from app import hk_market_data as hk

NOW=dt.datetime(2026,10,25,15,tzinfo=dt.timezone.utc)
BARS=[['2026-10-22','10','11','12','9','100'],['2026-10-23','11','12','13','10','120']]

def response(monkeypatch,bars=None,**options):
    calls=[]
    payload=options.get('payload',dict(code=0,data={'hk00700':{'qfqday':deepcopy(BARS if bars is None else bars)}}))
    text=options.get('text',hk.CALLBACK+'='+json.dumps(payload)+';')
    def get(url,**kwargs):
        calls.append((url,kwargs));return SimpleNamespace(status_code=options.get('status',200),text=text)
    monkeypatch.setattr(hk.requests,'get',get)
    return calls

@pytest.mark.parametrize('value',['0700.HK','00700.hk','HKEX:700'])
def test_explicit_identity_adjustment_currency_and_permissions(monkeypatch,value):
    calls=response(monkeypatch)
    result=hk.fetch_history(value,as_of=NOW)
    assert result['symbol']=='0700.HK' and result['market']=='HK' and result['currency']=='HKD'
    assert result['adjusted'] is True and result['adjustment']=='forward'
    assert result['asOf']==result['expectedAsOf']=='2026-10-23' and result['stale'] is False
    assert result['researchOnly'] is True and result['executionAuthorized'] is False
    assert result['volumeUnit']=='provider-reported' and result['rows'][0]['volume']==100
    assert len(calls)==1 and calls[0][0]==hk.ENDPOINT
    assert calls[0][1]['params']['param'].startswith('hk00700,day,')
    assert calls[0][1]['params']['param'].endswith(',640,qfq')
    assert calls[0][1]['allow_redirects'] is False

@pytest.mark.parametrize('value',['700','ABC.HK','0000.HK','HKEX:AAPL','123456.HK','00700.HK;'])
def test_bad_or_ambiguous_identity_never_reaches_network(monkeypatch,value):
    monkeypatch.setattr(hk.requests,'get',lambda *_a,**_k:pytest.fail('must not call provider'))
    with pytest.raises(ValueError):hk.fetch_history(value,as_of=NOW)

@pytest.mark.parametrize('options',[
    {'status':403},{'status':302},{'text':'<html>blocked</html>'},
    {'payload':{'code':1,'data':{}}},
    {'payload':{'code':0,'data':{'hk09988':{'qfqday':BARS}}}},
    {'payload':{'code':0,'data':{'hk00700':{'day':BARS}}}},
])
def test_upstream_failure_identity_or_adjustment_mismatch_is_terminal(monkeypatch,options):
    calls=response(monkeypatch,**options)
    with pytest.raises(ValueError):hk.fetch_history('0700.HK',as_of=NOW)
    assert len(calls)==1

@pytest.mark.parametrize('bad',[
    ['2026-10-23','0','12','13','10','100'],
    ['2026-10-23','11','12','10','9','100'],
    ['2026-10-23','11','12','13','10','-1'],
    ['2026-10-23','11','NaN','13','10','100'],
])
def test_invalid_ohlcv_is_rejected_not_repaired(monkeypatch,bad):
    response(monkeypatch,[BARS[0],bad])
    with pytest.raises(ValueError):hk.fetch_history('0700.HK',as_of=NOW)

def test_duplicate_conflicts_fail_and_identical_duplicates_deduplicate(monkeypatch):
    response(monkeypatch,BARS+[BARS[1]])
    assert hk.fetch_history('0700.HK',as_of=NOW)['rowCount']==2
    response(monkeypatch,BARS+[['2026-10-23','11','11','13','10','100']])
    with pytest.raises(ValueError,match='冲突'):hk.fetch_history('0700.HK',as_of=NOW)

def test_unfinished_session_auction_weekend_and_future_are_excluded(monkeypatch):
    response(monkeypatch,BARS+[['2026-10-24','12','13','14','11','100'],['2026-10-26','12','13','14','11','100']])
    before=dt.datetime(2026,10,23,16,5,tzinfo=hk.HK)
    assert hk.fetch_history('0700.HK',as_of=before)['asOf']=='2026-10-22'
    after=before.replace(minute=10)
    assert hk.fetch_history('0700.HK',as_of=after)['asOf']=='2026-10-23'
    assert hk.fetch_history('0700.HK',as_of=NOW)['rowCount']==2

def test_half_day_uses_calendar_close_not_hardcoded_1600(monkeypatch):
    from app.day_tasks import calendar
    date=dt.date(2026,12,24)
    close=calendar('HK').session_close(date).to_pydatetime()
    response(monkeypatch,[['2026-12-23','10','11','12','9','100'],['2026-12-24','11','12','13','10','100']])
    assert hk.fetch_history('0700.HK',as_of=close+dt.timedelta(minutes=5))['asOf']=='2026-12-23'
    assert hk.fetch_history('0700.HK',as_of=close+dt.timedelta(minutes=10))['asOf']=='2026-12-24'

def test_stale_history_is_explicit_and_not_forward_filled(monkeypatch):
    response(monkeypatch,[BARS[0]])
    result=hk.fetch_history('0700.HK',as_of=NOW)
    assert result['stale'] is True and result['rowCount']==1
    assert result['expectedAsOf']=='2026-10-23' and result['asOf']=='2026-10-22'

def test_hub_reuses_canonical_hk_identity_without_us_fallback(monkeypatch):
    from app.portfolio_data import MarketDataHub
    hub=MarketDataHub.__new__(MarketDataHub);hub.guard=threading.Lock();hub.cache={}
    calls=[]
    monkeypatch.setattr(hk,'fetch_history',lambda s:calls.append(s) or dict(symbol=s,rows=[],currency='HKD'))
    assert hub.history('HKEX:700')['currency']=='HKD'
    assert hub.history('00700.HK')['symbol']=='0700.HK'
    assert calls==['0700.HK']

def test_research_read_and_backtest_accept_hk_but_orders_do_not(monkeypatch,tmp_path):
    from app.portfolio_skills import call
    from app.portfolio import PlanInput
    data=dict(symbol='0700.HK',rows=[],source='unit-fixture',market='HK',currency='HKD',researchOnly=True,executionAuthorized=False)
    service=SimpleNamespace(market=SimpleNamespace(history=lambda symbol:dict(data,symbol=symbol),favorite_quote=lambda symbol,fresh:dict(symbol=symbol,currency='HKD',tradable=False)))
    assert call(service,'owner','portfolio-data',{'operation':'history','symbol':'HKEX:700'})['symbol']=='0700.HK'
    result=call(service,'owner','portfolio-backtest',{'symbol':'00700.HK','strategy':'ma_cross'})
    assert result['status']=='insufficient' and result['currency']=='HKD' and result['executionAuthorized'] is False
    assert call(service,'owner','portfolio-data',{'operation':'quote','symbol':'HKEX:700'})['tradable'] is False
    from app.portfolio import Portfolio
    from test_portfolio import Feed
    paper=Portfolio(tmp_path,market=Feed())
    with pytest.raises(ValueError,match='尚未开放港股成交'):
        paper.make_plan('owner',PlanInput(symbol='0700.HK',side='buy',quantity=100))
    with paper.db() as db:assert db.execute('SELECT count(*) FROM plans').fetchone()[0]==0
