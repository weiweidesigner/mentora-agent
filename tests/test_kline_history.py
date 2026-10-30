import concurrent.futures
import threading
import time
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import kline_history as module


def row(date, close=12):
    return dict(time=date,open=10,high=14,low=9,close=close,volume=100)


@pytest.fixture(autouse=True)
def cache():
    module._cache.clear();module._pending.clear()


def adapter(monkeypatch, fetch):
    native=SimpleNamespace(fetch_rows=fetch,repair_zero_volume_rows=lambda rows:rows,
        aggregate_rows_for_period=lambda rows,period:rows,has_reliable_volume=lambda props,source:True)
    monkeypatch.setattr(module,'_native_kline',lambda:native)


def test_cursor_page_is_unrelated_to_initial_display_window(monkeypatch):
    calls=[]
    def fetch(props,symbol,period,limit):
        calls.append((props,symbol,period,limit))
        return [row('2026-01-03'),row('2026-01-01'),row('2026-01-02'),row('2026-01-02')],'ainvest'
    adapter(monkeypatch,fetch)
    cursor=module.timestamp('2026-01-03')
    result=module.history_page('AAPL','1d',cursor=cursor)
    assert [r['time'] for r in result['rows']]==['2026-01-01','2026-01-02']
    assert calls[0][0]['toDate']==cursor and 'fromDate' not in calls[0][0]
    assert calls[0][0]['fullHistory'] is False and calls[0][3]>500
    assert module.history_page('AAPL','1d',cursor=cursor)==result
    assert len(calls)==1


def test_forward_page_and_aggregated_period_use_correct_base_horizon(monkeypatch):
    calls=[];cursor=module.timestamp('2026-01-01')
    def fetch(props,symbol,period,limit):
        calls.append((props,period))
        return [row('2025-12-31'),row('2026-01-01'),row('2026-01-02')],'ainvest'
    adapter(monkeypatch,fetch)
    result=module.history_page('AAPL','4h',cursor=cursor,direction='after')
    assert [r['time'] for r in result['rows']]==['2026-01-02']
    assert calls[0][1]=='1h'
    assert calls[0][0]['toDate']==cursor+3600*800*1000


def test_invalid_prices_are_not_fabricated_and_empty_page_stops_paging(monkeypatch):
    adapter(monkeypatch,lambda *args:([row('2026-01-01',-1)],'ainvest'))
    assert module.history_page('AAPL','1d')['rows']==[]
    assert module.history_page('AAPL','1d')['hasMore'] is False


def test_duplicate_concurrent_requests_share_one_read(monkeypatch):
    started=threading.Event();release=threading.Event();calls=[]
    def read(*args):
        calls.append(args);started.set();release.wait(3)
        return {'rows':[row('2026-01-01')]}
    monkeypatch.setattr(module,'_read_page',read)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        a=pool.submit(module.history_page,'AAPL','1d');assert started.wait(2)
        b=pool.submit(module.history_page,'AAPL','1d');release.set()
        assert a.result()==b.result()
    assert len(calls)==1


def test_http_validation_and_retry_after_provider_failure(monkeypatch):
    app=FastAPI();app.include_router(module.router);client=TestClient(app)
    assert client.get('/api/kline/history',params={'symbol':'https://bad','period':'1d'}).status_code==422
    assert client.get('/api/kline/history',params={'symbol':'AAPL','period':'1y'}).status_code==422
    attempts=[]
    def read(*args):
        attempts.append(1)
        if len(attempts)==1:raise RuntimeError('provider secret')
        return {'rows':[row('2026-01-01')],'period':'1d'}
    monkeypatch.setattr(module,'_read_page',read)
    response=client.get('/api/kline/history',params={'symbol':'AAPL','period':'1d'})
    assert response.status_code==502 and 'secret' not in response.text
    assert client.get('/api/kline/history',params={'symbol':'AAPL','period':'1d'}).status_code==200
    assert len(attempts)==2


def test_timezone_cursor_preserves_the_instant():
    assert module.timestamp('2026-01-01T08:00:00+08:00')==module.timestamp('2026-01-01T00:00:00Z')


def test_sector_codes_use_native_provider_without_quote_cache(monkeypatch):
    calls=[]
    def fetch(props,symbol,period,limit):
        calls.append((props,symbol,period));return [row('2026-10-29')],'ainvest'
    adapter(monkeypatch,fetch)
    for _ in range(2):
        result=module.history_page('861077','1m',market='89')
        assert result['rows'] and result['source']=='ainvest'
    assert len(calls)==2 and all(c[0]['market']=='89' for c in calls)
    assert not module._cache
