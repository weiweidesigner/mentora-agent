"""Offline ETF routing and same-session cache reconciliation regressions."""
import copy
import json
import threading
from types import SimpleNamespace
import pytest
from app.portfolio import Portfolio
from app.portfolio_data import MarketDataHub
from app.portfolio_execution import ExecutionMarket


def quote(symbol='TLT',change=.42,price=81.68,day='2026-10-26'):
    return dict(symbol=symbol,price=price,nativePrice=price,currency='USD',nativeCurrency='USD',priceDate=day,priceAt=day+'T16:00:00-04:00',dateOnly=True,changePct=change,source='offline ETF quote',sourceUrl='https://www.nasdaq.com/market-activity/etf/'+symbol.lower(),tradable=False,realTime=False)


def favorite(service,owner,symbol,observation):
    with service.db() as db:
        item=dict(symbol=symbol,name=symbol,quote=observation,created='fixture',updated='fixture')
        db.execute('INSERT INTO portfolio_favorites VALUES(?,?,?,?,?)',(owner,symbol,json.dumps(item),'fixture','fixture'))


def test_favorite_refresh_respects_directory_asset_type_and_updates_both_caches(tmp_path):
    calls=[]
    def fetch(symbol,asset='stocks',fresh=False):
        calls.append((symbol,asset,fresh));assert asset==('etf' if symbol=='TLT' else 'stocks')
        return quote(symbol,change=0 if symbol=='AAPL' else .42)
    service=Portfolio(tmp_path,market=SimpleNamespace(quote=fetch))
    with service.db() as db:
        db.executemany('INSERT INTO universe VALUES(?,?,?)',[('TLT','Bond ETF','etf'),('AAPL','Apple','stocks')])
    favorite(service,'owner','TLT',quote(change=None));favorite(service,'owner','AAPL',None)
    assert service.workflow.refresh_favorites('owner')==[]
    assert calls==[('TLT','etf',True),('AAPL','stocks',True)]
    items={item['symbol']:item for item in service.workflow.favorites('owner')}
    assert items['TLT']['quote']['changePct']==.42 and items['AAPL']['quote']['changePct']==0
    with service.db() as db:
        for row in db.execute('SELECT symbol,payload FROM quotes'):
            assert json.loads(row['payload'])['changePct']==items[row['symbol']]['quote']['changePct']


@pytest.mark.parametrize('difference',['none','date','price','currency','missing','zero'])
def test_read_only_cache_repair_requires_same_session_price_and_currency(tmp_path,difference):
    service=Portfolio(tmp_path,market=SimpleNamespace())
    old=quote(change=None);cached=quote()
    if difference=='date':cached=quote(day='2026-10-23')
    if difference=='price':cached=quote(price=82)
    if difference=='currency':cached.update(nativeCurrency='HKD',currency='HKD')
    if difference=='missing':cached['changePct']=None
    if difference=='zero':cached['changePct']=0
    favorite(service,'owner','TLT',old)
    with service.db() as db:db.execute('INSERT INTO quotes VALUES(?,?,?)',('TLT',json.dumps(cached),'fixture'))
    result=service.workflow.favorites('owner')[0]['quote']
    expected=0 if difference=='zero' else .42 if difference=='none' else None
    assert result['changePct']==expected and result['price']==old['price']
    assert result['priceAt']==old['priceAt'] and result['realTime'] is False
    with service.db() as db:assert json.loads(db.execute('SELECT payload FROM portfolio_favorites').fetchone()[0])['quote']==old
    assert service.workflow.favorites('other')==[]


def test_failed_refresh_retains_the_last_quote_and_reports_the_symbol(tmp_path):
    def unavailable(*args,**kwargs):raise ValueError('offline source unavailable')
    service=Portfolio(tmp_path,market=SimpleNamespace(quote=unavailable))
    old=quote();favorite(service,'owner','TLT',old)
    with service.db() as db:db.execute('INSERT INTO universe VALUES(?,?,?)',('TLT','ETF','etf'))
    assert service.workflow.refresh_favorites('owner')==['TLT']
    assert service.workflow.favorites('owner')[0]['quote']==old


def test_unlisted_favorites_keep_the_existing_display_route(tmp_path):
    calls=[]
    service=Portfolio(tmp_path,market=SimpleNamespace(favorite_quote=lambda symbol,fresh=False:(calls.append((symbol,fresh)),quote(symbol))[1]))
    favorite(service,'owner','NEW',None)
    assert service.workflow.refresh_favorites('owner')==[] and calls==[('NEW',True)]


@pytest.mark.parametrize('closes,expected',[([100,105],5),([100,95],-5),([100,100],0),([105],None),([0,105],None)])
def test_kline_fallback_change_is_computed_only_from_matching_daily_closes(monkeypatch,closes,expected):
    current=quote(change=None,price=closes[-1]);current.update(source='offline K-line',sourceUrl='https://quote.ainvest.com/')
    monkeypatch.setattr(MarketDataHub,'quote',lambda *args,**kwargs:copy.deepcopy(current))
    market=object.__new__(ExecutionMarket);market.guard=threading.Lock();market.cache={}
    rows=[dict(date='2026-10-'+str(26-len(closes)+1+index),close=value) for index,value in enumerate(closes)]
    market.history=lambda symbol:dict(rows=rows)
    result=market.quote('TLT','etf',True)
    assert result['changePct']==expected
    assert result['price']==current['price'] and result['tradable'] is False and result['realTime'] is False
    if expected is not None:assert result['changePctAsOf']=='2026-10-26' and result['changePctSource']=='offline K-line'


def test_kline_fallback_does_not_mix_a_different_price_or_overwrite_provider_change(monkeypatch):
    current=quote(change=None,price=105);current['sourceUrl']='https://quote.ainvest.com/'
    monkeypatch.setattr(MarketDataHub,'quote',lambda *args,**kwargs:dict(current))
    market=object.__new__(ExecutionMarket)
    market.history=lambda symbol:dict(rows=[dict(date='2026-10-23',close=100),dict(date='2026-10-26',close=106)])
    assert market.quote('TLT')['changePct'] is None
    current['changePct']=0
    market.history=lambda symbol:pytest.fail('provider change must not be recalculated')
    assert market.quote('TLT')['changePct']==0
