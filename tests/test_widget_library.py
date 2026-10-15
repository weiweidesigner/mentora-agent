import json
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app import widget_library as lib


def test_all_official_widgets_render_directly_without_model(tmp_path):
    for widget in lib.renderer().CATALOG:
        symbols = [] if widget in lib.MARKETS else ['NASDAQ:AAPL', 'NASDAQ:MSFT'] if widget in lib.GROUPS else ['NASDAQ:AAPL']
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
