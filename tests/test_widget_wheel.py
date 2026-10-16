from app.widget_library import renderer
from app.artifact_upgrades import upgrade_widget_tradingview


def test_new_advanced_charts_disable_wheel_without_disabling_other_interactions():
    config=renderer().build_config('advanced-chart',symbol='NASDAQ:AAPL')
    document=renderer().render('advanced-chart',config,'行情',560,'zh-CN')
    served=upgrade_widget_tradingview(document)
    assert 'mouse_wheel_scale' in served and 'mouse_wheel_scroll' in served
    assert config['allow_symbol_change'] is True
    assert config['hide_top_toolbar'] is False
    assert 'disabled_features' not in renderer().build_config('market-data')


def test_historical_charts_disable_wheel_before_bootstrap_in_reports_and_canvas():
    source='<html><head></head><body><script id="tv-config" type="application/json">{"widget":"advanced-chart","config":{}}</script><script>loadChart()</script></body></html>'
    upgraded=upgrade_widget_tradingview(source)
    wheel=upgraded.split('<script data-widget-tv-wheel>')[1].split('</script>')[0]
    assert 'mouse_wheel_scale' in wheel and 'mouse_wheel_scroll' in wheel
    assert 'canvas' not in wheel
    assert upgraded.index('data-widget-tv-wheel')<upgraded.index('loadChart()')
