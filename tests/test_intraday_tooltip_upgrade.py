import json
from app import artifact_upgrades


def test_saved_intraday_preserves_observations_and_theme(monkeypatch):
    payload = {'type': 'market-index-intraday', 'theme': 'light', 'series': [
        {'symbol': 'AAA', 'previousClose': 100, 'points': [
            {'time': 1793280600000, 'minute': 570, 'close': 99, 'changePct': -1}]}],
        'source': {'coverage': 'original'}, 'unavailable': ['BBB']}
    saved = '<html data-theme="dark"><script id="component-data">' + json.dumps(payload) + '</script></html>'
    class Native:
        def render_html(self, received):
            assert received == dict(payload, theme='dark')
            return '<svg data-intraday-tooltip="2"></svg>'
    monkeypatch.setattr(artifact_upgrades, '_native_rating', lambda name: Native())
    upgraded = artifact_upgrades.upgrade_market_index_intraday(saved)
    assert 'data-intraday-tooltip="2"' in upgraded
    assert artifact_upgrades.upgrade_market_index_intraday(upgraded) == upgraded


def test_other_saved_reports_are_unchanged():
    for source in ['<p>report</p>', '<script id="component-data">{"type":"market-heatmap"}</script>']:
        assert artifact_upgrades.upgrade_market_index_intraday(source) == source
