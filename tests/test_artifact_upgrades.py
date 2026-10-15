import html
import json

from app import presentation
from app.artifact_upgrades import _constant, _IntradayDocument, _native_multi_intraday, upgrade_legacy_intraday


def legacy_document():
    cards = []
    for symbol, price in [('SPY', 770), ('QQQ', 735), ('ASML', 1710), ('BAC', 49)]:
        config = {'code': symbol, 'name': symbol + ' · 2026-10-14', 'timeZone': 'America/New_York',
                  'subIndicators': ['VOL'], 'annotations': [], 'sources': {'1m': 'saved-source'}}
        rows = [{'time': '2026-10-14T09:30:00-04:00', 'open': price, 'high': price+1,
                 'low': price-1, 'close': price+.5, 'volume': 100}]
        child = '<script>const config = '+json.dumps(config)+';\nconst dataByPeriod = '+json.dumps({'1m': rows})+';</script>'
        cards.append('<iframe srcdoc="'+html.escape(child, quote=True)+'"></iframe>')
    return '<html lang="zh-CN"><main class="multi-intraday"><h2 class="multi-title">旧版多分时报告</h2>'+''.join(cards)+'</main></html>'


def test_upgrade_uses_saved_data_and_preserves_all_four_stocks(monkeypatch):
    native = _native_multi_intraday()
    def no_fetch(*args, **kwargs):
        raise AssertionError('Opening a saved report must not fetch new prices')
    monkeypatch.setattr(native.KLINE, 'fetch_rows', no_fetch)
    old = legacy_document()
    upgraded = upgrade_legacy_intraday(old, 'dark')
    assert 'data-mobile-columns="2"' in upgraded
    assert '旧版多分时报告' in upgraded
    before, after = _IntradayDocument(), _IntradayDocument()
    before.feed(old)
    after.feed(upgraded)
    assert len(after.frames) == 4
    for a, b in zip(before.frames, after.frames):
        assert _constant(a, 'config')['code'] == _constant(b, 'config')['code']
        for original, current in zip(_constant(a, 'dataByPeriod')['1m'], _constant(b, 'dataByPeriod')['1m']):
            for field in ['open', 'high', 'low', 'close', 'volume']:
                assert current[field] == original[field]
    assert upgrade_legacy_intraday(upgraded, 'dark') == upgraded
    assert upgrade_legacy_intraday('<p>Unrelated report</p>', 'dark') == '<p>Unrelated report</p>'


def test_share_route_upgrades_old_layout_without_overwriting_file(tmp_path, monkeypatch):
    original = legacy_document()
    path = tmp_path/'old-intraday.html'
    path.write_text(original)
    monkeypatch.setattr(presentation, 'GENERATED_DIR', tmp_path)
    response = presentation.share_streamviz_artifact(path.name, 'dark')
    assert 'data-mobile-columns="2"' in response.body.decode()
    assert path.read_text() == original
