from app import widget_library as lib


def test_starter_boards_use_real_rendered_widgets_with_asset_appropriate_components(monkeypatch,tmp_path):
    original=lib.build_widget
    monkeypatch.setattr(lib,'build_widget',lambda payload:original(payload,tmp_path))
    result=lib.default_boards()
    assert result['version']==1
    assert [b['title'] for b in result['boards']]==['股票','加密货币','外汇']
    assert [b['focusSymbol'] for b in result['boards']]==['NASDAQ:AAPL','BITSTAMP:BTCUSD','OANDA:EURUSD']
    for board in result['boards']:
        for card in board['cards']:
            text=(tmp_path/card['url'].split('/')[-1]).read_text()
            assert 'tv-config' in text
            assert 'TradingView' in text
            assert card['status']=='ready'
            for other in board['cards']:
                if other is card:continue
                assert card['x']>=other['x']+other['w'] or card['x']+card['w']<=other['x'] or card['y']>=other['y']+other['h'] or card['y']+card['h']<=other['y']
    assert 'tv-fundamental-data' in [c['component'] for c in result['boards'][0]['cards']]
    assert 'tv-fundamental-data' not in [c['component'] for c in result['boards'][1]['cards']]
    assert 'tv-forex-cross-rates' in [c['component'] for c in result['boards'][2]['cards']]
