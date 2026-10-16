import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import widget_library as lib


def test_all_official_widgets_render_directly_without_model(tmp_path):
    for widget in lib.renderer().CATALOG:
        symbols = ['USD','EUR','JPY'] if widget in lib.CURRENCY_WIDGETS else ['easymarkets'] if widget in lib.BROKER_WIDGETS else [] if widget in lib.MARKETS else ['NASDAQ:AAPL', 'NASDAQ:MSFT'] if widget in lib.GROUPS else ['NASDAQ:AAPL']
        result = lib.build_widget(lib.TradingViewInput(widget=widget, symbols=symbols), tmp_path)
        assert result['mode'] == 'direct'
        document = (tmp_path/Path(result['url']).name).read_text()
        assert lib.renderer().CATALOG[widget]['script'] in document
        assert 'TradingView' in document
        assert result['config']['height'] == '100%'
        assert result['config']['locale'] == 'zh_CN'
        assert result['config'].get('theme', result['config'].get('colorTheme')) == 'dark'


def test_selected_market_group_shapes_and_content_reuse(tmp_path):
    screen = lib.build_widget(lib.TradingViewInput(widget='screener', market='hongkong'), tmp_path)
    assert screen['config']['market'] == 'hongkong'
    assert '港股' in screen['title']
    calendar = lib.build_widget(lib.TradingViewInput(widget='economic-calendar', market='us'), tmp_path)
    assert calendar['config']['countryFilter'] == 'us'
    request = lib.TradingViewInput(widget='market-data', symbols=['NASDAQ:AAPL','NASDAQ:NVDA','NASDAQ:AAPL'])
    result = lib.build_widget(request, tmp_path)
    assert result['config']['symbolsGroups'][0]['symbols'] == [{'name':'NASDAQ:AAPL'},{'name':'NASDAQ:NVDA'}]
    file = tmp_path/Path(result['url']).name
    before = file.stat().st_mtime_ns
    assert lib.build_widget(request, tmp_path)['url'] == result['url']
    assert file.stat().st_mtime_ns == before


@pytest.mark.parametrize('data',[
    {'widget':'not-a-widget'},
    {'widget':'single-ticker','symbols':[]},
    {'widget':'single-ticker','symbols':['AAPL','MSFT']},
    {'widget':'market-data','symbols':['<script>']},
    {'widget':'screener','symbols':['AAPL']},
    {'widget':'screener','market':'unsupported'},
])
def test_invalid_configuration_rejected(data, tmp_path):
    with pytest.raises(ValueError):
        lib.build_widget(lib.TradingViewInput(**data), tmp_path)


def test_http_endpoint_returns_artifact_without_chat_framework(monkeypatch, tmp_path):
    build = lib.build_widget
    monkeypatch.setattr(lib, 'build_widget', lambda payload: build(payload, tmp_path))
    app = FastAPI();app.include_router(lib.router)
    client = TestClient(app)
    result = client.post('/api/widgets/tradingview', json={'widget':'screener','market':'america'})
    assert result.status_code == 200
    assert result.json()['mode'] == 'direct'
    assert result.json()['config']['market'] == 'america'
    assert client.post('/api/widgets/tradingview',json={'widget':'unknown'}).status_code == 422


def test_intraday_preset_is_one_day_one_minute_and_preserves_identity(tmp_path):
    payload=lib.TradingViewInput(widget='symbol-overview',preset='intraday',symbols=['NASDAQ:AAPL'])
    result=lib.build_widget(payload,tmp_path)
    assert result['title']=='日内分时图 · NASDAQ:AAPL'
    assert result['config']['symbols']==[['NASDAQ:AAPL|1']]
    assert result['config']['dateRanges']==['1d|1']
    assert result['config']['chartType']=='area'
    assert result['config']['colorTheme']=='dark'
    document=(tmp_path/Path(result['url']).name).read_text()
    spec=json.loads(document.split('<script id="tv-config" type="application/json">')[1].split('</script>')[0])
    assert spec['preset']=='intraday'
    assert spec['script'].endswith('embed-widget-symbol-overview.js')
    with pytest.raises(ValueError):
        lib.build_widget(lib.TradingViewInput(widget='symbol-overview',preset='intraday',symbols=['NASDAQ:AAPL','NASDAQ:MSFT']),tmp_path)
    with pytest.raises(ValueError):
        lib.build_widget(lib.TradingViewInput(widget='advanced-chart',preset='intraday',symbols=['NASDAQ:AAPL']),tmp_path)


def test_official_directory_is_covered_in_renderer_and_library():
    skill = lib.ROOT/'app/skills/trading-view-chart'
    coverage = json.loads((skill/'widget-coverage.json').read_text())
    documented = {item['widget'] for item in coverage['widgets']}
    catalog = json.loads((lib.ROOT/'app/static/widget-catalog.json').read_text())
    assert len(documented) == 30
    assert documented == set(lib.renderer().CATALOG)
    assert documented == {item['widget'] for item in catalog if item.get('provider')=='TradingView'}
    assert len([item for item in catalog if item.get('provider')=='TradingView']) == 33


def test_currency_and_broker_inputs_do_not_resolve_as_stocks(monkeypatch, tmp_path):
    def unexpected_lookup(*args):
        raise AssertionError('Currency and broker inputs must not query stock search')
    monkeypatch.setattr(lib, 'resolve_symbol', unexpected_lookup)
    for widget in lib.CURRENCY_WIDGETS:
        result = lib.build_widget(lib.TradingViewInput(widget=widget,symbols=['usd','eur','USD','jpy']),tmp_path)
        assert result['config']['currencies'] == ['USD','EUR','JPY']
        default = lib.build_widget(lib.TradingViewInput(widget=widget),tmp_path)
        assert len(default['config']['currencies']) >= 2
        with pytest.raises(ValueError):
            lib.build_widget(lib.TradingViewInput(widget=widget,symbols=['AAPL','USD']),tmp_path)
    for widget in lib.BROKER_WIDGETS:
        result=lib.build_widget(lib.TradingViewInput(widget=widget,symbols=['EasyMarkets']),tmp_path)
        assert result['config']['broker']=='easymarkets'
        with pytest.raises(ValueError):
            lib.build_widget(lib.TradingViewInput(widget=widget,symbols=['<script>']),tmp_path)


@pytest.mark.parametrize('preset,market',[('forex','forex'),('crypto-pairs','crypto')])
def test_screener_presets_use_their_actual_market(preset, market, tmp_path):
    result=lib.build_widget(lib.TradingViewInput(widget='screener',preset=preset),tmp_path)
    assert result['config']['market']==market
    source=(tmp_path/Path(result['url']).name).read_text()
    assert json.loads(source.split('<script id="tv-config" type="application/json">')[1].split('</script>')[0])['preset']==preset


def test_global_overviews_include_asset_groups(tmp_path):
    overview=lib.build_widget(lib.TradingViewInput(widget='market-overview'),tmp_path)
    data=lib.build_widget(lib.TradingViewInput(widget='market-data'),tmp_path)
    assert len(overview['config']['tabs'])==4
    assert len(data['config']['symbolsGroups'])==4
    assert all(group['symbols'] for group in data['config']['symbolsGroups'])
