"""Offline execution fixtures; never contact data providers or user accounts."""
import datetime as dt
import threading
from types import SimpleNamespace

import pytest

from app.portfolio import Portfolio,PlanInput,symbol_value,DEFAULTS
from app.portfolio_execution import ExecutionMarket,ExecutionWorkflow
from app.portfolio_data import MarketDataHub

NOW=dt.datetime(2026,10,26,3,tzinfo=dt.timezone.utc)

def market(monkeypatch):
    import app.portfolio_execution as module
    monkeypatch.setattr(module,'now',lambda:NOW)
    value=object.__new__(ExecutionMarket);value.guard=threading.Lock();value.cache={}
    monkeypatch.setattr('app.hk_market_data.fetch_snapshot',lambda *a,**k:dict(symbol='0700.HK',name='Tencent',market='HK',price=400,nativePrice=400,nativeCurrency='HKD',currency='HKD',priceAt=NOW.isoformat(),dateOnly=False,tradable=False,limitation='research quote',source='offline r_hk fixture',providerSymbol='r_hk00700'))
    monkeypatch.setattr(value,'hk_fx',lambda:dict(base='HKD',quote='USD',rate=.128,date='2026-10-23',source='offline fixture'))
    return value

@pytest.mark.parametrize('value',['0700.HK','00700.HK','HKEX:700'])
def test_hk_identity_and_unadjusted_execution_quote(monkeypatch,value):
    feed=market(monkeypatch);q=feed.quote(value)
    assert symbol_value(value)=='0700.HK'
    assert q['tradable'] is True and q['price']==51.2 and q['nativePrice']==400
    assert q['currency']=='USD' and q['nativeCurrency']=='HKD'
    assert q['providerSymbol']=='r_hk00700'
    assert q['lotSize']==1 and '整数股' in q['quantityRule']
    assert feed.favorite_quote('0700.HK')['tradable'] is True


def test_delayed_realtime_channel_does_not_bypass_execution_gate(monkeypatch):
    feed=market(monkeypatch)
    monkeypatch.setattr('app.hk_market_data.fetch_snapshot',lambda *a,**k:dict(symbol='0700.HK',market='HK',price=400,nativePrice=400,nativeCurrency='HKD',currency='HKD',priceAt=(NOW-dt.timedelta(minutes=15)).isoformat(),realTime=False,providerSymbol='r_hk00700'))
    quote=feed.quote('0700.HK',fresh=True)
    assert quote['tradable'] is False and '过期' in quote['limitation']


def test_fresh_hk_position_restores_account_and_us_gate_without_any_orders(tmp_path,monkeypatch):
    from app.portfolio_laya import gate
    feed=market(monkeypatch);p=Portfolio(tmp_path,market=feed);p.account('owner')
    import json
    stale=dict(feed.quote('0700.HK'),priceAt=(NOW-dt.timedelta(minutes=15)).isoformat())
    with p.db() as db:
        db.execute('INSERT INTO positions VALUES(?,?,?,?)',('owner','0700.HK',100,512000))
        db.execute('INSERT OR REPLACE INTO quotes VALUES(?,?,?)',('0700.HK',json.dumps(stale),NOW.isoformat()))
    assert p.summary('owner')['valuationComplete'] is False
    account=p.refresh('owner')
    assert account['valuationComplete'] is True and account['refreshFailures']==[]
    assert account['positions'][0]['quote']['providerSymbol']=='r_hk00700'
    item=dict(symbol='QQQ',quote=dict(price=100,currency='USD',tradable=True,priceAt=NOW.isoformat()))
    assert gate('entry',item,account)[0]==''
    assert account['trades']==[] and account['plans']==[]

def test_hk_stale_fx_stale_quote_and_wrong_conversion_block(monkeypatch):
    feed=market(monkeypatch);q=feed.quote('0700.HK')
    assert not feed.freshness(dict(q,priceAt=(NOW-dt.timedelta(minutes=4)).isoformat()))[0]
    assert not feed.freshness(dict(q,fx=dict(q['fx'],date='2026-10-01')))[0]
    assert not feed.freshness(dict(q,price=400))[0]
    assert not feed.freshness(dict(q,priceAt=(NOW+dt.timedelta(minutes=3)).isoformat()))[0]

def test_hk_closed_weekend_and_half_day_calendar(monkeypatch):
    import app.portfolio_execution as module
    feed=market(monkeypatch);q=feed.quote('0700.HK')
    monkeypatch.setattr(module,'now',lambda:dt.datetime(2026,10,25,3,tzinfo=dt.timezone.utc))
    friday=dt.datetime(2026,10,23,8,5,tzinfo=dt.timezone.utc)
    assert feed.freshness(dict(q,priceAt=friday.isoformat()))[0]
    assert not feed.freshness(dict(q,priceAt=dt.datetime(2026,10,22,8,tzinfo=dt.timezone.utc).isoformat()))[0]
    monkeypatch.setattr(module,'now',lambda:dt.datetime(2026,12,24,4,12,tzinfo=dt.timezone.utc))
    assert feed.freshness(dict(q,priceAt=dt.datetime(2026,12,24,4,5,tzinfo=dt.timezone.utc).isoformat(),fx=dict(q['fx'],date='2026-12-23')))[0]

def test_hk_plan_fill_idempotency_native_price_and_owner_isolation(tmp_path,monkeypatch):
    feed=market(monkeypatch);p=Portfolio(tmp_path,market=feed)
    p.setting('owner',dict(DEFAULTS,slippageBps=0,fee=0))
    plan=p.make_plan('owner',PlanInput(symbol='00700.HK',side='buy',quantity=100))
    with pytest.raises(ValueError):p.execute('other',plan['id'])
    trade=p.execute('owner',plan['id'])
    assert trade['symbol']=='0700.HK' and trade['nativePrice']==400 and trade['nativeCurrency']=='HKD'
    assert p.execute('owner',plan['id'])['id']==trade['id']
    summary=p.summary('owner')
    assert summary['cash']==1_000_000-5120 and len(summary['trades'])==1
    assert summary['positions'][0]['quantity']==100 and summary['equity']==1_000_000
    plan=p.make_plan('owner',PlanInput(symbol='0700.HK',side='sell',quantity=100))
    p.execute('owner',plan['id'])
    assert p.summary('owner')['cash']==1_000_000

def test_favorite_add_checks_identity_without_quote_and_is_idempotent(tmp_path,monkeypatch):
    feed=SimpleNamespace(quote=lambda *a,**k:pytest.fail('adding favorites must not fetch quotes'))
    p=Portfolio(tmp_path,market=feed)
    with p.db() as db:db.execute('INSERT INTO universe VALUES(?,?,?)',('AAPL','Apple','stocks'))
    import app.portfolio_execution as module
    calls=[]
    def search(code,market):calls.append((code,market));return [dict(code='00700',name='Tencent')]
    monkeypatch.setattr(module,'search_symbols',search)
    first=p.workflow.add_favorite('owner','AAPL')
    assert first['name']=='Apple' and first['quote'] is None and not calls
    hk=p.workflow.add_favorite('owner','HKEX:700')
    assert hk['symbol']=='0700.HK' and hk['name']=='Tencent'
    p.workflow.add_favorite('owner','0700.HK')
    assert len(calls)==1 and len(p.workflow.favorites('owner'))==2
    assert p.workflow.favorites('other')==[]
