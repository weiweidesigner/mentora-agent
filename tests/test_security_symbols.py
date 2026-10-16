import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import security_symbols as symbols, widget_library as lib

ROWS=[
 {'symbol':'NASDAQ:AAPL','name':'苹果','code':'AAPL','market':'us','exchange':'NASDAQ'},
 {'symbol':'HKEX:700','name':'腾讯控股','code':'700','market':'hk','exchange':'HKEX'},
 {'symbol':'HKEX:80700','name':'腾讯控股-R','code':'80700','market':'hk','exchange':'HKEX'},
 {'symbol':'SSE:600519','name':'贵州茅台','code':'600519','market':'cn','exchange':'SSE'},
]

@pytest.fixture
def candidates(monkeypatch):
 symbols._search.cache_clear()
 monkeypatch.setattr(symbols,'eastmoney_candidates',lambda query:ROWS)
 monkeypatch.setattr(symbols,'tradingview_candidates',lambda query,market:[])
 yield
 symbols._search.cache_clear()


def test_names_market_filter_and_exact_resolution(candidates):
 assert symbols.resolve_symbol('苹果','us')=='NASDAQ:AAPL'
 assert symbols.resolve_symbol('aapl','us')=='NASDAQ:AAPL'
 assert symbols.resolve_symbol('腾讯控股','hk')=='HKEX:700'
 assert [r['symbol'] for r in symbols.search_symbols('腾讯','hk')]==['HKEX:700','HKEX:80700']
 with pytest.raises(ValueError,match='多个'):symbols.resolve_symbol('腾讯','hk')

@pytest.mark.parametrize('value,market,expected',[
 ('00700','hk','HKEX:700'),('700','hk','HKEX:700'),('600519','cn','SSE:600519'),
 ('000001','cn','SZSE:000001'),('300750','cn','SZSE:300750'),('nyse:BABA','us','NYSE:BABA'),
])
def test_explicit_and_numeric_codes_do_not_need_remote_search(monkeypatch,value,market,expected):
 monkeypatch.setattr(symbols,'search_symbols',lambda *args:pytest.fail('unexpected lookup'))
 assert symbols.resolve_symbol(value,market)==expected


def test_eastmoney_identity_fields_and_hk_padding(monkeypatch):
 monkeypatch.setattr(symbols,'read_json',lambda url:{'QuotationCodeTable':{'Data':[
 {'Code':'00700','Name':'腾讯控股','Classify':'HK','JYS':'HK'},
 {'Code':'600519','Name':'贵州茅台','Classify':'AStock','JYS':'2'},
 {'Code':'BABA','Name':'阿里巴巴','Classify':'UsStock','JYS':'NYSE'},
 {'Code':'800001','Name':'不明市场','Classify':'AStock','JYS':'unknown'},
 ]}})
 assert [r['symbol'] for r in symbols.eastmoney_candidates('test')]==['HKEX:700','SSE:600519','NYSE:BABA']


def test_no_candidates_or_unavailable_provider_is_an_explicit_error(monkeypatch):
 monkeypatch.setattr(symbols,'search_symbols',lambda *args:[])
 with pytest.raises(ValueError,match='没有找到'):symbols.resolve_symbol('未知名称','us')
 with pytest.raises(ValueError,match='有效'):symbols.resolve_symbol('<script>','us')


def test_widget_endpoint_resolves_names_and_supports_multiple_listings(candidates,tmp_path):
 result=lib.build_widget(lib.TradingViewInput(widget='symbol-overview',symbols=['苹果','NASDAQ:AAPL'],symbolMarket='us'),tmp_path)
 assert result['config']['symbols']==[['NASDAQ:AAPL|1D']]
 result=lib.build_widget(lib.TradingViewInput(widget='advanced-chart',symbols=['00700'],symbolMarket='hk'),tmp_path)
 assert result['config']['symbol']=='HKEX:700'
 app=FastAPI();app.include_router(lib.router);client=TestClient(app)
 assert client.get('/api/widgets/symbols',params={'query':'腾讯','market':'hk'}).json()['results'][0]['symbol']=='HKEX:700'
 assert client.get('/api/widgets/symbols',params={'query':'苹果','market':'invalid'}).status_code==422


def test_listing_status_prefix_keeps_original_name_and_maps_issuer_alias(monkeypatch):
    item=symbols.candidate('SSE','688836','C宇树科技','cn','TradingView')
    assert item['name']=='C宇树科技'
    assert item['aliases']==['宇树科技']
    assert symbols.rank('宇树科技',item)==1
    monkeypatch.setattr(symbols,'search_symbols',lambda *args:[item,ROWS[-1]])
    assert symbols.resolve_symbol('宇树科技','auto')=='SSE:688836'
    assert 'aliases' not in symbols.candidate('NASDAQ','CAVA','CAVA Group','us','TradingView')


def test_verified_identity_fills_provider_gap_and_respects_market(monkeypatch):
    symbols._search.cache_clear()
    def unavailable(*args):raise OSError('provider unavailable')
    monkeypatch.setattr(symbols,'eastmoney_candidates',unavailable)
    monkeypatch.setattr(symbols,'tradingview_candidates',unavailable)
    try:
        assert symbols.resolve_symbol('宇树科技','auto')=='SSE:688836'
        assert symbols.search_symbols('宇树','cn')[0]['code']=='688836'
        assert symbols.verified_candidates('宇树','us')==[]
        with pytest.raises(ValueError,match='暂时不可用'):
            symbols.search_symbols('未知名称','auto')
    finally:symbols._search.cache_clear()
