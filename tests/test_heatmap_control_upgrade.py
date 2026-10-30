import json
from app import artifact_upgrades


def test_saved_heatmap_reuses_source_data_and_current_theme(monkeypatch):
    payload = {'type': 'market-heatmap', 'theme': 'light', 'rows': [
        {'symbol': 'AAA', 'size': 123, 'changePct': -1.25}], 'source': {'coverage': 'original'}}
    saved = '<html data-theme="dark"><button class="heatmap-settings-toggle"></button><script id="component-data">' + json.dumps(payload) + '</script></html>'
    class Native:
        def render_html(self, received):
            assert received == dict(payload, theme='dark')
            return '<div data-heatmap-menu="3">upgraded</div>'
    monkeypatch.setattr(artifact_upgrades, '_native_rating', lambda name: Native())
    upgraded = artifact_upgrades.upgrade_heatmap_controls(saved)
    assert 'data-heatmap-menu="3"' in upgraded
    assert artifact_upgrades.upgrade_heatmap_controls(upgraded) == upgraded


def test_unrelated_or_incomplete_saved_artifacts_stay_unchanged():
    for source in ['<p>report</p>', '<button class="heatmap-settings-toggle"></button>',
                   '<div class="heatmap-settings-toggle"></div><script id="component-data">{"type":"other"}</script>']:
        assert artifact_upgrades.upgrade_heatmap_controls(source) == source
