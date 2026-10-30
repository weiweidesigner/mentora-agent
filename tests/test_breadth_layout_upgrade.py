import json
from app import artifact_upgrades


def test_saved_breadth_preserves_counts_and_theme(monkeypatch):
    payload = {'type': 'market-breadth', 'theme': 'light', 'buckets': [
        {'label': '-3%', 'count': 1620, 'side': 'decliners'}],
        'totalAdvancers': 2783, 'totalDecliners': 1620, 'unchanged': 591}
    saved = '<html data-theme="dark"><script id="component-data">' + json.dumps(payload) + '</script></html>'
    class Native:
        def render_html(self, received):
            assert received == dict(payload, theme='dark')
            return '<svg data-breadth-layout="2"></svg>'
    monkeypatch.setattr(artifact_upgrades, '_native_rating', lambda name: Native())
    result = artifact_upgrades.upgrade_market_breadth(saved)
    assert 'data-breadth-layout="2"' in result
    assert artifact_upgrades.upgrade_market_breadth(result) == result


def test_other_reports_are_unchanged():
    source = '<script id="component-data">{"type":"market-heatmap"}</script>'
    assert artifact_upgrades.upgrade_market_breadth(source) == source
